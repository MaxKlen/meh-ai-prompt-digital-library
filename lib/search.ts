import type { PromptRecord } from "@/types/prompt";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for",
  "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or",
  "please", "prompt", "the", "to", "with", "you", "your",
]);

const RELATED_TERMS: Record<string, string[]> = {
  write: ["writing", "writer", "draft", "editing"],
  writing: ["write", "writer", "draft", "editing"],
  edit: ["editing", "rewrite", "proofread", "writing"],
  coding: ["code", "programming", "software", "development"],
  code: ["coding", "programming", "software", "debugging"],
  programming: ["code", "coding", "software", "development"],
  summarize: ["summary", "summarization", "research", "notes"],
  summary: ["summarize", "summarization", "research"],
  translate: ["translation", "localization", "language"],
  translation: ["translate", "localization", "language"],
  plan: ["planning", "project", "strategy", "schedule"],
  planning: ["plan", "project", "strategy", "schedule"],
  image: ["visual", "picture", "illustration", "design"],
  visual: ["image", "picture", "illustration", "design"],
  video: ["film", "storyboard", "shot", "visual"],
  research: ["academic", "study", "summarization", "analysis"],
  data: ["analysis", "analytics", "metrics", "table"],
  analysis: ["data", "analytics", "research", "metrics"],
  email: ["message", "workplace", "communication", "reply"],
  marketing: ["campaign", "brand", "copy", "content"],
  teaching: ["learning", "lesson", "education", "study"],
  learning: ["teaching", "lesson", "education", "study"],
  support: ["customer", "service", "response", "help"],
};

function tokenize(value: string): string[] {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function cappedOccurrences(text: string, term: string, cap = 4): number {
  let count = 0;
  let offset = 0;
  while (count < cap) {
    const found = text.indexOf(term, offset);
    if (found < 0) break;
    count += 1;
    offset = found + term.length;
  }
  return count;
}

type ScoredPrompt = { prompt: PromptRecord; score: number };

export function searchPrompts(query: string, prompts: PromptRecord[], limit = 50): ScoredPrompt[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryTokens = [...new Set(tokenize(normalizedQuery))];
  if (!normalizedQuery || queryTokens.length === 0) return [];

  const expanded = new Map<string, number>();
  queryTokens.forEach((token) => expanded.set(token, 1));
  for (const token of queryTokens) {
    for (const related of RELATED_TERMS[token] ?? []) {
      for (const term of tokenize(related)) {
        if (!expanded.has(term)) expanded.set(term, 0.4);
      }
    }
  }

  const scored: ScoredPrompt[] = prompts.map((prompt) => {
    const title = prompt.title.toLocaleLowerCase();
    const category = prompt.category.toLocaleLowerCase();
    const tags = prompt.tags.join(" ").toLocaleLowerCase();
    const description = prompt.description.toLocaleLowerCase();
    const metadata = `${prompt.framework} ${prompt.difficulty} ${prompt.intent} ${prompt.modality} ${prompt.language ?? ""}`.toLocaleLowerCase();
    const content = prompt.content.toLocaleLowerCase();
    let score = normalizedQuery.length > 2 && title.includes(normalizedQuery) ? 14 : 0;

    for (const [term, weight] of expanded) {
      const direct = weight === 1;
      if (title.includes(term)) score += (direct ? 5 : 2) * weight;
      if (tags.includes(term)) score += (direct ? 3.5 : 1.4) * weight;
      if (category.includes(term)) score += (direct ? 3 : 1.2) * weight;
      if (description.includes(term)) score += (direct ? 2.5 : 1) * weight;
      if (metadata.includes(term)) score += (direct ? 2 : 0.8) * weight;
      const occurrences = cappedOccurrences(content, term);
      if (occurrences) score += Math.min(occurrences, 3) * (direct ? 0.28 : 0.12) * weight;
    }
    return { prompt, score };
  });

  return scored
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.prompt.title.localeCompare(b.prompt.title))
    .slice(0, Math.max(1, limit));
}
