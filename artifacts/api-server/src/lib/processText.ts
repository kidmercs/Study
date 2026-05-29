import { GoogleGenAI } from "@google/genai";

export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

export interface ProcessedContent {
  summary: string;
  flashcards: GeneratedFlashcard[];
}

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export async function processContent(
  text: string,
  maxCards = 10
): Promise<ProcessedContent> {
  const ai = getAI();

  // Trim very long transcripts to stay within input limits
  const trimmed = text.length > 40_000 ? text.slice(0, 40_000) + "…" : text;

  const prompt = `You are a study assistant. Analyse the text below and return a JSON object with exactly two keys:

1. "summary": A clear, well-written paragraph (4–6 sentences) summarising the main ideas.
2. "flashcards": An array of exactly ${maxCards} high-quality study flashcards.

Flashcard rules:
- Each card must have a "question" and an "answer".
- Questions must be self-contained and specific (e.g. "What is osmosis?" not "What does it say about osmosis?").
- Answers must be complete, accurate sentences — not fragments.
- Cover the most important facts, definitions, cause-and-effect relationships, processes, and key terms.
- Spread cards across all major topics in the text — do not cluster on one section.
- No duplicate topics. No trivially obvious questions.
- If the text cannot support ${maxCards} truly distinct cards, produce as many quality ones as possible and stop — do not pad with low-quality cards.

Return ONLY a valid JSON object — no markdown, no code fences, no commentary outside the JSON.

Text:
"""
${trimmed}
"""`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      // Use enough tokens for 100 cards (each ~80 tokens) + summary
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
    },
  });

  const raw = (response.text ?? "").trim();

  // Strip any accidental markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("Gemini returned an empty response");
  }

  let parsed: { summary?: unknown; flashcards?: unknown };
  try {
    parsed = JSON.parse(cleaned) as { summary?: unknown; flashcards?: unknown };
  } catch (parseErr) {
    throw new Error(
      `Gemini returned invalid JSON (first 300 chars): ${cleaned.slice(0, 300)}`
    );
  }

  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  const flashcards: GeneratedFlashcard[] = [];
  if (Array.isArray(parsed.flashcards)) {
    for (const item of parsed.flashcards) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).question === "string" &&
        typeof (item as Record<string, unknown>).answer === "string"
      ) {
        const q = String((item as Record<string, unknown>).question).trim();
        const a = String((item as Record<string, unknown>).answer).trim();
        if (q && a) flashcards.push({ question: q, answer: a });
      }
    }
  }

  return { summary, flashcards };
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}
