import { Router, type IRouter, type Request } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, sourcesTable, flashcardsTable, questionsTable, pastPaperQuestionsTable, usersTable, SEED_USERS } from "@workspace/db";
import {
  CreateSourceBody,
  GetSourceParams,
  DeleteSourceParams,
  GetSourceResponse,
  ListSourcesResponse,
  GetStatsResponse,
} from "@workspace/api-zod";
import { processContent, extractVideoId, extractPastPaper } from "../../lib/processText";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Seed users once on module load
// ---------------------------------------------------------------------------
(async () => {
  try {
    for (const u of SEED_USERS) {
      await db
        .insert(usersTable)
        .values({ id: u.id, name: u.name })
        .onConflictDoUpdate({ target: usersTable.id, set: { name: u.name } });
    }
  } catch {
    // Non-fatal
  }
})();

// ---------------------------------------------------------------------------
// Helper: resolve userId from the X-User-Id header (defaults to 1)
// ---------------------------------------------------------------------------
const VALID_USER_IDS = new Set(SEED_USERS.map((u) => u.id));

function resolveUserId(req: Request): number {
  const raw = req.headers["x-user-id"];
  const parsed = parseInt(typeof raw === "string" ? raw : "1", 10);
  return VALID_USER_IDS.has(parsed as (typeof SEED_USERS)[number]["id"]) ? parsed : 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

async function saveProcessedContent(sourceId: number, result: Awaited<ReturnType<typeof processContent>>) {
  const { summary, flashcards: cards, mindMap, practiceQuestions } = result;
  await db
    .update(sourcesTable)
    .set({ summary, mindMap: mindMap ? JSON.stringify(mindMap) : null, status: "done" })
    .where(eq(sourcesTable.id, sourceId));
  if (cards.length > 0) {
    await db.insert(flashcardsTable).values(cards.map((c) => ({ sourceId, question: c.question, answer: c.answer })));
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

async function savePastPaperContent(sourceId: number, title: string, questions: Awaited<ReturnType<typeof extractPastPaper>>) {
  await db.update(sourcesTable).set({ title, status: "done" }).where(eq(sourcesTable.id, sourceId));
  if (questions.length > 0) {
    await db.insert(pastPaperQuestionsTable).values(
      questions.map((q) => ({
        sourceId,
        questionNumber: q.questionNumber,
        question: q.question,
        markScheme: q.markScheme,
        marks: q.marks ?? null,
      }))
    );
  }
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("503") || msg.includes("UNAVAILABLE")) return "Gemini is temporarily overloaded. Please retry in a moment.";
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) return "API rate limit reached. Please wait a minute before retrying.";
  return msg.slice(0, 200);
}

function sourceRow(s: typeof sourcesTable.$inferSelect, flashcardCount = 0, knownCount = 0) {
  return {
    id: s.id,
    sourceType: s.sourceType,
    youtubeUrl: s.youtubeUrl ?? null,
    videoId: s.videoId ?? null,
    title: s.title,
    thumbnail: s.thumbnail ?? null,
    channelName: s.channelName ?? null,
    status: s.status,
    errorMessage: s.errorMessage ?? null,
    flashcardCount,
    knownCount,
    createdAt: s.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /users
// ---------------------------------------------------------------------------
router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.id);
  res.json(rows.map((u) => ({ id: u.id, name: u.name, createdAt: u.createdAt.toISOString() })));
});

// ---------------------------------------------------------------------------
// GET /sources
// ---------------------------------------------------------------------------
router.get("/sources", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);
  const rows = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.userId, userId))
    .orderBy(sql`${sourcesTable.createdAt} desc`);

  const flashcardCounts = rows.length
    ? await db
        .select({
          sourceId: flashcardsTable.sourceId,
          total: sql<number>`count(*)`.mapWith(Number),
          known: sql<number>`count(*) filter (where ${flashcardsTable.known} = true)`.mapWith(Number),
        })
        .from(flashcardsTable)
        .where(sql`${flashcardsTable.sourceId} IN (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`)
        .groupBy(flashcardsTable.sourceId)
    : [];

  const countMap = new Map(flashcardCounts.map((r) => [r.sourceId, { total: r.total, known: r.known }]));
  res.json(ListSourcesResponse.parse(rows.map((r) => sourceRow(r, countMap.get(r.id)?.total ?? 0, countMap.get(r.id)?.known ?? 0))));
});

