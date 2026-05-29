export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 20);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "two", "way", "who",
  "boy", "did", "its", "let", "put", "say", "she", "too", "use", "that",
  "this", "with", "have", "from", "they", "been", "were", "will", "would",
  "could", "should", "there", "their", "then", "than", "when", "what",
  "which", "also", "some", "your", "about", "just", "more", "into", "like",
  "very", "because", "being", "these", "those", "such", "each", "both",
  "does", "made", "make", "many", "more", "most", "over", "said", "same",
  "than", "them", "then", "time", "under", "well", "were", "what", "when",
  "where", "which", "while", "with", "within", "without", "used", "using",
  "called", "known", "often", "also", "even", "still", "first", "second",
  "third", "between", "through", "during", "before", "after", "since",
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

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function deduplicate(cards: GeneratedFlashcard[]): GeneratedFlashcard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const key = c.question.toLowerCase().replace(/\W/g, "").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Pattern extractors
// ---------------------------------------------------------------------------

/** "X is/are/was/means/refers to Y" → What is X? */
function extractDefinitions(text: string): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  const pattern =
    /([A-Z][a-zA-Z\s]{2,40}?)\s+(?:is|are|was|were|is defined as|are defined as|means|refers to|can be defined as|is known as)\s+([^.!?\n]{20,150})[.!?]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const term = clean(m[1]);
    const def = clean(m[2]);
    // Skip if term is too long (likely not a real term) or looks like a sentence fragment
    if (term.split(/\s+/).length > 6) continue;
    if (/^(this|that|it|he|she|they|we|you|there|here)$/i.test(term.split(/\s+/)[0])) continue;
    cards.push({
      question: `What is ${term}?`,
      answer: capitalise(def) + ".",
    });
  }
  return cards;
}

/** "X causes/leads to/results in/produces Y" → What does X lead to? */
function extractCauseEffect(text: string): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  const causePattern =
    /([^.!?]{10,80}?)\s+(?:causes?|leads? to|results? in|produces?|triggers?|brings? about)\s+([^.!?]{10,100})[.!?]/gi;
  let m: RegExpExecArray | null;
  while ((m = causePattern.exec(text)) !== null) {
    const cause = clean(m[1]);
    const effect = clean(m[2]);
    if (cause.split(/\s+/).length < 2 || effect.split(/\s+/).length < 2) continue;
    cards.push({
      question: `What does "${capitalise(cause)}" lead to?`,
      answer: capitalise(effect) + ".",
    });
  }
  return cards;
}

/** Sentences with explicit numbers/quantities → numerical fact cards */
function extractNumericalFacts(text: string): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  // Match sentences containing digits or number words
  const numPattern = /\b(\d[\d,.]*)(?:\s*(?:percent|%|million|billion|thousand|km|kg|m|cm|mph|°C|°F|years?|months?|days?|hours?|seconds?|meters?|litres?|calories?))?\b/;
  const sents = sentences(text);
  for (const s of sents) {
    if (!numPattern.test(s)) continue;
    if (s.length > 250) continue;
    // Extract the numeric focus
    const numMatch = s.match(/\b(\d[\d,.]*\s*(?:percent|%|million|billion|thousand|km|kg|mph)?)\b/);
    if (!numMatch) continue;
    const num = numMatch[1].trim();
    const withoutNum = s.replace(numMatch[0], "______").replace(/[.!?]$/, "");
    if (withoutNum.length < 20) continue;
    cards.push({
      question: `Fill in the blank: "${withoutNum}"`,
      answer: num,
    });
  }
  return cards;
}

/** "Unlike X, Y..." / "X differs from Y in that..." */
function extractComparisons(text: string): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  const pattern =
    /(?:unlike|in contrast to|compared to|while)\s+([^,]{5,50}),\s+([^.!?]{15,120})[.!?]/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const a = clean(m[1]);
    const b = clean(m[2]);
    cards.push({
      question: `How does the text contrast "${capitalise(a)}" with something else?`,
      answer: capitalise(b) + ".",
    });
  }
  return cards;
}

