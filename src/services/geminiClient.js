// src/services/geminiClient.js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  // If you later use Vertex AI, include vertexai, project, location settings
});

export async function callGemini(prompt) {
  if (!prompt || prompt.trim().length === 0) {
    return "⚠ Sorry, I couldn't generate an answer. Your message was empty.";
  }

  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: prompt }
          ],
          // role: "user" // sometimes not needed
        }
      ],
      // config: { thinkingConfig: { thinkingBudget: 0 } } // optional
    });
    return resp.text || "⚠ Sorry, I couldn't generate an answer.";
  } catch (err) {
    console.error("⚠ Gemini API error:", err);
    return "⚠ Sorry, I couldn't generate an answer due to a server or network issue.";
  }
}
