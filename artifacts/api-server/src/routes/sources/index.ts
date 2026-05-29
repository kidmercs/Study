import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, sourcesTable, flashcardsTable, questionsTable } from "@workspace/db";
import {
  CreateSourceBody,
  GetSourceParams,
  DeleteSourceParams,
  GetSourceResponse,
  ListSourcesResponse,
  GetStatsResponse,
} from "@workspace/api-zod";
import { processContent, extractVideoId } from "../../lib/processText";

const router: IRouter = Router();

async function fetchTranscript(videoId: string): Promise<string> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  const items = await YoutubeTranscript.fetchTranscript(videoId);
  return items.map((i: { text: string }) => i.text).join(" ");
}

async function fetchVideoMeta(videoId: string): Promise<{ title: string; thumbnail: string; channelName: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) throw new Error("oembed failed");
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: data.title ?? "Untitled Video",
      thumbnail: data.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelName: data.author_name ?? "",
    };
  } catch {
    return {
      title: "YouTube Video",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelName: "",
    };
  }
}

async function saveProcessedContent(
  sourceId: number,
  result: Awaited<ReturnType<typeof processContent>>
) {
  const { summary, flashcards: cards, mindMap, practiceQuestions } = result;

  await db
    .update(sourcesTable)
    .set({ summary, mindMap: mindMap ? JSON.stringify(mindMap) : null, status: "done" })
    .where(eq(sourcesTable.id, sourceId));

  if (cards.length > 0) {
    await db.insert(flashcardsTable).values(
      cards.map((c) => ({ sourceId, question: c.question, answer: c.answer }))
    );
  }

  if (practiceQuestions.length > 0) {
    await db.insert(questionsTable).values(
      practiceQuestions.map((q) => ({
        sourceId,
        question: q.question,
        options: JSON.stringify(q.options),
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      }))
    );
  }
}

router.get("/sources", async (req, res): Promise<void> => {
  const rows = await db.select().from(sourcesTable).orderBy(sql`${sourcesTable.createdAt} desc`);

  const flashcardCounts = await db
    .select({
      sourceId: flashcardsTable.sourceId,
      total: sql<number>`count(*)`.mapWith(Number),
      known: sql<number>`count(*) filter (where ${flashcardsTable.known} = true)`.mapWith(Number),
    })
    .from(flashcardsTable)
    .groupBy(flashcardsTable.sourceId);

  const countMap = new Map(flashcardCounts.map((r) => [r.sourceId, { total: r.total, known: r.known }]));

  const result = rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    youtubeUrl: r.youtubeUrl ?? null,
    videoId: r.videoId ?? null,
    title: r.title,
    thumbnail: r.thumbnail ?? null,
    channelName: r.channelName ?? null,
    status: r.status,
    errorMessage: r.errorMessage ?? null,
    flashcardCount: countMap.get(r.id)?.total ?? 0,
    knownCount: countMap.get(r.id)?.known ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(ListSourcesResponse.parse(result));
});

router.post("/sources", async (req, res): Promise<void> => {
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sourceType, youtubeUrl, textTitle, textContent, maxFlashcards, maxQuestions, generateFlashcards, generateMindMap, generateQuiz } = parsed.data;
  const processOptions = {
    generateFlashcards: generateFlashcards ?? true,
    generateMindMap: generateMindMap ?? true,
    generateQuiz: generateQuiz ?? true,
    maxFlashcards: Math.min(100, Math.max(5, maxFlashcards ?? 10)),
    maxQuestions: Math.min(20, Math.max(3, maxQuestions ?? 5)),
  };

  if (sourceType === "youtube") {
    if (!youtubeUrl) {
      res.status(400).json({ error: "youtubeUrl is required for youtube source" });
      return;
    }
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      res.status(400).json({ error: "Invalid YouTube URL" });
      return;
    }

    const [source] = await db
      .insert(sourcesTable)
      .values({ sourceType: "youtube", youtubeUrl, videoId, title: "Loading...", status: "processing" })
      .returning();

    res.status(201).json({
      id: source.id,
      sourceType: source.sourceType,
      youtubeUrl: source.youtubeUrl ?? null,
      videoId: source.videoId ?? null,
      title: source.title,
      thumbnail: source.thumbnail ?? null,
      channelName: source.channelName ?? null,
      status: source.status,
      errorMessage: source.errorMessage ?? null,
      flashcardCount: 0,
      knownCount: 0,
      createdAt: source.createdAt.toISOString(),
    });

    setImmediate(async () => {
      try {
        const [meta, transcript] = await Promise.all([
          fetchVideoMeta(videoId),
          fetchTranscript(videoId),
        ]);
        const result = await processContent(transcript, processOptions);

        await db
          .update(sourcesTable)
          .set({ title: meta.title, thumbnail: meta.thumbnail, channelName: meta.channelName })
          .where(eq(sourcesTable.id, source.id));

        await saveProcessedContent(source.id, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const friendly = msg.includes("503") || msg.includes("UNAVAILABLE")
          ? "Gemini is temporarily overloaded. Please retry in a moment."
          : msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
          ? "API rate limit reached. Please wait a minute before retrying."
          : msg.slice(0, 200);
        await db
          .update(sourcesTable)
          .set({ status: "error", errorMessage: friendly, title: "Error processing video" })
          .where(eq(sourcesTable.id, source.id));
      }
    });

    return;
  }

  // Text or PDF source
  if (!textTitle || !textContent) {
    res.status(400).json({ error: "textTitle and textContent are required for text/pdf source" });
    return;
  }

  const [source] = await db
    .insert(sourcesTable)
    .values({ sourceType, title: textTitle, rawText: textContent, status: "processing" })
    .returning();

  res.status(201).json({
    id: source.id,
    sourceType: source.sourceType,
    youtubeUrl: source.youtubeUrl ?? null,
    videoId: source.videoId ?? null,
    title: source.title,
    thumbnail: source.thumbnail ?? null,
    channelName: source.channelName ?? null,
    status: source.status,
    errorMessage: source.errorMessage ?? null,
    flashcardCount: 0,
    knownCount: 0,
    createdAt: source.createdAt.toISOString(),
  });

  setImmediate(async () => {
    try {
      const result = await processContent(textContent, processOptions);
      await saveProcessedContent(source.id, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = msg.includes("503") || msg.includes("UNAVAILABLE")
        ? "Gemini is temporarily overloaded. Please retry in a moment."
        : msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
        ? "API rate limit reached. Please wait a minute before retrying."
        : msg.slice(0, 200);
      await db
        .update(sourcesTable)
        .set({ status: "error", errorMessage: friendly })
        .where(eq(sourcesTable.id, source.id));
    }
  });
});

