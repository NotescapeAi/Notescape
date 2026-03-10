import { describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("axios", () => {
  const create = vi.fn(() => ({
    post: postMock,
  }));
  return {
    default: {
      create,
      isAxiosError: () => false,
    },
  };
});

vi.mock("../src/firebase/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("test-token"),
    },
  },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

describe("transcribeVoiceFlashcardAnswer", () => {
  it("sends audio as FormData with audio field and lets browser set multipart boundary", async () => {
    postMock.mockResolvedValueOnce({
      data: { transcript: "hello", audio_url: null },
    });
    const { transcribeVoiceFlashcardAnswer } = await import("../src/lib/api");
    const blob = new Blob(["audio"], { type: "audio/webm" });

    const result = await transcribeVoiceFlashcardAnswer(blob);

    expect(result.transcript).toBe("hello");
    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, form, config] = postMock.mock.calls[0];
    expect(url).toBe("/flashcards/voice/transcribe");
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("audio")).toBeInstanceOf(File);
    expect(config.headers.Authorization).toBe("Bearer test-token");
    expect("Content-Type" in (config.headers || {})).toBe(false);
  });
});
