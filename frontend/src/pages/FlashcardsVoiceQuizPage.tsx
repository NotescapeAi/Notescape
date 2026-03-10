import { useLocation, useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import VoiceQuizMode from "../components/VoiceQuizMode";
import type { Flashcard } from "../lib/api";

type LocationState = {
  cards?: Flashcard[];
  className?: string;
  startIndex?: number;
};

export default function FlashcardsVoiceQuizPage() {
  const { classId } = useParams();
  const classNum = Number(classId);
  const state = (useLocation().state || {}) as LocationState;

  return (
    <AppShell
      title="Voice Quiz Mode"
      breadcrumbs={["Flashcards", "Voice Quiz"]}
      subtitle="Hear, answer, rate, repeat."
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <VoiceQuizMode
          classId={classNum}
          initialCards={Array.isArray(state.cards) ? state.cards : undefined}
          initialClassName={state.className}
          startIndex={state.startIndex}
        />
      </div>
    </AppShell>
  );
}
