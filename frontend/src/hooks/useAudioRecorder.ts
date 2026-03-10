import { useCallback, useEffect, useRef, useState } from "react";

type RecorderStatus = "idle" | "recording" | "stopped" | "error";
type MicPermission = "unknown" | "granted" | "denied" | "unsupported";

type StartRecordingOptions = {
  maxDurationMs?: number;
  silenceDurationMs?: number;
  minDurationMs?: number;
  silenceThreshold?: number;
};

function toMessage(err: unknown) {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return "Microphone permission was denied. Please allow microphone access and try again.";
    }
    if (err.name === "NotFoundError") {
      return "No microphone was found on this device.";
    }
    return err.message || "Unable to start audio recording.";
  }
  if (err instanceof Error) return err.message;
  return "Unable to start audio recording.";
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startMsRef = useRef<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setDurationSeconds(null);
    setError(null);
    if (status !== "recording") {
      setStatus("idle");
    }
  }, [status]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const cleanupAudioAnalysis = useCallback(() => {
    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    silenceStartRef.current = null;
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const selectMimeType = useCallback(() => {
    const opts = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const opt of opts) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(opt)) {
        return opt;
      }
    }
    return undefined;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async (options?: StartRecordingOptions) => {
    setError(null);
    setAudioBlob(null);
    setDurationSeconds(null);
    cleanupAudioAnalysis();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setPermission("unsupported");
      setError("Audio recording is not supported in this browser.");
      return false;
    }

    const maxDurationMs = Math.max(5000, options?.maxDurationMs ?? 25000);
    const silenceDurationMs = Math.max(800, options?.silenceDurationMs ?? 1800);
    const minDurationMs = Math.max(600, options?.minDurationMs ?? 1200);
    const silenceThreshold = Math.max(0.001, Math.min(0.05, options?.silenceThreshold ?? 0.012));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermission("granted");
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredMime = selectMimeType();
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      startMsRef.current = Date.now();
      setMimeType(recorder.mimeType || preferredMime || null);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setStatus("error");
        setError("An error occurred while recording audio.");
        cleanupAudioAnalysis();
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || preferredMime || "audio/webm",
        });
        const startMs = startMsRef.current;
        if (startMs) {
          setDurationSeconds(Math.max(0, (Date.now() - startMs) / 1000));
        }
        setAudioBlob(blob.size > 0 ? blob : null);
        setStatus("stopped");
        cleanupAudioAnalysis();
        cleanupStream();
      };

      recorder.start(250);

      try {
        const Ctor = (window as Window & typeof globalThis).AudioContext || (window as any).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          audioContextRef.current = ctx;
          sourceRef.current = source;
          analyserRef.current = analyser;

          const data = new Uint8Array(analyser.fftSize);
          silenceIntervalRef.current = window.setInterval(() => {
            if (!analyserRef.current || recorder.state !== "recording") return;
            analyserRef.current.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) {
              const centered = (data[i] - 128) / 128;
              sum += centered * centered;
            }
            const rms = Math.sqrt(sum / data.length);
            const elapsed = startMsRef.current ? Date.now() - startMsRef.current : 0;
            if (elapsed < minDurationMs) return;

            if (rms < silenceThreshold) {
              if (!silenceStartRef.current) silenceStartRef.current = Date.now();
              if (Date.now() - silenceStartRef.current >= silenceDurationMs) {
                stopRecording();
              }
              return;
            }
            silenceStartRef.current = null;
          }, 180);
        }
      } catch {
        // Continue recording even if silence auto-stop setup is unavailable.
      }

      timeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, maxDurationMs);

      setStatus("recording");
      return true;
    } catch (err) {
      setStatus("error");
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setPermission("denied");
      }
      setError(toMessage(err));
      cleanupAudioAnalysis();
      cleanupStream();
      return false;
    }
  }, [cleanupAudioAnalysis, cleanupStream, selectMimeType, stopRecording]);

  useEffect(() => {
    return () => {
      try {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      } catch {
        // no-op
      }
      cleanupAudioAnalysis();
      cleanupStream();
    };
  }, [cleanupAudioAnalysis, cleanupStream]);

  return {
    status,
    permission,
    audioBlob,
    mimeType,
    durationSeconds,
    error,
    startRecording,
    stopRecording,
    reset,
    isRecording: status === "recording",
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  };
}
