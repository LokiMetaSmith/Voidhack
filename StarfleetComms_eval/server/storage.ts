import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import { eq, desc } from "drizzle-orm";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle({ client: pool, schema });

export interface IStorage {
  // Conversation operations
  createConversation(): Promise<schema.Conversation>;
  getConversation(id: string): Promise<schema.Conversation | undefined>;
  
  // Message operations
  createMessage(message: schema.InsertMessage): Promise<schema.Message>;
  getConversationMessages(conversationId: string): Promise<schema.Message[]>;
  deleteConversation(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async createConversation(): Promise<schema.Conversation> {
    const [conversation] = await db
      .insert(schema.conversations)
      .values({})
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
}

export const storage = new DbStorage();
