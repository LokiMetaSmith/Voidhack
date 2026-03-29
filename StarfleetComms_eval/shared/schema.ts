import { z } from "zod";
import { pgTable, text, varchar, timestamp, bigint, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Users table for authentication
export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 50 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAppUserSchema = createInsertSchema(appUsers).omit({
  id: true,
  createdAt: true,
});

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;

// Database tables
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 50 }).references(() => appUsers.userId, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(), // "user" | "computer"
  text: text("text").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User progress table — tracks rank, XP, and active conversation per user
export const userProgress = pgTable("user_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 50 }).unique().notNull().references(() => appUsers.userId, { onDelete: "cascade" }),
  rank: varchar("rank", { length: 50 }).notNull().default("Cadet"),
  xp: integer("xp").notNull().default(0),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// CTF progress table — per-user, per-challenge state stored as JSON
export const ctfProgress = pgTable("ctf_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 50 }).notNull().references(() => appUsers.userId, { onDelete: "cascade" }),
  challengeId: varchar("challenge_id", { length: 50 }).notNull(),
  completed: boolean("completed").notNull().default(false),
  progressData: jsonb("progress_data").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  updatedAt: true,
});

export const insertCtfProgressSchema = createInsertSchema(ctfProgress).omit({
  id: true,
  updatedAt: true,
});

// Types
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type CtfProgress = typeof ctfProgress.$inferSelect;
export type InsertCtfProgress = z.infer<typeof insertCtfProgressSchema>;

// Conversation message schema (for frontend)
export const conversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "computer"]),
  text: z.string(),
  timestamp: z.number(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

// Ship Systems schema
export const shipSystemStatusSchema = z.object({
  warpCore: z.object({
    status: z.string(),
    efficiency: z.number(),
  }),
  shields: z.object({
    status: z.string(),
    strength: z.number(),
  }),
  weapons: z.object({
    status: z.string(),
    ready: z.boolean(),
  }),
  sensors: z.object({
    status: z.string(),
    range: z.number(),
  }),
  lifesupport: z.object({
    status: z.string(),
    optimal: z.boolean(),
  }),
  impulse: z.object({
    status: z.string(),
    power: z.number(),
  }),
});

export type ShipSystemStatus = z.infer<typeof shipSystemStatusSchema>;

// Chat request/response schemas
export const chatRequestSchema = z.object({
  message: z.string(),
  conversationId: z.string().optional(),
  conversationHistory: z.array(conversationMessageSchema).optional(),
  shipSystems: shipSystemStatusSchema.optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  message: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Voice interaction states
export type VoiceState = "idle" | "listening" | "processing" | "speaking";

// Progress API types
export const saveProgressSchema = z.object({
  rank: z.string().optional(),
  xp: z.number().optional(),
});

export const saveCTFProgressSchema = z.object({
  completed: z.boolean(),
  progressData: z.record(z.unknown()),
});

export type SaveProgress = z.infer<typeof saveProgressSchema>;
export type SaveCTFProgress = z.infer<typeof saveCTFProgressSchema>;
