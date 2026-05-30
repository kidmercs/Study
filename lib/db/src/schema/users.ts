import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;

export const SEED_USERS = [
  { id: 1, name: "Mirco" },
  { id: 2, name: "Makayla" },
  { id: 3, name: "Emelia" },
] as const;
