import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sourcesTable } from "./sources";

export const pastPaperQuestionsTable = pgTable("past_paper_questions", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sourcesTable.id, { onDelete: "cascade" }),
  questionNumber: text("question_number").notNull(),
  question: text("question").notNull(),
  markScheme: text("mark_scheme").notNull(),
  marks: integer("marks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPastPaperQuestionSchema = createInsertSchema(pastPaperQuestionsTable).omit({ id: true, createdAt: true });
export type InsertPastPaperQuestion = z.infer<typeof insertPastPaperQuestionSchema>;
export type PastPaperQuestion = typeof pastPaperQuestionsTable.$inferSelect;