/** "There are N types/steps/stages/kinds of X" → list the types */
function extractLists(text: string): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  const pattern =
    /(?:there are|includes?|consists? of|comprises?)\s+(?:\d+\s+)?(?:main\s+|key\s+|important\s+)?(?:types?|stages?|steps?|kinds?|categories?|components?|parts?|elements?|factors?)\s+of\s+([^.!?:]{5,60})[.!?:]/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const topic = clean(m[1]);
    // Find the rest of the surrounding text as the answer
    const startIdx = m.index;
    const surrounding = text.slice(startIdx, startIdx + 300).split(/[.!?]/)[0];
    if (surrounding.length < 20) continue;
    cards.push({
      question: `What are the main components or types of ${topic}?`,
      answer: capitalise(clean(surrounding)) + ".",
    });
  }
  return cards;
}

/** High-value sentences (high tf-score) turned into question+answer pairs */
function extractKeyFacts(
  text: string,
  freq: Map<string, number>,
  count: number
): GeneratedFlashcard[] {
  const cards: GeneratedFlashcard[] = [];
  const sents = sentences(text)
    .filter((s) => s.length >= 40 && s.length <= 200)
    .map((s) => ({ s, score: sentenceScore(s, freq) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count * 3);

  for (const { s } of sents) {
    if (cards.length >= count) break;

    // Try to split at a verb phrase to form a natural Q
    const noEnd = s.replace(/[.!?]$/, "");

    // Strategy: find the main verb and split before it for a "what did/does/is" question
    const verbMatch = noEnd.match(
      /^(.{15,80}?)\s+((?:is|are|was|were|has|have|had|can|will|may|should|must|did|does|do)\s+\w)/i
    );
    if (verbMatch) {
      const subject = clean(verbMatch[1]);
      const rest = clean(noEnd.slice(verbMatch[1].length).trim());
      if (rest.split(/\s+/).length >= 3) {
        cards.push({
          question: `What can you say about "${capitalise(subject)}"?`,
          answer: capitalise(noEnd) + ".",
        });
        continue;
      }
    }

    // Fallback: first half as question cue, full sentence as answer
    const half = Math.floor(noEnd.length * 0.45);
    const breakPt = noEnd.indexOf(" ", half);
    if (breakPt > 0 && breakPt < noEnd.length - 20) {
      const cue = clean(noEnd.slice(0, breakPt));
      cards.push({
        question: `According to your material, complete this idea: "${capitalise(cue)}..."`,
        answer: capitalise(noEnd) + ".",
      });
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateSummary(text: string, maxSentences = 8): string {
  const cleaned = clean(text);
  const sents = sentences(cleaned);
  if (sents.length === 0) return cleaned.slice(0, 600);

  const freq = termFrequency(cleaned);

  const scored = sents.map((s, i) => ({
    s,
    score: sentenceScore(s, freq) * (i < 3 ? 1.5 : i >= sents.length - 2 ? 1.1 : 1),
    idx: i,
  }));

  return scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.s)
    .join(" ");
}

export function generateFlashcards(text: string, maxCards = 10): GeneratedFlashcard[] {
  const cleaned = clean(text);
  const freq = termFrequency(cleaned);

  // Run all extractors
  const allCards: GeneratedFlashcard[] = [
    ...extractDefinitions(cleaned),
    ...extractCauseEffect(cleaned),
    ...extractLists(cleaned),
    ...extractComparisons(cleaned),
    ...extractNumericalFacts(cleaned),
  ];

  // Deduplicate pattern cards first
  const patternCards = deduplicate(allCards);

  // Top up with key-fact cards if needed
  const needed = Math.max(0, maxCards - patternCards.length);
  const keyFacts = needed > 0 ? deduplicate(extractKeyFacts(cleaned, freq, needed + 5)) : [];

  const combined = deduplicate([...patternCards, ...keyFacts]);

  return combined.slice(0, maxCards);
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
