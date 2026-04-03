import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle({ client: pool, schema });

export interface IStorage {
  // Conversation operations
  createConversation(userId?: string): Promise<schema.Conversation>;
  getConversation(id: string): Promise<schema.Conversation | undefined>;
  getUserConversation(userId: string): Promise<schema.Conversation | undefined>;

  // Message operations
  createMessage(message: schema.InsertMessage): Promise<schema.Message>;
  getConversationMessages(conversationId: string): Promise<schema.Message[]>;
  deleteConversation(id: string): Promise<void>;

  // User progress operations
  getUserProgress(userId: string): Promise<schema.UserProgress | undefined>;
  upsertUserProgress(userId: string, data: { rank?: string; xp?: number; conversationId?: string | null }): Promise<schema.UserProgress>;

  // CTF progress operations
  getAllCTFProgress(userId: string): Promise<schema.CtfProgress[]>;
  getCTFProgress(userId: string, challengeId: string): Promise<schema.CtfProgress | undefined>;
  upsertCTFProgress(userId: string, challengeId: string, data: { completed: boolean; progressData: Record<string, unknown> }): Promise<schema.CtfProgress>;

  // Leaderboard — all users with their XP and rank
  getAllUsersProgress(): Promise<Array<{ userId: string; xp: number; rank: string }>>;
}

export class DbStorage implements IStorage {
  async createConversation(userId?: string): Promise<schema.Conversation> {
    const [conversation] = await db
      .insert(schema.conversations)
      .values({ userId: userId ?? null })
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<schema.Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, id))
      .limit(1);
    return conversation;
  }

  async getUserConversation(userId: string): Promise<schema.Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, userId))
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(1);
    return conversation;
  }

  async createMessage(message: schema.InsertMessage): Promise<schema.Message> {
    const [newMessage] = await db
      .insert(schema.messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getConversationMessages(conversationId: string): Promise<schema.Message[]> {
    return await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.timestamp);
  }

  async deleteConversation(id: string): Promise<void> {
    await db
      .delete(schema.conversations)
      .where(eq(schema.conversations.id, id));
  }

  async getUserProgress(userId: string): Promise<schema.UserProgress | undefined> {
    const [progress] = await db
      .select()
      .from(schema.userProgress)
      .where(eq(schema.userProgress.userId, userId))
      .limit(1);
    return progress;
  }

  async upsertUserProgress(
    userId: string,
    data: { rank?: string; xp?: number; conversationId?: string | null }
  ): Promise<schema.UserProgress> {
    const existing = await this.getUserProgress(userId);
    if (existing) {
      const [updated] = await db
        .update(schema.userProgress)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(schema.userProgress.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.userProgress)
        .values({
          userId,
          rank: data.rank ?? "Cadet",
          xp: data.xp ?? 0,
          conversationId: data.conversationId ?? null,
        })
        .returning();
      return created;
    }
  }

  async getAllCTFProgress(userId: string): Promise<schema.CtfProgress[]> {
    return await db
      .select()
      .from(schema.ctfProgress)
      .where(eq(schema.ctfProgress.userId, userId));
  }

  async getCTFProgress(userId: string, challengeId: string): Promise<schema.CtfProgress | undefined> {
    const [progress] = await db
      .select()
      .from(schema.ctfProgress)
      .where(
        and(
          eq(schema.ctfProgress.userId, userId),
          eq(schema.ctfProgress.challengeId, challengeId)
        )
      )
      .limit(1);
    return progress;
  }

  async upsertCTFProgress(
    userId: string,
    challengeId: string,
    data: { completed: boolean; progressData: Record<string, unknown> }
  ): Promise<schema.CtfProgress> {
    const existing = await this.getCTFProgress(userId, challengeId);
    if (existing) {
      const [updated] = await db
        .update(schema.ctfProgress)
        .set({
          // Never downgrade completed from true → false (page reloads reset state)
          completed: existing.completed || data.completed,
          progressData: data.progressData,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.ctfProgress.userId, userId),
            eq(schema.ctfProgress.challengeId, challengeId)
          )
        )
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.ctfProgress)
        .values({
          userId,
          challengeId,
          completed: data.completed,
          progressData: data.progressData,
        })
        .returning();
      return created;
    }
  }

  async getAllUsersProgress(): Promise<Array<{ userId: string; xp: number; rank: string }>> {
    // Left join app_users with user_progress so users with no activity still appear
    const rows = await db
      .select({
        userId: schema.appUsers.userId,
        xp: sql<number>`coalesce(${schema.userProgress.xp}, 0)`,
        rank: sql<string>`coalesce(${schema.userProgress.rank}, 'Cadet')`,
      })
      .from(schema.appUsers)
      .leftJoin(schema.userProgress, eq(schema.appUsers.userId, schema.userProgress.userId))
      .orderBy(desc(sql`coalesce(${schema.userProgress.xp}, 0)`));
    return rows;
  }
}

export const storage = new DbStorage();
