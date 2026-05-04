import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import ChatInterface from "../components/chat/ChatInterface";

export default function Chatbot() {
  const [searchParams] = useSearchParams();
  const classIdParam = searchParams.get("classId");
  const parsedClassId = classIdParam ? Number(classIdParam) : NaN;
  const classId = Number.isFinite(parsedClassId) ? parsedClassId : undefined;

  return (
    <AppShell
      title="Ask from your materials"
      subtitle="Ask questions from your class materials. Select a class or document to ground the answer."
      contentGapClassName="gap-2"
      contentOverflowClassName="overflow-hidden"
      contentHeightClassName="h-full"
      mainClassName="min-h-0 overflow-hidden"
    >
      {/* 
        We pass classId if present in URL (e.g. redirected from Classes page).
        Otherwise we pass nothing, letting ChatInterface handle class selection.
      */}
      <div className="h-full min-h-0 overflow-hidden">
        <ChatInterface classId={classId} />
      </div>
    </AppShell>
  );
}