// ---------------------------------------------------------------------------
// POST /sources — synchronous processing so Vercel serverless doesn't drop it
// ---------------------------------------------------------------------------
router.post("/sources", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { sourceType, youtubeUrl, textTitle, textContent, maxFlashcards, maxQuestions, generateFlashcards, generateMindMap, generateQuiz } = parsed.data;
  const processOptions = {
    generateFlashcards: generateFlashcards ?? true,
    generateMindMap: generateMindMap ?? true,
    generateQuiz: generateQuiz ?? true,
    maxFlashcards: Math.min(100, Math.max(5, maxFlashcards ?? 10)),
    maxQuestions: Math.min(20, Math.max(3, maxQuestions ?? 5)),
  };

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (sourceType === "youtube") {
    if (!youtubeUrl) { res.status(400).json({ error: "youtubeUrl is required" }); return; }
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

    const [source] = await db
      .insert(sourcesTable)
      .values({ userId, sourceType: "youtube", youtubeUrl, videoId, title: "Loading...", status: "processing" })
      .returning();

    try {
      const [meta, transcript] = await Promise.all([fetchVideoMeta(videoId), fetchTranscript(videoId)]);
      const result = await processContent(transcript, processOptions);
      await db.update(sourcesTable)
        .set({ title: meta.title, thumbnail: meta.thumbnail, channelName: meta.channelName })
        .where(eq(sourcesTable.id, source.id));
      await saveProcessedContent(source.id, result);
      const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
      const cards = await db.select().from(flashcardsTable).where(eq(flashcardsTable.sourceId, source.id));
      res.status(201).json(sourceRow(done, cards.length, 0));
    } catch (err) {
      await db.update(sourcesTable)
        .set({ status: "error", errorMessage: friendlyError(err), title: "Error processing video" })
        .where(eq(sourcesTable.id, source.id));
      const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
      res.status(201).json(sourceRow(done));
    }
    return;
  }

  // ── Past Paper ────────────────────────────────────────────────────────────
  if (sourceType === "pastpaper") {
    if (!textTitle || !textContent) { res.status(400).json({ error: "textTitle and textContent are required" }); return; }

    const [source] = await db
      .insert(sourcesTable)
      .values({ userId, sourceType: "pastpaper", title: textTitle, rawText: textContent, status: "processing" })
      .returning();

    try {
      const questions = await extractPastPaper(textContent);
      await savePastPaperContent(source.id, textTitle, questions);
      const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
      res.status(201).json(sourceRow(done));
    } catch (err) {
      await db.update(sourcesTable)
        .set({ status: "error", errorMessage: friendlyError(err) })
        .where(eq(sourcesTable.id, source.id));
      const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
      res.status(201).json(sourceRow(done));
    }
    return;
  }

  // ── Text / PDF ────────────────────────────────────────────────────────────
  if (!textTitle || !textContent) { res.status(400).json({ error: "textTitle and textContent are required" }); return; }

  const [source] = await db
    .insert(sourcesTable)
    .values({ userId, sourceType, title: textTitle, rawText: textContent, status: "processing" })
    .returning();

  try {
    const result = await processContent(textContent, processOptions);
    await saveProcessedContent(source.id, result);
    const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
    const cards = await db.select().from(flashcardsTable).where(eq(flashcardsTable.sourceId, source.id));
    res.status(201).json(sourceRow(done, cards.length, 0));
  } catch (err) {
    await db.update(sourcesTable)
      .set({ status: "error", errorMessage: friendlyError(err) })
      .where(eq(sourcesTable.id, source.id));
    const [done] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, source.id));
    res.status(201).json(sourceRow(done));
  }
});

