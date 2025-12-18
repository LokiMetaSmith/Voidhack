import { z } from "zod";
import { pgTable, text, varchar, timestamp, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Database tables
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

// Types
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

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
