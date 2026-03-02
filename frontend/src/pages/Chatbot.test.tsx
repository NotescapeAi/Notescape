import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Chatbot from "./Chatbot";

// Mock API
vi.mock("../lib/api", () => ({
  listClasses: vi.fn(),
  listFiles: vi.fn(),
  listChatSessions: vi.fn().mockResolvedValue([]),
  listChatSessionMessages: vi.fn().mockResolvedValue([]),
  createChatSession: vi.fn().mockResolvedValue({ id: "test-session-id", title: "Test Session" }),
}));

// Mock useChatSession hook
const mockUseChatSession = vi.fn();
vi.mock("../hooks/useChatSession", () => ({
  useChatSession: (props: any) => mockUseChatSession(props),
}));

// Mock AppShell to avoid complex layout rendering
vi.mock("../layouts/AppShell", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="app-shell">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import { listClasses, listFiles, listChatSessions, createChatSession } from "../lib/api";

describe("Chatbot Page", () => {
  const mockClasses = [
    { id: 1, name: "Biology 101", created_at: "2023-01-01" },
    { id: 2, name: "Chemistry 202", created_at: "2023-01-02" },
  ];

  const defaultHookReturn = {
    sessions: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    messages: [],
    busySessions: false,
    busyAsk: false,
    historyError: null,
    errorBanner: null,
    startNewSession: vi.fn(),
    onAsk: vi.fn(),
    handleRenameSession: vi.fn(),
    handleDeleteSession: vi.fn(),
    handleClearMessages: vi.fn(),
    convoRef: { current: null },
    isAtBottom: true,
    setIsAtBottom: vi.fn(),
    scopeFileIds: [],
    toggleFileScope: vi.fn(),
    sourcesEnabled: false,
    toggleSources: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (listClasses as any).mockResolvedValue(mockClasses);
    (listFiles as any).mockResolvedValue([]);
    (listChatSessions as any).mockResolvedValue([]);
    mockUseChatSession.mockReturnValue(defaultHookReturn);
  });

  it("renders the chat page with title", async () => {
    render(
      <BrowserRouter>
        <Chatbot />
      </BrowserRouter>
    );
    
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
    // It should show loading initially or if classes are empty, but we mocked listClasses
    // The component has a loading state for classes.
    // listClasses is async, so we might see loading first.
    await waitFor(() => {
      expect(screen.getByText("Select class")).toBeInTheDocument();
    });
  });

  it("populates class dropdown", async () => {
    render(
      <BrowserRouter>
        <Chatbot />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
      expect(screen.getByText("Chemistry 202")).toBeInTheDocument();
    });
  });

  it("shows sessions list when sessions exist", async () => {
    const mockSessions = [
      { id: "s1", title: "Session 1", created_at: "2023-01-01", updated_at: "2023-01-01" },
      { id: "s2", title: "Session 2", created_at: "2023-01-02", updated_at: "2023-01-02" },
    ];
    (listChatSessions as any).mockResolvedValue(mockSessions);

    render(
      <BrowserRouter>
        <Chatbot />
      </BrowserRouter>
    );

    // Select a class first to trigger session loading
    await waitFor(() => screen.getByText("Biology 101"));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });

    await waitFor(() => {
      expect(screen.getByText("Session 1")).toBeInTheDocument();
      expect(screen.getByText("Session 2")).toBeInTheDocument();
    });
  });

  it("handles new chat button click", async () => {
    (createChatSession as any).mockResolvedValue({ 
      id: "new-session", 
      title: "New Chat Session", 
      created_at: new Date().toISOString() 
    });

    render(
      <BrowserRouter>
        <Chatbot />
      </BrowserRouter>
    );

    await waitFor(() => screen.getByText("Biology 101"));
    
    // Select a class to enable the button (button disabled if !classId)
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });
    
    const newChatBtn = screen.getByText("New chat");
    expect(newChatBtn).not.toBeDisabled();
    
    fireEvent.click(newChatBtn);
    
    await waitFor(() => {
      expect(createChatSession).toHaveBeenCalled();
    });
  });
});
