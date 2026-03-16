import type { QuizHistoryItem, QuizListItem, QuizQuestion } from "../../lib/api";

export function deriveActualCountsFromQuestions(questions: QuizQuestion[] | Array<{ qtype: string }>) {
  let actualMcqCount = 0;
  let actualTheoryCount = 0;
  for (const question of questions || []) {
    if (question.qtype === "mcq") {
      actualMcqCount += 1;
    } else {
      actualTheoryCount += 1;
    }
  }
  return { actualMcqCount, actualTheoryCount };
}

export function getQuizCountPresentation(
  meta: Pick<
    QuizListItem | QuizHistoryItem,
    "requested_mcq_count" | "requested_theory_count" | "actual_mcq_count" | "actual_theory_count" | "count_mismatch"
  >,
  fallbackQuestions: QuizQuestion[] | Array<{ qtype: string }> = [],
) {
  const derived = deriveActualCountsFromQuestions(fallbackQuestions);
  const actualMcqCount =
    typeof meta.actual_mcq_count === "number" ? meta.actual_mcq_count : derived.actualMcqCount;
  const actualTheoryCount =
    typeof meta.actual_theory_count === "number" ? meta.actual_theory_count : derived.actualTheoryCount;
  const requestedMcqCount =
    typeof meta.requested_mcq_count === "number" ? meta.requested_mcq_count : null;
  const requestedTheoryCount =
    typeof meta.requested_theory_count === "number" ? meta.requested_theory_count : null;
  const countMismatch =
    Boolean(meta.count_mismatch) ||
    (requestedMcqCount !== null &&
      requestedTheoryCount !== null &&
      (requestedMcqCount !== actualMcqCount || requestedTheoryCount !== actualTheoryCount));

  return {
    actualMcqCount,
    actualTheoryCount,
    requestedMcqCount,
    requestedTheoryCount,
    countMismatch,
  };
}
