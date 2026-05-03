import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VoiceQuizMode from "../src/components/VoiceQuizMode";

const mockApi = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((err: unknown, fallback: string) =>
    err instanceof Error && err.message.trim() ? err.message : fallback
  ),
  endStudySession: vi.fn().mockResolvedValue({}),
  heartbeatStudySession: vi.fn().mockResolvedValue({}),
  evaluateVoiceFlashcardAnswer: vi.fn().mockResolvedValue({
    score: 4,
    feedback: "Good match.",
    missingPoints: ["semipermeable"],
    isCorrectEnough: true,
  }),
  listClasses: vi.fn().mockResolvedValue([{ id: 1, name: "Biology" }]),
  listFlashcards: vi.fn().mockResolvedValue([]),
  saveVoiceFlashcardAttempt: vi.fn().mockResolvedValue({
    ok: true,
    attempt_id: "attempt-1234",
    mode: "voice",
    state: {},
  }),
  startStudySession: vi.fn().mockResolvedValue({
    id: "study-1",
    user_id: "u1",
    mode: "voice",
  }),
  transcribeVoiceFlashcardAnswer: vi.fn().mockResolvedValue({
    transcript: "mock transcript",
    audio_url: null,
  }),
}));

let recorderState: {
  status: "idle" | "recording" | "stopped" | "error";
  permission: "unknown" | "granted" | "denied" | "unsupported";
  audioBlob: Blob | null;
  durationSeconds: number | null;
  error: string | null;
};
const startRecordingMock = vi.fn(async () => true);
const stopRecordingMock = vi.fn();
const resetMock = vi.fn();
const speechSpeakMock = vi.fn((utterance: any) => {
  utterance.onstart?.();
  utterance.onend?.();
});
const speechCancelMock = vi.fn();

vi.mock("../src/lib/api", () => mockApi);
vi.mock("../src/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    status: recorderState.status,
    permission: recorderState.permission,
    audioBlob: recorderState.audioBlob,
    mimeType: "audio/webm",
    durationSeconds: recorderState.durationSeconds,
    error: recorderState.error,
    startRecording: startRecordingMock,
    stopRecording: stopRecordingMock,
    reset: resetMock,
    isRecording: recorderState.status === "recording",
    isSupported: true,
  }),
}));

describe("VoiceQuizMode conversational flow", () => {
  beforeEach(() => {
    recorderState = {
      status: "idle",
      permission: "unknown",
      audioBlob: null,
      durationSeconds: 2.3,
      error: null,
    };
    mockApi.endStudySession.mockClear();
    mockApi.heartbeatStudySession.mockClear();
    mockApi.listClasses.mockClear();
    mockApi.listFlashcards.mockClear();
    mockApi.saveVoiceFlashcardAttempt.mockClear();
    mockApi.startStudySession.mockClear();
    mockApi.transcribeVoiceFlashcardAnswer.mockClear();
    mockApi.evaluateVoiceFlashcardAnswer.mockClear();
    startRecordingMock.mockClear();
    stopRecordingMock.mockClear();
    resetMock.mockClear();
    speechSpeakMock.mockClear();
    speechCancelMock.mockClear();

    (globalThis as any).SpeechSynthesisUtterance = function SpeechSynthesisUtterance(this: any, text: string) {
      this.text = text;
      this.onstart = undefined;
      this.onend = undefined;
      this.onerror = undefined;
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: speechSpeakMock,
        cancel: speechCancelMock,
        getVoices: () => [],
      },
    });
  });

  it("auto-reads question on card load and transitions to waiting state", async () => {
    render(
      <VoiceQuizMode
        classId={1}
        initialClassName="Biology"
        initialCards={[{ id: "c1", question: "What is ATP?", answer: "Energy currency." }]}
      />
    );

    await waitFor(() => {
      expect(speechSpeakMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("button", { name: /start answering/i })).toBeInTheDocument();
  });

  it("shows transcript and evaluation after successful transcription", async () => {
    const cards = [{ id: "c1", question: "Define osmosis", answer: "Movement of water across a semipermeable membrane." }];
    const user = userEvent.setup();
    const { rerender } = render(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await user.click(screen.getByRole("button", { name: /start answering/i }));
    recorderState = { ...recorderState, status: "recording", permission: "granted" };
    rerender(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    recorderState = {
      ...recorderState,
      status: "stopped",
      permission: "granted",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
    };
    rerender(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await waitFor(() => {
      expect(mockApi.transcribeVoiceFlashcardAnswer.mock.calls.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(mockApi.evaluateVoiceFlashcardAnswer.mock.calls.length).toBeGreaterThan(0);
    });
    expect(await screen.findByText(/mock transcript/i)).toBeInTheDocument();
    expect(await screen.findByText(/Good match/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show expected answer/i }));
    expect(screen.getByText(/movement of water across a semipermeable membrane/i)).toBeInTheDocument();
  });

  it("saves attempt when user taps Next after evaluation", async () => {
    const cards = [{ id: "c1", question: "What is mitosis?", answer: "Cell division process." }];
    const user = userEvent.setup();
    const { rerender } = render(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await user.click(screen.getByRole("button", { name: /start answering/i }));
    recorderState = { ...recorderState, status: "recording", permission: "granted" };
    rerender(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );
    recorderState = {
      ...recorderState,
      status: "stopped",
      permission: "granted",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
    };
    rerender(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await screen.findByText(/mock transcript/i);
    await screen.findByText(/Good match/i);
    await user.click(screen.getByRole("button", { name: /next question/i }));

    await waitFor(() => {
      expect(mockApi.saveVoiceFlashcardAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          card_id: "c1",
          transcript: "mock transcript",
          user_rating: 4,
        })
      );
    });
  });

  it("renders a clear transcription error message", async () => {
    const cards = [{ id: "c1", question: "Q", answer: "A" }];
    mockApi.transcribeVoiceFlashcardAnswer.mockRejectedValueOnce(
      new Error("Transcription is unavailable: set TRANSCRIPTION_PROVIDER=openai and configure OPENAI_API_KEY.")
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await user.click(screen.getByRole("button", { name: /start answering/i }));
    recorderState = { ...recorderState, status: "recording", permission: "granted" };
    rerender(<VoiceQuizMode classId={1} initialCards={cards} />);
    recorderState = {
      ...recorderState,
      status: "stopped",
      permission: "granted",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
    };
    rerender(<VoiceQuizMode classId={1} initialCards={cards} />);

    expect(
      await screen.findByText(/voice transcription is not configured/i)
    ).toBeInTheDocument();
  });

  it("retries transcription from the same recording after a failed attempt", async () => {
    const cards = [{ id: "c1", question: "Q", answer: "A" }];
    mockApi.transcribeVoiceFlashcardAnswer
      .mockRejectedValueOnce(new Error("Temporary upstream error"))
      .mockResolvedValueOnce({ transcript: "retry transcript", audio_url: null });
    const user = userEvent.setup();
    const { rerender } = render(
      <VoiceQuizMode
        classId={1}
        initialCards={cards}
      />
    );

    await user.click(screen.getByRole("button", { name: /start answering/i }));
    recorderState = { ...recorderState, status: "recording", permission: "granted" };
    rerender(<VoiceQuizMode classId={1} initialCards={cards} />);
    recorderState = {
      ...recorderState,
      status: "stopped",
      permission: "granted",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
    };
    rerender(<VoiceQuizMode classId={1} initialCards={cards} />);

    expect(await screen.findByText(/temporary upstream error/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry transcription/i }));

    expect(await screen.findByText(/retry transcript/i)).toBeInTheDocument();
  });
});
