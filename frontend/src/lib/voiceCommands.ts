/**
 * Voice command parsing for the unified Voice Flashcards experience.
 *
 * One `parseVoiceCommand` covers every spoken intent in both Teach Me and Ask Me modes.
 * Backwards-compatible wrappers (`parseVoiceFlashcardsCommand`, `parseVoiceQuizCommand`) remain
 * exported so older imports keep compiling, but new code should use `parseVoiceCommand`.
 */

function norm(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type VoiceCommand =
  // Navigation
  | "next_card"
  | "previous_card"
  | "repeat_question"
  | "repeat_answer"
  | "repeat" // generic — repeat last spoken content
  | "show_answer"
  | "hide_answer"
  | "explain_more"
  | "i_dont_know"
  // Self-test (Ask Me) flow
  | "try_again"
  | "skip_question"
  // SRS marks
  | "mark_again"
  | "mark_hard"
  | "mark_good"
  | "mark_easy"
  | "mark_mastered"
  // Mode switching
  | "mode_teach"
  | "mode_ask"
  | "mode_mixed"
  // Session control
  | "pause"
  | "resume"
  | "end_session"
  | "confirm_end"
  | "open_settings"
  | "unknown";

export function parseVoiceCommand(raw: string): VoiceCommand {
  const t = norm(raw);
  if (!t) return "unknown";

  /* End / pause / resume — most disruptive intents first. */
  if (/\b(confirm end|confirm stop|yes end|yes stop)\b/.test(t)) return "confirm_end";
  if (/\b(end session|end quiz|stop session|stop quiz|finish session|quit session)\b/.test(t)) {
    return "end_session";
  }
  if (/\b(pause( quiz| session)?|hold on)\b/.test(t)) return "pause";
  if (/\b(resume( quiz| session)?|continue|unpause|keep going)\b/.test(t)) return "resume";

  /* Mode switching — must come BEFORE generic "ask" / "teach" matches in answers etc. */
  if (/\b(teach me|teach mode|teach)\b/.test(t)) return "mode_teach";
  if (/\b(ask me|quiz me|test me|ask mode|quiz mode|test mode)\b/.test(t)) return "mode_ask";
  if (/\b(mixed mode|mixed)\b/.test(t)) return "mode_mixed";

  /* SRS marks. */
  if (/\b(mark mastered|mastered|i mastered (it|this))\b/.test(t)) return "mark_mastered";
  if (/\b(mark easy|mark as easy|easy)\b/.test(t) && !/\b(not easy)\b/.test(t)) return "mark_easy";
  if (/\b(mark good|mark as good|good)\b/.test(t) && !/\b(not good)\b/.test(t)) return "mark_good";
  if (/\b(mark hard|mark as hard|hard)\b/.test(t) && !/\b(not hard)\b/.test(t)) return "mark_hard";
  if (/\b(mark again|again|reset)\b/.test(t) && /\bmark\b/.test(t)) return "mark_again";

  /* "I don't know" → reveal answer (works in both modes). */
  if (/\b(i don'?t know|i forgot|no idea|not sure|can'?t remember|give up)\b/.test(t)) {
    return "i_dont_know";
  }

  /* Explain. */
  if (
    /\b(explain( more| this| it)?|explain simply|simplify|give( me)? an example|what does that mean|tell me more)\b/.test(
      t,
    )
  ) {
    return "explain_more";
  }

  /* Settings. */
  if (/\b(voice settings|open settings|change voice)\b/.test(t)) return "open_settings";

  /* Hide answer. */
  if (/\b(hide( the)? answer|conceal answer|hide it)\b/.test(t)) return "hide_answer";

  /* Repeat answer. */
  if (
    /\b(repeat( the)? answer|say( the)? answer again|read( the)? answer again|tell( me)? the answer again)\b/.test(
      t,
    )
  ) {
    return "repeat_answer";
  }

  /* Show / read the answer. */
  if (
    /\b(show( the)? answer|read( the)? answer|tell me( the)? answer|what(?:'s| is)( the)? answer|give me( the)? answer)\b/.test(
      t,
    )
  ) {
    return "show_answer";
  }

  /* Repeat question. */
  if (
    /\b(repeat( the)? question|repeat card|say( it| that)? again|read( the)? question again|repeat that)\b/.test(
      t,
    )
  ) {
    return "repeat_question";
  }

  /* Generic repeat — repeats last spoken content (answer if shown, otherwise question). */
  if (/\b(repeat|say again|once more|again please)\b/.test(t)) return "repeat";

  /* Try again — Ask Me mode. */
  if (/\b(try again|retry( answer)?|record again|let me try)\b/.test(t)) return "try_again";

  /* Skip — distinct from next, but practically the same effect. */
  if (/\b(skip( this| card| question)?)\b/.test(t)) return "skip_question";

  /* Previous. */
  if (/\b(previous card|previous question|go back|last card|previous|back)\b/.test(t)) {
    return "previous_card";
  }

  /* Next. */
  if (/\b(next card|next question|next one|move on|continue|go on)\b/.test(t)) return "next_card";
  if (t === "next") return "next_card";

  return "unknown";
}

/* ─────────────── Backwards-compat exports (do not use in new code) ─────────────── */

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

export function parseVoiceFlashcardsCommand(raw: string): VoiceFlashcardsCommand {
  const cmd = parseVoiceCommand(raw);
  switch (cmd) {
    case "repeat":
    case "skip_question":
    case "try_again":
    case "mode_teach":
    case "mode_ask":
    case "mode_mixed":
    case "open_settings":
      return "unknown";
    default:
      return cmd as VoiceFlashcardsCommand;
  }
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
  const cmd = parseVoiceCommand(raw);
  switch (cmd) {
    case "next_card":
      return "next_question";
    case "repeat_question":
      return "repeat_question";
    case "try_again":
      return "retry_answer";
    case "skip_question":
      return "skip_question";
    case "pause":
      return "pause_quiz";
    case "resume":
      return "resume_quiz";
    case "end_session":
      return "end_quiz";
    default:
      return "unknown";
  }
}
