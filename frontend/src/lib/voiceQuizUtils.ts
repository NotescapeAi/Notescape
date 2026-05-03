import type { VoiceEvaluationResult } from "./api";

/** Map API score (1–5) to 0–1 for quiz thresholds. */
export function voiceScoreToNormalized(score: number): number {
  return Math.max(0, Math.min(1, (Number(score) || 0) / 5));
}

export type QuizVerdict = "correct" | "partial" | "incorrect";

export function verdictFromNormalized(n: number): QuizVerdict {
  if (n >= 0.85) return "correct";
  if (n >= 0.55) return "partial";
  return "incorrect";
}

export function quizVerdictLabel(v: QuizVerdict): string {
  if (v === "correct") return "Correct";
  if (v === "partial") return "Partially correct";
  return "Incorrect";
}

export function quizResultFromEvaluation(ev: VoiceEvaluationResult): {
  normalized: number;
  verdict: QuizVerdict;
  label: string;
} {
  const normalized = voiceScoreToNormalized(ev.score);
  const verdict = verdictFromNormalized(normalized);
  return { normalized, verdict, label: quizVerdictLabel(verdict) };
}

/** Persisted SM-2 style rating for backend (1 again … 5 easy). Mirrors evaluation strength. */
export function sm2RatingFromEvaluationScore(score: number): 1 | 2 | 3 | 4 | 5 {
  const s = Math.round(Number(score) || 0);
  const clamped = Math.max(1, Math.min(5, s));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

/** Client-side fallback when /voice/evaluate is unavailable (same spirit as backend local scorer). */
export function localEvaluateVoiceAnswer(expected: string, actual: string): VoiceEvaluationResult {
  const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ");
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "you", "your",
    "have", "has", "had", "but", "not", "into", "its", "their", "about", "what", "when", "where",
    "why", "how", "which", "also", "can",
  ]);
  const expectedTerms = clean(expected)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const actualTerms = new Set(clean(actual).split(/\s+/).filter(Boolean));
  const unique = Array.from(new Set(expectedTerms));
  const ratio = unique.length ? unique.filter((w) => actualTerms.has(w)).length / unique.length : 0;
  const score = ratio >= 0.82 ? 5 : ratio >= 0.62 ? 4 : ratio >= 0.4 ? 3 : ratio >= 0.18 ? 2 : actual.trim() ? 1 : 0;
  return {
    score,
    feedback:
      score >= 4
        ? "Good answer. You covered the key ideas in the expected response."
        : score >= 3
          ? "Partially correct. Some important concepts were present, but details were missing."
          : score >= 2
            ? "Weak match. You mentioned related ideas but missed the main points."
            : actual.trim()
              ? "Incorrect. Your answer did not align closely with the expected answer."
              : "No answer was captured.",
    missingPoints: unique.filter((w) => !actualTerms.has(w)).slice(0, 6),
    isCorrectEnough: score >= 4,
  };
}

const PREFERRED_VOICE_SUBSTRINGS = ["Google US English", "Samantha", "Karen", "Daniel", "Alex"];

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  for (const hint of PREFERRED_VOICE_SUBSTRINGS) {
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith("en") && x.name.includes(hint));
    if (v) return v;
  }
  const en = voices.find((x) => x.lang?.toLowerCase().startsWith("en"));
  return en ?? voices[0] ?? null;
}
