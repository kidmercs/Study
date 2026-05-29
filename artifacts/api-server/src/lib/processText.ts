import { GoogleGenAI } from "@google/genai";

export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

export interface GeneratedQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

export interface ProcessedContent {
  summary: string;
  flashcards: GeneratedFlashcard[];
  mindMap: MindMapNode;
  practiceQuestions: GeneratedQuestion[];
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

  const trimmed = text.length > 40_000 ? text.slice(0, 40_000) + "…" : text;

  const prompt = `You are a study assistant. Analyse the text below and return a JSON object with exactly four keys:

1. "summary": A clear, well-written paragraph (4–6 sentences) summarising the main ideas.

2. "flashcards": An array of exactly ${maxCards} high-quality study flashcards.
   - Each card must have a "question" and an "answer".
   - Questions must be self-contained and specific.
   - Answers must be complete, accurate sentences — not fragments.
   - Cover the most important facts, definitions, cause-and-effect relationships, processes, and key terms.
   - Spread cards across all major topics — do not cluster on one section.
   - No duplicate topics. No trivially obvious questions.

3. "mindMap": A hierarchical tree representing the key topics and subtopics.
   - The root node must have a "label" (the main topic title) and a "children" array.
   - Each child node has a "label" and optionally a "children" array (max 2 levels deep).
   - Aim for 4–7 top-level branches, each with 2–4 sub-items.
   - Labels must be short (3–6 words max).

4. "practiceQuestions": An array of exactly 5 multiple-choice practice questions.
   - Each question must have: "question" (string), "options" (array of exactly 4 strings), "correctIndex" (0-3), "explanation" (1-2 sentences explaining why the answer is correct).
   - Questions should test understanding, not just recall.
   - Vary difficulty. No overlap with flashcard questions.

Return ONLY a valid JSON object — no markdown, no code fences, no commentary outside the JSON.

Text:
"""
${trimmed}
"""`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 1500);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        },
      });

      const raw = (response.text ?? "").trim();
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();

      if (!cleaned) throw new Error("Gemini returned an empty response");

      let parsed: {
        summary?: unknown;
        flashcards?: unknown;
        mindMap?: unknown;
        practiceQuestions?: unknown;
      };
      try {
        parsed = JSON.parse(cleaned) as typeof parsed;
      } catch {
        throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
      }

      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

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

      const mindMap: MindMapNode =
        parsed.mindMap &&
        typeof parsed.mindMap === "object" &&
        typeof (parsed.mindMap as Record<string, unknown>).label === "string"
          ? (parsed.mindMap as MindMapNode)
          : { label: "Topics", children: [] };

      const practiceQuestions: GeneratedQuestion[] = [];
      if (Array.isArray(parsed.practiceQuestions)) {
        for (const item of parsed.practiceQuestions) {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).question === "string" &&
            Array.isArray((item as Record<string, unknown>).options) &&
            typeof (item as Record<string, unknown>).correctIndex === "number" &&
            typeof (item as Record<string, unknown>).explanation === "string"
          ) {
            const q = item as {
              question: string;
              options: unknown[];
              correctIndex: number;
              explanation: string;
            };
            const options = q.options.filter((o) => typeof o === "string") as string[];
            if (options.length === 4) {
              practiceQuestions.push({
                question: q.question.trim(),
                options,
                correctIndex: Math.max(0, Math.min(3, q.correctIndex)),
                explanation: q.explanation.trim(),
              });
            }
          }
        }
      }

      return { summary, flashcards, mindMap, practiceQuestions };
    } catch (err) {
      lastErr = err;
      const msg = String(err instanceof Error ? err.message : err);
      const isTransient =
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (!isTransient) throw err;
    }
  }
  throw lastErr;
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
