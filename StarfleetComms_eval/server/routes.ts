import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  chatRequestSchema,
  appUsers,
  saveProgressSchema,
  saveCTFProgressSchema,
} from "@shared/schema";
import { generateComputerResponse } from "./gemini";
import { storage, db } from "./storage";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";

// In-memory token store: token → userId
// Works reliably in all proxy/iframe environments where cookies may be blocked.
const tokenStore = new Map<string, string>();

function getUserIdFromRequest(req: Request): string | undefined {
  const header = req.headers["x-auth-token"];
  if (typeof header === "string" && header) {
    return tokenStore.get(header);
  }
  return req.session?.userId;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  // Attach for downstream handlers
  (req as any).authenticatedUserId = userId;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth: check current session/token
  app.get("/api/auth/me", (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (userId) {
      return res.json({ authenticated: true, userId });
    }
    res.json({ authenticated: false });
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

  // Auth: login — returns a token for header-based auth
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
      const token = randomUUID();
      tokenStore.set(token, user.userId);
      // Also set cookie-based session as fallback
      req.session.userId = user.userId;
      req.session.save(() => {});
      res.json({ success: true, userId: user.userId, token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Auth: logout
  app.post("/api/auth/logout", (req, res) => {
    const header = req.headers["x-auth-token"];
    if (typeof header === "string" && header) {
      tokenStore.delete(header);
    }
    req.session.destroy(() => {});
    res.json({ success: true });
  });

  // Auth: delete account — permanently removes user and all associated data
  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      // Cascading deletes: ctf_progress, user_progress, conversations+messages all cascade from app_users
      await db.delete(appUsers).where(eq(appUsers.userId, userId));
      // Revoke the token
      const header = req.headers["x-auth-token"];
      if (typeof header === "string" && header) {
        tokenStore.delete(header);
      }
      req.session.destroy(() => {});
      res.json({ success: true });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Get all progress for the current user (game state + CTF progress)
  app.get("/api/progress", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      const [userProg, ctfProgresses] = await Promise.all([
        storage.getUserProgress(userId),
        storage.getAllCTFProgress(userId),
      ]);

      let conversationMessages: Array<{ id: string; role: string; text: string; timestamp: number }> = [];
      const conversationId = userProg?.conversationId ?? null;
      if (conversationId) {
        const msgs = await storage.getConversationMessages(conversationId);
        conversationMessages = msgs.map(m => ({
          id: m.id,
          role: m.role,
          text: m.text,
          timestamp: m.timestamp,
        }));
      }

      const ctfMap: Record<string, { completed: boolean; progressData: unknown }> = {};
      for (const cp of ctfProgresses) {
        ctfMap[cp.challengeId] = {
          completed: cp.completed,
          progressData: cp.progressData,
        };
      }

      res.json({
        rank: userProg?.rank ?? "Cadet",
        xp: userProg?.xp ?? 0,
        conversationId,
        conversationMessages,
        ctf: ctfMap,
      });
    } catch (error) {
      console.error("Get progress error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Save game state progress (rank, XP)
  app.put("/api/progress", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      const validated = saveProgressSchema.parse(req.body);
      const updated = await storage.upsertUserProgress(userId, validated);
      res.json({ success: true, rank: updated.rank, xp: updated.xp });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data." });
      }
      console.error("Save progress error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Save CTF challenge progress
  app.put("/api/ctf/:challengeId", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      const { challengeId } = req.params;
      const validated = saveCTFProgressSchema.parse(req.body);
      const updated = await storage.upsertCTFProgress(userId, challengeId, {
        completed: validated.completed,
        progressData: validated.progressData as Record<string, unknown>,
      });
      res.json({ success: true, challengeId: updated.challengeId, completed: updated.completed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data." });
      }
      console.error("Save CTF progress error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Chat endpoint for Enterprise Computer
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const validatedData = chatRequestSchema.parse(req.body);
      const userId = (req as any).authenticatedUserId as string;

      let conversationId = validatedData.conversationId;

      // If a conversationId was provided, verify it belongs to this user
      if (conversationId) {
        const conversation = await storage.getConversation(conversationId);
        if (!conversation || conversation.userId !== userId) {
          return res.status(403).json({ error: "Access denied." });
        }
      }

      if (!conversationId) {
        const userProg = await storage.getUserProgress(userId);
        if (userProg?.conversationId) {
          conversationId = userProg.conversationId;
        }
        if (!conversationId) {
          const newConversation = await storage.createConversation(userId);
          conversationId = newConversation.id;
          await storage.upsertUserProgress(userId, { conversationId });
        }
      }

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

      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        text: validatedData.message,
        timestamp: Date.now(),
      });

      const computerResponse = await generateComputerResponse(
        validatedData.message,
        conversationHistory,
        validatedData.shipSystems
      );

      const computerMessage = await storage.createMessage({
        conversationId,
        role: "computer",
        text: computerResponse,
        timestamp: Date.now(),
      });

      if (userId) {
        await storage.upsertUserProgress(userId, { conversationId });
      }

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

  // Get conversation history — only accessible by the conversation owner
  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      const conversationId = req.params.id;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied." });
      }

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

  // Delete conversation — only the owner can delete their conversation
  app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authenticatedUserId as string;
      const conversationId = req.params.id;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied." });
      }

      await storage.deleteConversation(conversationId);
      const userProg = await storage.getUserProgress(userId);
      if (userProg?.conversationId === conversationId) {
        await storage.upsertUserProgress(userId, { conversationId: null });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete conversation error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
