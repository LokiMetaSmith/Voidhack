import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { chatRequestSchema, conversationMessageSchema } from "@shared/schema";
import { generateComputerResponse } from "./gemini";
import { storage } from "./storage";
import { randomUUID } from "crypto";

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

  const httpServer = createServer(app);

  return httpServer;
}
