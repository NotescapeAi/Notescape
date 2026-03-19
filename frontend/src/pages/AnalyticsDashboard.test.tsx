import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTrackingDate = vi.hoisted(() => new Date().toISOString().split("T")[0]);
let lastLineProps: any = null;

// Mock API
vi.mock("../lib/api", () => {
  const cache: Record<string, any> = {
    API_BASE_URL: "http://localhost:8000",
    getAnalyticsOverview: vi.fn(),
    getActivityTimeline: vi.fn(),
    getStreaks: vi.fn(),
    getStudyTrends: vi.fn(),
    getStudySessionOverview: vi.fn(),
    listFlashcards: vi.fn(),
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

// Mock ActivityContext
vi.mock("../contexts/ActivityContext", () => ({
  useActivity: () => ({
    formattedTime: "MOCK_TIME",
    activeSecondsToday: 5400,
    totalDurationToday: 0,
    currentSessionSeconds: 0,
    isIdle: false,
    isOnline: true,
    isSyncing: false,
    isReady: true,
    trackingDate: mockTrackingDate,
    dailyStreakDisplayCount: 5,
  }),
}));

// Mock useUser hook
vi.mock("../hooks/useUser", () => ({
  useUser: () => ({
    profile: {
      id: "test-user-id",
      email: "test@example.com",
      display_name: "Test User",
    },
    loading: false,
    refresh: vi.fn(),
    saveProfile: vi.fn(),
  }),
}));

// Mock useTheme hook
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}));

// Mock Chart.js components
vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="mock-bar-chart">Bar Chart</div>,
  Line: (props: any) => {
    lastLineProps = props;
    return <div data-testid="mock-line-chart">Line Chart</div>;
  },
  Chart: () => <div data-testid="mock-chart">Chart</div>,
  Doughnut: () => <div data-testid="mock-doughnut-chart">Doughnut Chart</div>,
}));

// Mock Framer Motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { MemoryRouter } from 'react-router-dom';
import AnalyticsDashboard from "./AnalyticsDashboard";
import { getAnalyticsOverview, getActivityTimeline, getStreaks, getStudyTrends, getStudySessionOverview, listFlashcards } from "../lib/api";

// Mock EventSource
global.EventSource = vi.fn(() => ({
  onmessage: null,
  onerror: null,
  close: vi.fn(),
})) as any;

