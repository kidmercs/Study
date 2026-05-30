import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, flashcardsTable } from "@workspace/db";
import { ReviewFlashcardParams, ReviewFlashcardBody, ReviewFlashcardResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.patch("/flashcards/:id/review", async (req, res): Promise<void> => {
  const params = ReviewFlashcardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReviewFlashcardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(flashcardsTable)
    .where(eq(flashcardsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Flashcard not found" });
    return;
  }

  const [updated] = await db
    .update(flashcardsTable)
    .set({ known: body.data.known, reviewCount: existing.reviewCount + 1 })
    .where(eq(flashcardsTable.id, params.data.id))
    .returning();

  res.json(
    ReviewFlashcardResponse.parse({
      id: updated.id,
      sourceId: updated.sourceId,
      question: updated.question,
      answer: updated.answer,
      known: updated.known,
      reviewCount: updated.reviewCount,
      createdAt: updated.createdAt.toISOString(),
    })
  );
});

export default router;
