import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { chatRequestSchema, conversationMessageSchema, appUsers } from "@shared/schema";
import { generateComputerResponse } from "./gemini";
import { storage, db } from "./storage";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat endpoint for Enterprise Computer
  app.post("/api/chat", async (req, res) => {
    try {
      // Validate request body
      const validatedData = chatRequestSchema.parse(req.body);

      // Get or create conversation
      let conversationId = validatedData.conversationId;
      if (!conversationId) {
        const newConversation = await storage.createConversation();
        conversationId = newConversation.id;
      }

      // Get conversation history from database if not provided
      let conversationHistory = validatedData.conversationHistory || [];
      if (!validatedData.conversationHistory && conversationId) {
        const dbMessages = await storage.getConversationMessages(conversationId);
        conversationHistory = dbMessages.map(msg => ({
          id: msg.id,
          role: msg.role as "user" | "computer",
          text: msg.text,
          timestamp: msg.timestamp,
        }));
      }

      // Save user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        text: validatedData.message,
        timestamp: Date.now(),
      });

      // Generate response from Gemini
      const computerResponse = await generateComputerResponse(
        validatedData.message,
        conversationHistory,
        validatedData.shipSystems
      );

      // Save computer response
      const computerMessage = await storage.createMessage({
        conversationId,
        role: "computer",
        text: computerResponse,
        timestamp: Date.now(),
      });

      res.json({
        message: computerResponse,
        messageId: computerMessage.id,
        conversationId,
      });
    } catch (error) {
      console.error("Chat error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data" });
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Get conversation history
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = req.params.id;
      const messages = await storage.getConversationMessages(conversationId);

      res.json({
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          text: msg.text,
          timestamp: msg.timestamp,
        })),
      });
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const conversationId = req.params.id;
      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete conversation error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Auth: register a new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { userId, password } = req.body;
      if (!userId || !password) {
        return res.status(400).json({ error: "User ID and password are required." });
      }
      if (password.length < 8 || password.length > 25) {
        return res.status(400).json({ error: "Password must be 8–25 characters." });
      }
      const existing = await db.select().from(appUsers).where(eq(appUsers.userId, userId)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "User ID already exists." });
      }
      const passwordHash = hashPassword(password);
      const [user] = await db.insert(appUsers).values({ userId, passwordHash }).returning();
      res.status(201).json({ success: true, userId: user.userId });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Auth: login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { userId, password } = req.body;
      if (!userId || !password) {
        return res.status(400).json({ error: "User ID and password are required." });
      }
      const [user] = await db.select().from(appUsers).where(eq(appUsers.userId, userId)).limit(1);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid User ID or password." });
      }
      res.json({ success: true, userId: user.userId });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
