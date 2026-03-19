import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Classes from "./Classes";
import { LayoutContext } from "../layouts/LayoutContext";
import * as api from "../lib/api";

// Mock API modules
vi.mock("../lib/api", () => {
  const cache: Record<string, any> = {
    listClasses: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    listFlashcards: vi.fn().mockResolvedValue([]),
    getWeakCards: vi.fn().mockResolvedValue([]),
    createClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    createChunks: vi.fn(),
    buildEmbeddings: vi.fn(),
    generateFlashcardsAsync: vi.fn(),
    getFlashcardJobStatus: vi.fn(),
    ocrImageSnippet: vi.fn(),
    getDocumentViewUrl: vi.fn(),
    listChatSessions: vi.fn().mockResolvedValue([]),
    createChatSession: vi.fn(),
    listChatSessionMessages: vi.fn().mockResolvedValue([]),
    addChatMessages: vi.fn(),
    chatAsk: vi.fn(),
    updateChatSession: vi.fn(),
    deleteChatSession: vi.fn(),
    clearChatSessionMessages: vi.fn(),
  };
  return new Proxy(cache, {
    get(target, prop) {
      if (prop === "__esModule") return true;
      if (typeof prop !== "string") return (target as any)[prop];
      if (!(prop in target)) target[prop] = vi.fn();
      return target[prop];
    },
  });
});

// Mock complex child components if needed
vi.mock("../components/PdfStudyViewer", () => ({
  default: () => <div data-testid="pdf-viewer">PdfViewer</div>,
}));

// Mock AppShell
vi.mock("../layouts/AppShell", () => ({
  default: ({ children }: any) => <div data-testid="app-shell">{children}</div>,
}));

describe("Classes Page", () => {
  const layoutValue = {
    sidebar: true,
    setSidebar: vi.fn(),
    classesPanelCollapsed: false,
    toggleClassesPanel: vi.fn(),
    isWorkspaceWide: false,
  };

  const mockClasses = [
    { id: 1, name: "Biology 101", created_at: "2023-01-01" },
    { id: 2, name: "History 202", created_at: "2023-01-02" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderClasses = () => {
    return render(
      <BrowserRouter>
        <LayoutContext.Provider value={layoutValue}>
          <Classes />
        </LayoutContext.Provider>
      </BrowserRouter>
    );
  };

  it("renders empty state when no classes", async () => {
    (api.listClasses as any).mockResolvedValue([]);
    renderClasses();

    await waitFor(() => {
      expect(screen.queryByText(/Loading classes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Create your first class/i)).toBeInTheDocument();
  });

  it("renders list of classes", async () => {
    (api.listClasses as any).mockResolvedValue(mockClasses);
    renderClasses();

    await waitFor(() => {
      expect(screen.queryByText(/Loading classes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByText("History 202")).toBeInTheDocument();
  });

  it("renders file list with dates", async () => {
    (api.listClasses as any).mockResolvedValue(mockClasses);
    const mockFiles = [
      { 
        id: "f1", 
        filename: "notes.pdf", 
        uploaded_at: "2023-10-24T12:00:00Z",
        status: "INDEXED"
      }
    ];
    (api.listFiles as any).mockResolvedValue(mockFiles);
    
    renderClasses();

    // Wait for classes to load
    await waitFor(() => {
      expect(screen.getAllByText("Biology 101").length).toBeGreaterThan(0);
    });

    // Select the first class to trigger file loading
    const classButtons = screen.getAllByText("Biology 101");
    fireEvent.click(classButtons[0]);

    // Wait for file to appear
    await waitFor(() => {
      expect(screen.getByText("notes.pdf")).toBeInTheDocument();
    });

    // Check if date is rendered (DateDisplay uses default locale, so it should contain "2023" or "Oct")
    // Since we can't easily predict the exact string without knowing the locale/timezone of the test runner,
    // we can look for parts of the date or use a regex.
    // DateDisplay formats as "Oct 24, 2023" by default in en-US.
    // Let's check for "2023" which is safe.
    expect(screen.getByText(/2023/)).toBeInTheDocument();
  });

  it("renders upload empty state with icon strip", async () => {
    (api.listClasses as any).mockResolvedValue(mockClasses);
    (api.listFiles as any).mockResolvedValue([]);

    renderClasses();

    await waitFor(() => {
      expect(screen.getAllByText("Biology 101").length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const classButtons = screen.getAllByText("Biology 101");
    fireEvent.click(classButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Upload your materials")).toBeInTheDocument();
    });

    expect(screen.getByTestId("upload-materials-icons")).toBeInTheDocument();
  });
});