router.get("/sources/:id", async (req, res): Promise<void> => {
  const params = GetSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, params.data.id));
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const cards = await db
    .select()
    .from(flashcardsTable)
    .where(eq(flashcardsTable.sourceId, source.id))
    .orderBy(flashcardsTable.createdAt);

  const qs = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.sourceId, source.id))
    .orderBy(questionsTable.createdAt);

  const knownCount = cards.filter((c) => c.known).length;

  res.json(
    GetSourceResponse.parse({
      id: source.id,
      sourceType: source.sourceType,
      youtubeUrl: source.youtubeUrl ?? null,
      videoId: source.videoId ?? null,
      title: source.title,
      thumbnail: source.thumbnail ?? null,
      channelName: source.channelName ?? null,
      status: source.status,
      errorMessage: source.errorMessage ?? null,
      summary: source.summary ?? null,
      mindMap: source.mindMap ?? null,
      flashcardCount: cards.length,
      knownCount,
      createdAt: source.createdAt.toISOString(),
      flashcards: cards.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        question: c.question,
        answer: c.answer,
        known: c.known,
        reviewCount: c.reviewCount,
        createdAt: c.createdAt.toISOString(),
      })),
      questions: qs.map((q) => ({
        id: q.id,
        sourceId: q.sourceId,
        question: q.question,
        options: JSON.parse(q.options) as string[],
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        createdAt: q.createdAt.toISOString(),
      })),
    })
  );
});

router.post("/sources/:id/retry", async (req, res): Promise<void> => {
  const params = GetSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, params.data.id));
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (source.status === "processing") {
    res.status(409).json({ error: "Source is already processing" });
    return;
  }

  await db
    .update(sourcesTable)
    .set({ status: "processing", errorMessage: null })
    .where(eq(sourcesTable.id, source.id));

  res.json({ ok: true });

  setImmediate(async () => {
    try {
      const retryOptions = { generateFlashcards: true, generateMindMap: true, generateQuiz: true, maxFlashcards: 10, maxQuestions: 5 };

      if (source.sourceType === "youtube") {
        const videoId = source.videoId!;
        const [meta, transcript] = await Promise.all([
          fetchVideoMeta(videoId),
          fetchTranscript(videoId),
        ]);
        await db
          .update(sourcesTable)
          .set({ title: meta.title, thumbnail: meta.thumbnail, channelName: meta.channelName })
          .where(eq(sourcesTable.id, source.id));

        await db.delete(flashcardsTable).where(eq(flashcardsTable.sourceId, source.id));
        await db.delete(questionsTable).where(eq(questionsTable.sourceId, source.id));
        const result = await processContent(transcript, retryOptions);
        await saveProcessedContent(source.id, result);
      } else {
        const text = source.rawText ?? "";
        await db.delete(flashcardsTable).where(eq(flashcardsTable.sourceId, source.id));
        await db.delete(questionsTable).where(eq(questionsTable.sourceId, source.id));
        const result = await processContent(text, retryOptions);
        await saveProcessedContent(source.id, result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = msg.includes("503") || msg.includes("UNAVAILABLE")
        ? "Gemini is temporarily overloaded. Please retry in a moment."
        : msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
        ? "API rate limit reached. Please wait a minute before retrying."
        : msg.slice(0, 200);
      await db
        .update(sourcesTable)
        .set({ status: "error", errorMessage: friendly })
        .where(eq(sourcesTable.id, source.id));
    }
  });
});

router.delete("/sources/:id", async (req, res): Promise<void> => {
  const params = DeleteSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(sourcesTable)
    .where(eq(sourcesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/stats", async (_req, res): Promise<void> => {
  const [sourcesCount] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(sourcesTable);

  const [doneCount] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(sourcesTable)
    .where(eq(sourcesTable.status, "done"));

  const [flashcardStats] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      known: sql<number>`count(*) filter (where ${flashcardsTable.known} = true)`.mapWith(Number),
    })
    .from(flashcardsTable);

  res.json(
    GetStatsResponse.parse({
      totalSources: sourcesCount?.total ?? 0,
      totalFlashcards: flashcardStats?.total ?? 0,
      knownFlashcards: flashcardStats?.known ?? 0,
      unknownFlashcards: (flashcardStats?.total ?? 0) - (flashcardStats?.known ?? 0),
      sourcesProcessed: doneCount?.total ?? 0,
    })
  );
});

export default router;
