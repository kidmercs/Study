import { GoogleGenAI } from "@google/genai";

export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

export interface ProcessedContent {
  summary: string;
  flashcards: GeneratedFlashcard[];
}

// ---------------------------------------------------------------------------
// Gemini client (lazy — only initialised when called)
// ---------------------------------------------------------------------------

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Gemini-powered processing (single call for both summary + flashcards)
// ---------------------------------------------------------------------------

async function processWithGemini(
  text: string,
  maxCards: number
): Promise<ProcessedContent> {
  const ai = getAI();

  // Trim very long texts to avoid exceeding free-tier input limits
  const trimmed = text.length > 30_000 ? text.slice(0, 30_000) + "…" : text;

  const prompt = `You are a study assistant. Analyse the text below and return a JSON object with two keys:

1. "summary": A clear, well-written paragraph (4–6 sentences) summarising the main ideas.
2. "flashcards": An array of exactly ${maxCards} high-quality study flashcards.

Flashcard rules:
- Each card must have a "question" and an "answer".
- Questions must be self-contained and specific (not "What does it say about X?" but "What is X?").
- Answers must be complete, accurate sentences — not fragments.
- Cover the most important facts, definitions, cause-and-effect relationships, and key terms.
- No duplicate topics. No trivially obvious questions.
- If the text is too short to produce ${maxCards} distinct cards, produce as many good ones as possible.

Return ONLY valid JSON — no markdown fences, no commentary.

Text:
"""
${trimmed}
"""`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const raw = response.text ?? "";

  // Strip any accidental markdown fences just in case
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/```\s*$/i, "").trim();

  let parsed: { summary?: string; flashcards?: unknown[] };
  try {
    parsed = JSON.parse(cleaned) as { summary?: string; flashcards?: unknown[] };
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  const flashcards: GeneratedFlashcard[] = [];
  if (Array.isArray(parsed.flashcards)) {
    for (const item of parsed.flashcards) {
      if (
        item &&
        typeof item === "object" &&
        "question" in item &&
        "answer" in item &&
        typeof (item as Record<string, unknown>).question === "string" &&
        typeof (item as Record<string, unknown>).answer === "string"
      ) {
        flashcards.push({
          question: String((item as Record<string, unknown>).question).trim(),
          answer: String((item as Record<string, unknown>).answer).trim(),
        });
      }
    }
  }

  return { summary, flashcards };
}

// ---------------------------------------------------------------------------
// Algorithmic fallback (used when Gemini is unavailable)
// ---------------------------------------------------------------------------

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 20);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
  "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its",
  "may", "new", "now", "old", "see", "two", "way", "who", "did", "let", "put",
  "say", "she", "too", "use", "that", "this", "with", "have", "from", "they",
  "been", "were", "will", "would", "could", "should", "there", "their", "then",
  "than", "when", "what", "which", "also", "some", "your", "about", "just",
  "more", "into", "like", "very", "because", "being", "these", "those", "such",
  "each", "both", "does", "made", "make", "many", "most", "over", "said",
  "same", "them", "time", "under", "well", "used", "using", "called", "known",
  "often", "even", "still", "first", "second", "third", "between", "through",
  "during", "before", "after", "since",
]);

function termFrequency(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of words(text)) {
    if (!STOP_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

function sentenceScore(sentence: string, freq: Map<string, number>): number {
  const ws = words(sentence).filter((w) => !STOP_WORDS.has(w));
  if (ws.length === 0) return 0;
  return ws.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / ws.length;
}

function algorithmicProcess(text: string, maxCards: number): ProcessedContent {
  const freq = termFrequency(text);
  const sents = sentences(text);

  // Summary: top-scoring sentences in original order
  const scored = sents
    .map((s, i) => ({ s, score: sentenceScore(s, freq) * (i < 3 ? 1.4 : 1), i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => a.i - b.i);
  const summary = scored.map((x) => x.s).join(" ");

  // Flashcards from definition-like sentences
  const defPattern =
    /([A-Z][a-zA-Z\s]{2,40}?)\s+(?:is|are|was|were|means|refers to|is defined as)\s+([^.!?\n]{20,150})[.!?]/g;
  const cards: GeneratedFlashcard[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = defPattern.exec(text)) !== null && cards.length < maxCards) {
    const term = m[1].trim();
    if (term.split(/\s+/).length > 6) continue;
    const key = term.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ question: `What is ${term}?`, answer: m[2].trim() + "." });
  }

  // Top-sentence cards to fill remaining slots
  for (const { s } of scored) {
    if (cards.length >= maxCards) break;
    const noEnd = s.replace(/[.!?]$/, "");
    const half = Math.floor(noEnd.length * 0.45);
    const bp = noEnd.indexOf(" ", half);
    if (bp > 0) {
      cards.push({
        question: `Complete this idea: "${noEnd.slice(0, bp).trim()}…"`,
        answer: noEnd + ".",
      });
    }
  }

  return { summary, flashcards: cards.slice(0, maxCards) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function processContent(
  text: string,
  maxCards = 10
): Promise<ProcessedContent> {
  try {
    const result = await processWithGemini(text, maxCards);
    // If Gemini returned an empty result, fall back
    if (result.flashcards.length === 0 && result.summary === "") {
      return algorithmicProcess(text, maxCards);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log but don't crash — fall back to algorithmic
    console.warn("Gemini processing failed, using fallback:", msg);
    return algorithmicProcess(text, maxCards);
  }
}

// Keep legacy sync exports for any existing callers (now wrapping the async version)
export function generateSummary(text: string): string {
  return algorithmicProcess(text, 0).summary;
}

export function generateFlashcards(text: string, maxCards = 10): GeneratedFlashcard[] {
  return algorithmicProcess(text, maxCards).flashcards;
}

export function extractVideoId(url: string): string | null {
  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}
