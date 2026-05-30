import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1).references(() => usersTable.id),
  sourceType: text("source_type").notNull().default("youtube"),
  youtubeUrl: text("youtube_url"),
  videoId: text("video_id"),
  title: text("title").notNull().default(""),
  thumbnail: text("thumbnail"),
  channelName: text("channel_name"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  summary: text("summary"),
  rawText: text("raw_text"),
  mindMap: text("mind_map"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSourceSchema = createInsertSchema(sourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sourcesTable.$inferSelect;
