import { useEffect, useMemo, useState } from "react";
import { Volume2, X } from "lucide-react";
import {
  DEFAULT_VOICE_PREFS,
  findVoiceByURI,
  getEnglishVoices,
  isSpeechSynthesisSupported,
  saveVoicePrefs,
  selectBestDefaultVoice,
  speak,
  stopSpeaking,
  type VoicePrefs,
} from "../lib/voiceService";

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: VoicePrefs;
  onChange: (next: VoicePrefs) => void;
};

const TEST_LINE =
  "Hi! This is how flashcards will sound during your study session. Adjust the speed and pitch until it feels comfortable.";

export default function VoiceSettingsPanel({ open, onClose, prefs, onChange }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = isSpeechSynthesisSupported();

  // Voices load asynchronously on most browsers.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    function refresh() {
      if (cancelled) return;
      setVoices(getEnglishVoices());
    }
    refresh();
    const handler = () => refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", handler);
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener?.("voiceschanged", handler);
    };
  }, [supported]);

  // Stop any test playback when the panel closes.
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const activeVoice = useMemo(
    () => findVoiceByURI(prefs.voiceURI) || selectBestDefaultVoice(),
    [prefs.voiceURI, voices.length],
  );

  function update(patch: Partial<VoicePrefs>) {
    const next: VoicePrefs = { ...prefs, ...patch };
    onChange(next);
    saveVoicePrefs(next);
  }

  function handleTest() {
    speak(TEST_LINE, { prefs });
  }

  function handleReset() {
    update({ ...DEFAULT_VOICE_PREFS });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--overlay)] backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-settings-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-t-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-elevated)] sm:rounded-[var(--radius-2xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <span className="eyebrow">
              <span className="eyebrow-dot" aria-hidden />
              Voice settings
            </span>
            <h2
              id="voice-settings-title"
              className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-main)]"
            >
              Tune how the app sounds
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
              Saved on this device. Used by every voice flashcard session.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice settings"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {!supported ? (
            <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
              Speech synthesis is not available in this browser.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--text-main)]">Voice</span>
                <select
                  value={prefs.voiceURI ?? activeVoice?.voiceURI ?? ""}
                  onChange={(e) => update({ voiceURI: e.target.value || null })}
                  className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-main)] focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {voices.length === 0 ? (
                    <option value="">Loading voices…</option>
                  ) : (
                    <>
                      <option value="">Auto (best available)</option>
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} {v.lang ? `· ${v.lang}` : ""}
                          {v.default ? " · default" : ""}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {activeVoice ? (
                  <span className="text-[11.5px] text-[var(--text-muted-soft)]">
                    Currently: <span className="text-[var(--text-muted)]">{activeVoice.name}</span>
                  </span>
                ) : null}
              </label>

              <Slider
                label="Speed"
                min={0.6}
                max={1.4}
                step={0.05}
                value={prefs.rate}
                format={(n) => `${n.toFixed(2)}x`}
                onChange={(rate) => update({ rate })}
              />
              <Slider
                label="Pitch"
                min={0.7}
                max={1.4}
                step={0.05}
                value={prefs.pitch}
                format={(n) => n.toFixed(2)}
                onChange={(pitch) => update({ pitch })}
              />
              <Slider
                label="Volume"
                min={0}
                max={1}
                step={0.05}
                value={prefs.volume}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(volume) => update({ volume })}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12.5px] font-medium text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text-main)] hover:underline"
          >
            Reset to default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!supported}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Volume2 className="h-4 w-4" />
              Test voice
            </button>
            <button type="button" onClick={onClose} className="btn-premium h-9">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
};

function Slider({ label, min, max, step, value, format, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-[var(--text-main)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--text-muted)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--primary)]"
      />
    </label>
  );
}
