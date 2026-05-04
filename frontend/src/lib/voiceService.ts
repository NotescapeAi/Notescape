/**
 * Unified voice service for the Voice Flashcards experience.
 *
 * Responsibilities:
 *   - Browser TTS with cancel/pause/resume + best-voice picker (prefers natural / Neural / Premium voices).
 *   - Persisted user voice preferences (voice URI, rate, pitch, volume) in localStorage.
 *   - Pluggable surface — `speak()` is the only call site the UI needs; future premium TTS providers
 *     can be wired in here without touching the UI.
 *
 * Browser TTS is the default. If a premium TTS endpoint is configured server-side, this module
 * should be the only place to add the network call (gracefully falling back to browser TTS on
 * failure or missing config). No API keys are read from the client.
 */

const PREFS_KEY = "notescape.voice.prefs.v1";

/* ─────────────────────────── Voice preferences ─────────────────────────── */

export type VoicePrefs = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  voiceURI: null,
  rate: 0.95,
  pitch: 1.0,
  volume: 1.0,
};

export function loadVoicePrefs(): VoicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_PREFS };
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      rate: clamp(Number(parsed.rate ?? DEFAULT_VOICE_PREFS.rate), 0.5, 1.6),
      pitch: clamp(Number(parsed.pitch ?? DEFAULT_VOICE_PREFS.pitch), 0.5, 1.5),
      volume: clamp(Number(parsed.volume ?? DEFAULT_VOICE_PREFS.volume), 0, 1),
    };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage might be unavailable (private browsing); ignore */
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/* ─────────────────────────── Capabilities ─────────────────────────── */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function getSpeechRecognitionCtor(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/* ─────────────────────────── Voice picking ─────────────────────────── */

/**
 * Quality hints (case-insensitive substring match against voice name + voiceURI).
 * Earlier entries win. Tuned to surface natural-sounding voices on Chrome / Edge / Safari.
 */
const PREMIUM_HINTS = [
  "neural",
  "natural",
  "premium",
  "online",
  "studio",
  "wavenet",
  "polly",
  "azure",
];

const PREFERRED_NAMED_VOICES = [
  "Google US English",
  "Google UK English Female",
  "Google UK English Male",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Microsoft Guy",
  "Samantha",
  "Karen",
  "Daniel",
  "Alex",
];

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return getAvailableVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
}

/** Picks the best natural-sounding English voice available, falling back gracefully. */
export function selectBestDefaultVoice(): SpeechSynthesisVoice | null {
  const en = getEnglishVoices();
  if (!en.length) return getAvailableVoices()[0] ?? null;

  const lc = (s: string) => (s || "").toLowerCase();

  // 1) Premium / neural-class voices first.
  for (const hint of PREMIUM_HINTS) {
    const v = en.find((x) => lc(x.name).includes(hint) || lc(x.voiceURI).includes(hint));
    if (v) return v;
  }

  // 2) Known good named voices on common platforms.
  for (const named of PREFERRED_NAMED_VOICES) {
    const v = en.find((x) => x.name.includes(named));
    if (v) return v;
  }

  // 3) Any non-default English voice (the OS default tends to be the most basic).
  const nonDefault = en.find((x) => !x.default);
  if (nonDefault) return nonDefault;

  return en[0] ?? null;
}

export function findVoiceByURI(uri: string | null | undefined): SpeechSynthesisVoice | null {
  if (!uri) return null;
  return getAvailableVoices().find((v) => v.voiceURI === uri) ?? null;
}

/* ─────────────────────────── Speech synthesis ─────────────────────────── */

export type SpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice | null;
  prefs?: VoicePrefs;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e?: unknown) => void;
};

/**
 * Speak text. Cancels any in-flight speech first to avoid overlap.
 * Returns immediately; use onEnd for sequencing.
 */
let utteranceSeq = 0;

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!isSpeechSynthesisSupported()) {
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
  const prefs = options.prefs;
  u.rate = options.rate ?? prefs?.rate ?? DEFAULT_VOICE_PREFS.rate;
  u.pitch = options.pitch ?? prefs?.pitch ?? DEFAULT_VOICE_PREFS.pitch;
  u.volume = options.volume ?? prefs?.volume ?? DEFAULT_VOICE_PREFS.volume;

  const voice =
    options.voice ??
    findVoiceByURI(prefs?.voiceURI ?? null) ??
    selectBestDefaultVoice();
  if (voice) u.voice = voice;

  const id = ++utteranceSeq;
  u.onstart = () => {
    if (id === utteranceSeq) options.onStart?.();
  };
  u.onend = () => {
    if (id === utteranceSeq) options.onEnd?.();
  };
  u.onerror = (event) => {
    if (id !== utteranceSeq) return;
    if (options.onError) options.onError(event);
    else options.onEnd?.();
  };
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  utteranceSeq += 1; // invalidate pending callbacks
  window.speechSynthesis.cancel();
}

export function pauseSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.pause();
  } catch {
    /* unsupported on some platforms */
  }
}

export function resumeSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* unsupported on some platforms */
  }
}

/* ─────────────────────────── Text helpers ─────────────────────────── */

/**
 * Add small natural pauses for speech: extra punctuation makes most TTS engines
 * insert short breaths between phrases.
 */
export function withSpeechPauses(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(". ");
}

/** Trim noisy artifacts like raw JSON dumps that occasionally leak from upstream generators. */
export function sanitizeFlashcardText(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes('"cards"')) return "This card needs regeneration.";
  return text;
}