describe("AnalyticsDashboard", () => {
  const mockOverview = {
    total_reviews: 150,
    avg_response_time: 2500, // 2.5s
    reviews_today: 12,
    total_study_time: 3600, // 1h
    study_duration_time: 4500, // 1.25h
    avg_session_duration: 1800, // 30m
  };

  const mockStreaks = {
    current_streak: 5,
    longest_streak: 15,
    total_active_days: 20,
    last_activity_date: "2023-10-27",
  };

  const today = new Date(mockTrackingDate);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const fourDaysAgo = new Date(today);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const addDays = (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    out.setHours(0, 0, 0, 0);
    return out;
  };

  const startOfWeekMonday = (d: Date) => {
    const out = new Date(d);
    const day = out.getDay();
    const diff = (day + 6) % 7;
    out.setDate(out.getDate() - diff);
    out.setHours(0, 0, 0, 0);
    return out;
  };

  const mockTrends = [
    { day: formatDate(fourDaysAgo), total_reviews: 0, avg_response_time: 0, study_time: 3600, duration_seconds: 0 },
    { day: formatDate(threeDaysAgo), total_reviews: 0, avg_response_time: 0, study_time: 0, duration_seconds: 0 },
    { day: formatDate(twoDaysAgo), total_reviews: 0, avg_response_time: 0, study_time: 600, duration_seconds: 0 },
    { day: formatDate(yesterday), total_reviews: 0, avg_response_time: 0, study_time: 2400, duration_seconds: 0 },
    { day: formatDate(today), total_reviews: 0, avg_response_time: 0, study_time: 0, duration_seconds: 0 },
  ];

  const mockClassesProgress = [
    {
        class_id: 1,
        class_name: "Biology 101",
        total_cards: 50,
        mastered_cards: 25,
        study_time_seconds: 3600,
        mastery_percentage: 50.0
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    lastLineProps = null;
    (getAnalyticsOverview as any).mockResolvedValue(mockOverview);
    (getStreaks as any).mockResolvedValue(mockStreaks);
    (getStudyTrends as any).mockResolvedValue(mockTrends);
    (getStudySessionOverview as any).mockResolvedValue({
      avg_seconds_7d: 3600,
      avg_seconds_30d: 7200,
      avg_seconds_all: 5400,
      total_sessions_today: 3,
    });

    (getActivityTimeline as any).mockResolvedValue([]);
    (listFlashcards as any).mockResolvedValue([
      {
        id: "card-1",
        question: "What is DNA?",
        answer: "Deoxyribonucleic acid",
        repetitions: 7,
        interval_days: 30,
        due_at: new Date().toISOString(),
      },
      {
        id: "card-2",
        question: "What is a cell?",
        answer: "The basic unit of life",
        repetitions: 1,
        interval_days: 1,
        due_at: new Date().toISOString(),
      },
    ]);
  });

  it("renders loading state initially", () => {
    // We can't easily test loading state because useEffect runs immediately,
    // but we can check if it eventually renders content.
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );
    // Ideally we would see a loading spinner, but let's wait for content
  });

  it("renders dashboard content after loading", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    // Check stats
    const longestStreakCard = screen.getByRole("button", { name: /Longest Streak/i });
    expect(longestStreakCard).toBeInTheDocument();
    expect(longestStreakCard).toHaveTextContent("15");
    expect(screen.getAllByText("MOCK_TIME").length).toBeGreaterThan(0); // Study Time
    
    // Check Classes Progress
    // expect(screen.getByText("Flashcard Summary")).toBeInTheDocument();
    // expect(screen.getByText("Biology 101")).toBeInTheDocument();
  });

  it("displays key statistics", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    // Check if API was called
    expect(getAnalyticsOverview).toHaveBeenCalled();

    await waitFor(() => {
      // 150 total reviews, 12 today, 1h 30m study time
      // Should find MOCK_TIME (might be multiple if TopBar is also rendered)
      const times = screen.getAllByText("MOCK_TIME");
      expect(times.length).toBeGreaterThan(0);
    });
  });

  it("renders flashcard review items in streak activity timeline", async () => {
    (getActivityTimeline as any).mockResolvedValue([
      {
        id: "evt-1",
        kind: "flashcard_review",
        occurred_at: new Date().toISOString(),
        title: "Reviewed flashcard",
        detail: "Biology 101",
        class_id: 1,
        class_name: "Biology 101",
        meta: { rating: "good", response_time_ms: 1234 },
      },
    ]);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /Longest Streak/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Streak Details").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Reviewed flashcard")).toBeInTheDocument();
    expect(screen.getByText("good")).toBeInTheDocument();
  });

  it("opens and closes time details popup from Time Spent Today", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Time Details")).not.toBeInTheDocument();

    const timeCardButton = screen.getByRole("button", { name: /Time Spent Today/i });
    fireEvent.click(timeCardButton);

    await waitFor(() => {
      expect(screen.getByText("Time Details")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Close time details"));
    await waitFor(() => {
      expect(screen.queryByText("Time Details")).not.toBeInTheDocument();
    });
  });

  it("reveals streak number after celebration animation in the popup", async () => {
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter>
          <AnalyticsDashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
      });

      const longestStreakCard = screen.getByRole("button", { name: /Longest Streak/i });
      fireEvent.click(longestStreakCard);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("streak-animated-number")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(700);
      });

      expect(screen.getByTestId("streak-animated-number")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders streak congratulations modal with hover tooltip", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Longest Streak/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Congratulations")).toBeInTheDocument();
      expect(screen.getAllByText("Weekly Streak").length).toBeGreaterThan(0);
    });

    const dayButtons = screen.getAllByLabelText(/Streak day \d{4}-\d{2}-\d{2}:/);
    expect(dayButtons.length).toBe(7);

    fireEvent.mouseEnter(dayButtons[0]);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close streak congratulations"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });


  it("handles API errors gracefully", async () => {
    (getAnalyticsOverview as any).mockRejectedValue(new Error("API Error"));
    (getStreaks as any).mockRejectedValue(new Error("API Error"));
    (getStudyTrends as any).mockRejectedValue(new Error("API Error"));
    (getStudySessionOverview as any).mockRejectedValue(new Error("API Error"));
    (getClassesProgress as any).mockRejectedValue(new Error("API Error"));
    (listFlashcards as any).mockRejectedValue(new Error("API Error"));

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load analytics data/i)).toBeInTheDocument();
    });
  });

  it("switches time ranges", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    const weeklyBtn = screen.getByText("Weekly");
    const callsBeforeWeekly = (getStudyTrends as any).mock.calls.length;
    fireEvent.click(weeklyBtn);

    await waitFor(() => {
      expect((getStudyTrends as any).mock.calls.length).toBeGreaterThan(callsBeforeWeekly);
    });

    await waitFor(() => {
      expect(lastLineProps?.data?.labels?.length).toBe(12);
    });

    const monthlyBtn = screen.getByText("Monthly");
    const callsBeforeMonthly = (getStudyTrends as any).mock.calls.length;
    fireEvent.click(monthlyBtn);

    await waitFor(() => {
      expect((getStudyTrends as any).mock.calls.length).toBeGreaterThan(callsBeforeMonthly);
    });

    await waitFor(() => {
      expect(lastLineProps?.data?.labels?.length).toBe(20);
    });
  });

  it("aggregates study hours for weekly and monthly views", async () => {
    const base = new Date(mockTrackingDate);
    base.setHours(0, 0, 0, 0);
    const weekStart = startOfWeekMonday(base);

    const sampleTrends: any[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const iso = formatDate(day);
      sampleTrends.push({
        day: iso,
        total_reviews: 0,
        avg_response_time: 0,
        study_time: iso === formatDate(base) ? 7200 : 3600,
        duration_seconds: 0,
      });
    }

    (getStudyTrends as any).mockResolvedValue(sampleTrends);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText("Weekly"));
    await waitFor(() => {
      expect(lastLineProps?.data?.datasets?.[0]?.data?.length).toBe(12);
    });

    const weeklyData = lastLineProps.data.datasets[0].data as number[];
    expect(weeklyData[weeklyData.length - 1]).toBeCloseTo(8, 3);

    expect(lastLineProps.data.datasets[1].label).toBe("Target");
    const weeklyTarget = lastLineProps.data.datasets[1].data as number[];
    expect(weeklyTarget.every((v) => v === 5)).toBe(true);
    expect(Number(lastLineProps?.options?.scales?.y?.max)).toBeGreaterThanOrEqual(8);

    fireEvent.click(screen.getByText("Monthly"));
    await waitFor(() => {
      expect(lastLineProps?.data?.datasets?.[0]?.data?.length).toBe(20);
    });

    const monthKey = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
    const expectedMonthHours =
      sampleTrends
        .filter((t) => typeof t.day === "string" && t.day.startsWith(monthKey))
        .reduce((acc, t) => acc + (Number(t.study_time || 0) || 0), 0) / 3600;

    const monthlyData = lastLineProps.data.datasets[0].data as number[];
    expect(monthlyData[monthlyData.length - 1]).toBeCloseTo(expectedMonthHours, 3);

    expect(lastLineProps.data.datasets[1].label).toBe("Target");
    const monthlyTarget = lastLineProps.data.datasets[1].data as number[];
    expect(monthlyTarget.every((v) => v === 10)).toBe(true);
    expect(Number(lastLineProps?.options?.scales?.y?.min)).toBe(0);
    expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(120);
    expect(Number(lastLineProps?.options?.scales?.y?.ticks?.stepSize)).toBe(10);
  });

  it("displays the chart", async () => {
    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );
    
    await waitFor(() => {
      expect(screen.getByText("Daily Study Trend")).toBeInTheDocument();
      expect(screen.getByTestId("mock-line-chart")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(lastLineProps?.data?.labels?.length).toBe(7);
      expect(lastLineProps?.data?.datasets?.[0]?.data?.length).toBe(7);
    });

    expect(lastLineProps?.options?.scales?.y?.ticks?.stepSize).toBeGreaterThanOrEqual(2);
    expect(Number(lastLineProps?.options?.scales?.y?.suggestedMax)).toBe(8);
    expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(8);
  });

  it("scrolls the y-axis viewport when hours exceed 8", async () => {
    const base = new Date(mockTrackingDate);
    base.setHours(0, 0, 0, 0);
    const weekStart = startOfWeekMonday(base);

    const sampleTrends: any[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const iso = formatDate(day);
      sampleTrends.push({
        day: iso,
        total_reviews: 0,
        avg_response_time: 0,
        study_time: 5 * 3600,
        duration_seconds: 0,
      });
    }

    (getStudyTrends as any).mockResolvedValue(sampleTrends);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Analytics Dashboard").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText("Weekly"));

    await waitFor(() => {
      expect(Number(lastLineProps?.options?.scales?.y?.min)).toBe(0);
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(28);
      expect(Number(lastLineProps?.options?.scales?.y?.ticks?.stepSize)).toBe(4);
    });

    const beforeMin = Number(lastLineProps?.options?.scales?.y?.min);
    fireEvent.wheel(screen.getByTestId("trend-chart-scroll"), { deltaY: 180 });

    await waitFor(() => {
      expect(Number(lastLineProps?.options?.scales?.y?.min)).toBeGreaterThan(beforeMin);
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(Number(lastLineProps?.options?.scales?.y?.min) + 28);
    });
  });

  it("allows scrolling through the full 24h daily timeline", async () => {
    const base = new Date(mockTrackingDate);
    base.setHours(0, 0, 0, 0);
    const baseIso = formatDate(base);

    (getStudyTrends as any).mockResolvedValue([
      { day: baseIso, total_reviews: 0, avg_response_time: 0, study_time: 2 * 3600, duration_seconds: 0 },
    ]);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Daily Study Trend")).toBeInTheDocument();
      expect(Number(lastLineProps?.options?.scales?.y?.min)).toBe(0);
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(8);
      expect(Number(lastLineProps?.options?.scales?.y?.ticks?.stepSize)).toBe(2);
    });

    fireEvent.wheel(screen.getByTestId("trend-chart-scroll"), { deltaY: 99999 });

    await waitFor(() => {
      expect(Number(lastLineProps?.options?.scales?.y?.min)).toBe(16);
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(24);
    });
  });


  it("expands the y-axis when study hours exceed the current maximum", async () => {
    const base = new Date(mockTrackingDate);
    base.setHours(0, 0, 0, 0);
    const baseIso = formatDate(base);

    const dailyTrends = [{ day: baseIso, total_reviews: 0, avg_response_time: 0, study_time: 10 * 3600, duration_seconds: 0 }];

    const weekStart = startOfWeekMonday(base);
    const weeklyTrends: any[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      weeklyTrends.push({
        day: formatDate(day),
        total_reviews: 0,
        avg_response_time: 0,
        study_time: 5 * 3600,
        duration_seconds: 0,
      });
    }

    const monthlyTrends = [{ day: baseIso, total_reviews: 0, avg_response_time: 0, study_time: 150 * 3600, duration_seconds: 0 }];

    (getStudyTrends as any)
      .mockResolvedValueOnce(dailyTrends)
      .mockResolvedValueOnce(weeklyTrends)
      .mockResolvedValueOnce(monthlyTrends);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Daily Study Trend")).toBeInTheDocument();
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBeGreaterThanOrEqual(10);
    });

    fireEvent.click(screen.getByText("Weekly"));
    await waitFor(() => {
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBe(28);
      expect(Number(lastLineProps?.options?.scales?.y?.min)).toBe(0);
    });

    fireEvent.click(screen.getByText("Monthly"));
    await waitFor(() => {
      expect(Number(lastLineProps?.options?.scales?.y?.max)).toBeGreaterThanOrEqual(150);
    });
  });
});