// ---------------------------------------------------------------------------
// GET /sources/:id
// ---------------------------------------------------------------------------
router.get("/sources/:id", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);
  const params = GetSourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [source] = await db.select().from(sourcesTable)
    .where(and(eq(sourcesTable.id, params.data.id), eq(sourcesTable.userId, userId)));
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  const [cards, qs, ppqs] = await Promise.all([
    db.select().from(flashcardsTable).where(eq(flashcardsTable.sourceId, source.id)).orderBy(flashcardsTable.createdAt),
    db.select().from(questionsTable).where(eq(questionsTable.sourceId, source.id)).orderBy(questionsTable.createdAt),
    db.select().from(pastPaperQuestionsTable).where(eq(pastPaperQuestionsTable.sourceId, source.id)).orderBy(pastPaperQuestionsTable.createdAt),
  ]);

  res.json(GetSourceResponse.parse({
    ...sourceRow(source, cards.length, cards.filter((c) => c.known).length),
    summary: source.summary ?? null,
    mindMap: source.mindMap ?? null,
    flashcards: cards.map((c) => ({ id: c.id, sourceId: c.sourceId, question: c.question, answer: c.answer, known: c.known, reviewCount: c.reviewCount, createdAt: c.createdAt.toISOString() })),
    questions: qs.map((q) => ({ id: q.id, sourceId: q.sourceId, question: q.question, options: JSON.parse(q.options) as string[], correctIndex: q.correctIndex, explanation: q.explanation, createdAt: q.createdAt.toISOString() })),
    pastPaperQuestions: ppqs.map((q) => ({ id: q.id, sourceId: q.sourceId, questionNumber: q.questionNumber, question: q.question, markScheme: q.markScheme, marks: q.marks ?? null, createdAt: q.createdAt.toISOString() })),
  }));
});

// ---------------------------------------------------------------------------
// POST /sources/:id/retry
// ---------------------------------------------------------------------------
router.post("/sources/:id/retry", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);
  const params = GetSourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [source] = await db.select().from(sourcesTable)
    .where(and(eq(sourcesTable.id, params.data.id), eq(sourcesTable.userId, userId)));
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }
  if (source.status === "processing") { res.status(409).json({ error: "Source is already processing" }); return; }

  await db.update(sourcesTable).set({ status: "processing", errorMessage: null }).where(eq(sourcesTable.id, source.id));

  try {
    const retryOptions = { generateFlashcards: true, generateMindMap: true, generateQuiz: true, maxFlashcards: 10, maxQuestions: 5 };
    if (source.sourceType === "youtube") {
      const videoId = source.videoId!;
      const [meta, transcript] = await Promise.all([fetchVideoMeta(videoId), fetchTranscript(videoId)]);
      await db.update(sourcesTable).set({ title: meta.title, thumbnail: meta.thumbnail, channelName: meta.channelName }).where(eq(sourcesTable.id, source.id));
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
    res.json({ ok: true });
  } catch (err) {
    await db.update(sourcesTable).set({ status: "error", errorMessage: friendlyError(err) }).where(eq(sourcesTable.id, source.id));
    res.json({ ok: false, error: friendlyError(err) });
  }
});

// ---------------------------------------------------------------------------
// DELETE /sources/:id
// ---------------------------------------------------------------------------
router.delete("/sources/:id", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);
  const params = DeleteSourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(sourcesTable)
    .where(and(eq(sourcesTable.id, params.data.id), eq(sourcesTable.userId, userId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Source not found" }); return; }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------
router.get("/stats", async (req, res): Promise<void> => {
  const userId = resolveUserId(req);

  const [sourcesCount] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(sourcesTable).where(eq(sourcesTable.userId, userId));

  const [doneCount] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(sourcesTable).where(and(eq(sourcesTable.userId, userId), eq(sourcesTable.status, "done")));

  const [flashcardStats] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      known: sql<number>`count(*) filter (where ${flashcardsTable.known} = true)`.mapWith(Number),
    })
    .from(flashcardsTable)
    .innerJoin(sourcesTable, eq(flashcardsTable.sourceId, sourcesTable.id))
    .where(eq(sourcesTable.userId, userId));

  res.json(GetStatsResponse.parse({
    totalSources: sourcesCount?.total ?? 0,
    totalFlashcards: flashcardStats?.total ?? 0,
    knownFlashcards: flashcardStats?.known ?? 0,
    unknownFlashcards: (flashcardStats?.total ?? 0) - (flashcardStats?.known ?? 0),
    sourcesProcessed: doneCount?.total ?? 0,
  }));
});

export default router;
