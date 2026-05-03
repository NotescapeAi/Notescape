import { pickEnglishVoice } from "./voiceQuizUtils";

export type SpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: () => void;
};

let utteranceSeq = 0;

/** Cancel any in-flight speech (no overlap). */
export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

/**
 * Speak text with browser TTS. Cancels previous speech first.
 * Uses a natural English voice when available.
 */
export function speakText(text: string, options: SpeakOptions = {}): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options.onEnd?.();
    return;
  }
  const trimmed = (text || "").trim();
  if (!trimmed) {
    options.onEnd?.();
    return;
  }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(trimmed);
  u.rate = options.rate ?? 0.9;
  u.pitch = options.pitch ?? 1;
  u.volume = options.volume ?? 1;
  const voice = pickEnglishVoice();
  if (voice) u.voice = voice;
  const id = ++utteranceSeq;
  u.onend = () => {
    if (id === utteranceSeq) options.onEnd?.();
  };
  u.onerror = () => {
    if (id === utteranceSeq) options.onError?.() ?? options.onEnd?.();
  };
  window.speechSynthesis.speak(u);
}
