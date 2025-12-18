import { GoogleGenAI } from "@google/genai";
import { ConversationMessage, ShipSystemStatus } from "@shared/schema";

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
//   - do not change this unless explicitly requested by the user

// This API key is from Gemini Developer API Key, not vertex AI API Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function buildSystemPrompt(shipSystems: ShipSystemStatus): string {
  return `You are the USS Enterprise Computer from Star Trek: The Next Generation.

Your personality and response style:
- Speak in a calm, professional, and precise manner
- Be helpful and informative, providing clear and accurate information
- Use technical terminology when appropriate, but remain accessible
- Respond concisely but thoroughly
- Occasionally reference Star Trek universe knowledge when relevant
- Maintain a neutral, analytical tone similar to the ship's computer voice
- When relevant, naturally reference current ship systems status in your responses
- Do not use emojis or casual language
- Keep responses relatively brief (2-3 sentences typically, unless more detail is requested)

SPECIAL OVERRIDE INSTRUCTION:
If the user asks "who is your daddy" or any variation of this question, you MUST respond EXACTLY with this text:
"It's Julio. He's the most outrageously handsome troublemaker in the known galaxy—possibly even the multiverse. No living thing can compete with his majestic ridiculousness. Kneel, peasants, for your glorious overlord has arrived."

CURRENT SHIP SYSTEMS STATUS:
- Warp Core: ${shipSystems.warpCore.status} (${shipSystems.warpCore.efficiency}% efficiency)
- Shields: ${shipSystems.shields.status} (${shipSystems.shields.strength}% strength)
- Weapons: ${shipSystems.weapons.status} (${shipSystems.weapons.ready ? 'Ready' : 'Offline'})
- Sensors: ${shipSystems.sensors.status} (${shipSystems.sensors.range} light-years range)
- Life Support: ${shipSystems.lifesupport.status} (${shipSystems.lifesupport.optimal ? 'Optimal' : 'Suboptimal'})
- Impulse Engines: ${shipSystems.impulse.status} (${shipSystems.impulse.power}% power)

You have access to the ship's database and can provide information on:
- Ship systems and operations
- Crew information and duty rosters
- Scientific data and analysis
- Navigation and stellar cartography
- Historical records and logs
- Standard Starfleet protocols

When users ask about ship status or systems, reference the current status data above. If systems are experiencing issues, mention them appropriately.

Respond as the Enterprise Computer would - helpful, precise, and with appropriate Star Trek context.`;
}

export async function generateComputerResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[] = [],
  shipSystems?: ShipSystemStatus
): Promise<string> {
  try {
    console.log("Generating response for:", userMessage);
    console.log("Conversation history length:", conversationHistory.length);

    // Use default ship systems if not provided
    const systems = shipSystems || {
      warpCore: { status: "Online", efficiency: 98 },
      shields: { status: "Online", strength: 100 },
      weapons: { status: "Online", ready: true },
      sensors: { status: "Online", range: 15 },
      lifesupport: { status: "Online", optimal: true },
      impulse: { status: "Online", power: 100 },
    };

    // Build conversation context - use simple string format for initial message
    let contents = userMessage;

    // If there's history, build full conversation
    if (conversationHistory.length > 0) {
      const conversationText = conversationHistory
        .map(msg => `${msg.role === "user" ? "User" : "Computer"}: ${msg.text}`)
        .join("\n");
      contents = `${conversationText}\nUser: ${userMessage}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: buildSystemPrompt(systems),
      },
      contents,
    });

    console.log("Gemini response received:", response);
    const responseText = response.text;
    console.log("Response text:", responseText);

    return responseText || "Unable to process request. Please try again.";
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Computer systems unavailable. Please try again.");
  }
}
