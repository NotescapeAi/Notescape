/**
 * Voice command parsing — keep Voice Flashcards and Voice Quiz parsers separate.
 */

function norm(s: string) {
  return s.toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
}

export type VoiceFlashcardsCommand =
  | "next_card"
  | "previous_card"
  | "repeat_question"
  | "repeat_answer"
  | "show_answer"
  | "hide_answer"
  | "explain_more"
  | "i_dont_know"
  | "mark_hard"
  | "mark_again"
  | "mark_good"
  | "mark_easy"
  | "mark_mastered"
  | "pause"
  | "resume"
  | "end_session"
  | "confirm_end"
  | "unknown";

/** Parse transcript for Voice Flashcards / hands-free revision mode. */
export function parseVoiceFlashcardsCommand(raw: string): VoiceFlashcardsCommand {
  const t = norm(raw);
  if (!t) return "unknown";

  if (/\b(confirm end|confirm stop)\b/.test(t)) return "confirm_end";
  if (/\b(end session|stop session|finish revision|quit session)\b/.test(t)) return "end_session";
  if (/\b(pause session|hold on|pause)\b/.test(t)) return "pause";
  if (/\b(resume session|continue session|resume|unpause)\b/.test(t)) return "resume";

  if (/\b(mark mastered|mastered)\b/.test(t)) return "mark_mastered";
  if (/\b(mark easy|mark as easy)\b/.test(t)) return "mark_easy";
  if (/\b(mark good|mark as good)\b/.test(t)) return "mark_good";
  if (/\b(mark hard|mark as hard)\b/.test(t)) return "mark_hard";
  if (/\b(mark again|again)\b/.test(t) && /\bmark\b/.test(t)) return "mark_again";

  if (/\b(i remember|got it|i know)\b/.test(t)) return "next_card";

  if (/\b(i don'?t know|i forgot|no idea|not sure|can'?t remember)\b/.test(t)) return "i_dont_know";

  if (
    /\b(explain more|teach me|explain simply|simplify|give example|give me an example|explain that|what does that mean)\b/.test(t)
  ) {
    return "explain_more";
  }

  if (/\b(repeat answer|say the answer again|read the answer again|read it again)\b/.test(t)) return "repeat_answer";

  if (/\b(hide answer|hide the answer|conceal answer)\b/.test(t)) return "hide_answer";

  if (
    /\b(show answer|read answer|tell me the answer|what is the answer|what'?s the answer|give me the answer)\b/.test(t)
  ) {
    return "show_answer";
  }

  if (/\b(repeat question|repeat card|say again|read question again|repeat that question)\b/.test(t)) return "repeat_question";

  if (/\b(previous card|go back|last card|previous)\b/.test(t)) return "previous_card";

  if (/\b(next card|next question|next one|move on|continue|skip card|skip)\b/.test(t)) return "next_card";
  if (t === "next") return "next_card";

  return "unknown";
}

export type VoiceQuizCommand =
  | "next_question"
  | "repeat_question"
  | "retry_answer"
  | "skip_question"
  | "pause_quiz"
  | "resume_quiz"
  | "end_quiz"
  | "unknown";

export function parseVoiceQuizCommand(raw: string): VoiceQuizCommand {
  const t = norm(raw);
  if (!t) return "unknown";

  if (/\b(end quiz|stop quiz|quit quiz)\b/.test(t)) return "end_quiz";
  if (/\b(pause quiz|pause)\b/.test(t)) return "pause_quiz";
  if (/\b(resume quiz|resume)\b/.test(t)) return "resume_quiz";

  if (/\b(retry answer|try again|record again)\b/.test(t)) return "retry_answer";
  if (/\b(skip question|skip this|skip)\b/.test(t)) return "skip_question";
  if (/\b(repeat question|say question again|read question again)\b/.test(t)) return "repeat_question";
  if (/\b(next question|next card|continue)\b/.test(t)) return "next_question";
  if (t === "next") return "next_question";

  return "unknown";
}
