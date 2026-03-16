import { describe, expect, it } from "vitest";

import { getQuizCountPresentation } from "../src/pages/quizzes/quizCountUtils";

describe("getQuizCountPresentation", () => {
  it("prefers backend actual counts and flags mismatch", () => {
    const result = getQuizCountPresentation(
      {
        requested_mcq_count: 20,
        requested_theory_count: 10,
        actual_mcq_count: 26,
        actual_theory_count: 4,
        count_mismatch: true,
      },
      [
        { qtype: "mcq" },
        { qtype: "conceptual" },
      ],
    );

    expect(result.actualMcqCount).toBe(26);
    expect(result.actualTheoryCount).toBe(4);
    expect(result.countMismatch).toBe(true);
  });

  it("falls back to question-derived counts for legacy data", () => {
    const result = getQuizCountPresentation(
      {
        requested_mcq_count: null,
        requested_theory_count: null,
        actual_mcq_count: null,
        actual_theory_count: null,
        count_mismatch: false,
      },
      [
        { qtype: "mcq" },
        { qtype: "mcq" },
        { qtype: "conceptual" },
      ],
    );

    expect(result.actualMcqCount).toBe(2);
    expect(result.actualTheoryCount).toBe(1);
    expect(result.countMismatch).toBe(false);
  });
});
