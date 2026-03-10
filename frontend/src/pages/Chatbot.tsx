import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import ChatInterface from "../components/chat/ChatInterface";

export default function Chatbot() {
  const [searchParams] = useSearchParams();
  const classIdParam = searchParams.get("classId");
  const classId = classIdParam ? Number(classIdParam) : undefined;

  return (
    <AppShell title="Chat">
      {/* 
        We pass classId if present in URL (e.g. redirected from Classes page).
        Otherwise we pass nothing, letting ChatInterface handle class selection.
      */}
      <div className="h-[calc(100vh-64px)]">
        <ChatInterface classId={classId} />
      </div>
    </AppShell>
  );
}
