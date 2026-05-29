import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, sourcesTable, flashcardsTable } from "@workspace/db";
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
  // Dynamically import youtube-transcript (ESM compatible)
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

  const { sourceType, youtubeUrl, textTitle, textContent, maxFlashcards } = parsed.data;
  const cardLimit = Math.min(100, Math.max(5, maxFlashcards ?? 10));

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

    // Process async
    setImmediate(async () => {
      try {
        const [meta, transcript] = await Promise.all([
          fetchVideoMeta(videoId),
          fetchTranscript(videoId),
        ]);
        const { summary, flashcards: cards } = await processContent(transcript, cardLimit);

        await db
          .update(sourcesTable)
          .set({ title: meta.title, thumbnail: meta.thumbnail, channelName: meta.channelName, summary, status: "done" })
          .where(eq(sourcesTable.id, source.id));

        if (cards.length > 0) {
          await db.insert(flashcardsTable).values(
            cards.map((c) => ({ sourceId: source.id, question: c.question, answer: c.answer }))
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(sourcesTable)
          .set({ status: "error", errorMessage: msg, title: "Error processing video" })
          .where(eq(sourcesTable.id, source.id));
      }
    });

    return;
  }

  // Text source
  if (!textTitle || !textContent) {
    res.status(400).json({ error: "textTitle and textContent are required for text source" });
    return;
  }

  const { summary, flashcards: cards } = await processContent(textContent, cardLimit);

  const [source] = await db
    .insert(sourcesTable)
    .values({ sourceType: "text", title: textTitle, rawText: textContent, summary, status: "done" })
    .returning();

  if (cards.length > 0) {
    await db.insert(flashcardsTable).values(
      cards.map((c) => ({ sourceId: source.id, question: c.question, answer: c.answer }))
    );
  }

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
    flashcardCount: cards.length,
    knownCount: 0,
    createdAt: source.createdAt.toISOString(),
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
    })
  );
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
