export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

function matchWords(text: string, pattern: RegExp): string[] {
  return text.match(pattern) as string[] | null ?? [];
}

function matchSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g) as string[] | null ?? [];
}

export function generateSummary(text: string, maxSentences = 8): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences: string[] = matchSentences(cleaned);
  if (sentences.length === 0) return cleaned.slice(0, 600);

  const wordFreq: Record<string, number> = {};
  const words: string[] = matchWords(cleaned.toLowerCase(), /\b[a-z]{4,}\b/g);
  const stopWords = new Set([
    "this", "that", "with", "have", "from", "they", "been", "were", "will",
    "would", "could", "should", "there", "their", "then", "than", "when",
    "what", "which", "also", "some", "your", "about", "just", "more",
    "into", "like", "very", "because", "being", "these", "those",
  ]);
  for (const word of words) {
    if (!stopWords.has(word)) wordFreq[word] = (wordFreq[word] ?? 0) + 1;
  }

  interface ScoredSentence { sentence: string; score: number }
  const scored: ScoredSentence[] = sentences.map((sentence: string, index: number): ScoredSentence => {
    const sentWords: string[] = matchWords(sentence.toLowerCase(), /\b[a-z]{4,}\b/g);
    let score: number = sentWords.reduce((sum: number, w: string) => sum + (wordFreq[w] ?? 0), 0);
    if (index < 3) score = score * 1.4;
    if (index >= sentences.length - 2) score = score * 1.1;
    return { sentence: sentence.trim(), score };
  });

  const top: string[] = scored
    .slice()
    .sort((a: ScoredSentence, b: ScoredSentence) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a: ScoredSentence, b: ScoredSentence) => scored.indexOf(a) - scored.indexOf(b))
    .map((s: ScoredSentence) => s.sentence);

  return top.join(" ");
}

export function generateFlashcards(text: string, maxCards = 20): GeneratedFlashcard[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences: string[] = matchSentences(cleaned);
  if (sentences.length === 0) return [];

  const cards: GeneratedFlashcard[] = [];

  // Pattern 1: "X is/are/means Y" → "What is X?"
  const definitionPattern =
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|are|was|were|refers? to|means?|describes?)\s+([^.!?]{15,100}[.!?])/g;

  let match: RegExpExecArray | null;
  while ((match = definitionPattern.exec(cleaned)) !== null && cards.length < maxCards) {
    const term: string = match[1].trim();
    const definition: string = (match[2] ?? "").trim();
    if (term.split(" ").length <= 5 && definition.length > 10) {
      cards.push({
        question: `What is ${term}?`,
        answer: definition.replace(/[.!?]$/, "").trim(),
      });
    }
  }

  // Pattern 2: Sentences with key signal words → fill-in-the-blank
  const signals: RegExp[] = [
    /\b(?:important|key|crucial|critical|essential|significant|major|primary|main|fundamental|notable|central)\b/i,
    /\b(?:therefore|consequently|thus|hence|as a result|in conclusion|this means)\b/i,
    /\b(?:first|second|third|finally|lastly|additionally|furthermore|moreover)\b/i,
  ];

  for (const sentence of sentences) {
    if (cards.length >= maxCards) break;
    const trimmed: string = sentence.trim();
    if (trimmed.length < 30 || trimmed.length > 300) continue;
    const hasSignal: boolean = signals.some((s: RegExp) => s.test(trimmed));
    if (!hasSignal) continue;

    const wordList: string[] = trimmed.replace(/[.!?]$/, "").split(/\s+/);
    if (wordList.length < 6) continue;

    const contentWordIdx: number = wordList.findIndex(
      (w: string, i: number) =>
        i > 1 &&
        w.length > 5 &&
        /^[a-zA-Z]/.test(w) &&
        !/^(which|where|there|their|about|these|those|would|could|should|being|having)$/i.test(w)
    );

    if (contentWordIdx !== -1) {
      const blanked: string = wordList.map((w: string, i: number) => (i === contentWordIdx ? "_____" : w)).join(" ");
      cards.push({
        question: `Complete: "${blanked}"`,
        answer: wordList[contentWordIdx] ?? "",
      });
    }
  }

  // Pattern 3: Content-heavy sentences split into completion Q&A
  if (cards.length < 8) {
    const wordFreq: Record<string, number> = {};
    const allWords: string[] = matchWords(cleaned.toLowerCase(), /\b[a-z]{5,}\b/g);
    for (const w of allWords) wordFreq[w] = (wordFreq[w] ?? 0) + 1;

    interface Ranked { s: string; score: number }
    const ranked: Ranked[] = sentences
      .map((s: string): Ranked => {
        const ws: string[] = matchWords(s.toLowerCase(), /\b[a-z]{5,}\b/g);
        const score: number = ws.reduce((n: number, w: string) => n + (wordFreq[w] ?? 0), 0);
        return { s: s.trim(), score };
      })
      .filter((x: Ranked) => x.s.length > 40 && x.s.length < 250)
      .sort((a: Ranked, b: Ranked) => b.score - a.score)
      .slice(0, maxCards - cards.length);

    for (const { s } of ranked) {
      if (cards.length >= maxCards) break;
      const noEnd: string = s.replace(/[.!?]$/, "");
      const half: number = Math.ceil(noEnd.length / 2);
      const breakAt: number = noEnd.indexOf(" ", half);
      if (breakAt === -1) continue;
      const q: string = noEnd.slice(0, breakAt).trim();
      const a: string = noEnd.slice(breakAt + 1).trim();
      if (q.length > 15 && a.length > 5) {
        cards.push({ question: `${q}... (complete the idea)`, answer: a });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return cards.filter((c: GeneratedFlashcard) => {
    const key: string = c.question.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractVideoId(url: string): string | null {
  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m) return m[1] ?? null;
  }
  return null;
}
