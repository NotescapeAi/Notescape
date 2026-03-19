
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActivityProvider, useActivity } from "./ActivityContext";
import * as api from "../lib/api";
import { SessionManager } from "../components/SessionManager";
import { formatLocalISODate } from "../lib/utils";

// Mock API functions
vi.mock("../lib/api", () => {
  const cache: Record<string, any> = {
    startStudySession: vi.fn(),
    heartbeatStudySession: vi.fn(),
    endStudySession: vi.fn(),
    getStudySessionOverview: vi.fn(),
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

// Mock useUser
const mockProfile = { id: "test-user", display_name: "Test User" };
vi.mock("../hooks/useUser", () => ({
  useUser: () => ({
    profile: mockProfile, // Changed from user to profile to match new ActivityContext
    loading: false,
  }),
}));

// Mock useNetwork
vi.mock("../hooks/useNetwork", () => ({
  useNetwork: () => true,
}));

const TestComponent = () => {
    const {
        activeSecondsToday,
        currentSessionSeconds,
        totalDurationToday,
        startSession,
        dailyStreakCount,
        dailyStreakDisplayCount,
        hasStreakActivityToday,
        registerStreakActivity,
        resetDailyStreak,
    } = useActivity();
    return (
        <div>
            <div data-testid="active">{activeSecondsToday}</div>
            <div data-testid="current">{currentSessionSeconds}</div>
            <div data-testid="duration">{totalDurationToday}</div>
            <div data-testid="streak">{dailyStreakCount}</div>
            <div data-testid="streakDisplay">{dailyStreakDisplayCount}</div>
            <div data-testid="hasActivityToday">{String(hasStreakActivityToday)}</div>
            <button onClick={() => startSession("test_mode")}>Start Session</button>
            <button onClick={registerStreakActivity}>Register Activity</button>
            <button onClick={resetDailyStreak}>Reset Streak</button>
        </div>
    );
};

describe("ActivityContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    mockProfile.id = "test-user";
    
    (api.startStudySession as any).mockResolvedValue({
      id: "session-1",
      active_seconds: 100,
      duration_seconds: 100,
      started_at: new Date().toISOString(),
    });
    
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 500,
      total_duration_today: 600,
    });
    
    (api.heartbeatStudySession as any).mockResolvedValue({
      id: "session-1",
      active_seconds: 105,
      duration_seconds: 105,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT start session automatically on mount", async () => {
    render(
        <ActivityProvider>
            <TestComponent />
        </ActivityProvider>
    );

    // Flush init
    await act(async () => {
        vi.advanceTimersByTime(100);
    });

    expect(api.startStudySession).not.toHaveBeenCalled();
    expect(api.getStudySessionOverview).toHaveBeenCalled();
    
    // Stats from overview should be loaded
    expect(screen.getByTestId("active")).toHaveTextContent("500");
    // Current session stats should be 0 since no session started
    expect(screen.getByTestId("current")).toHaveTextContent("0");
  });

  it("starts session when SessionManager is rendered", async () => {
    render(
        <ActivityProvider>
            <SessionManager mode="test_mode" />
            <TestComponent />
        </ActivityProvider>
    );
    
    // Flush init
    await act(async () => {
        vi.advanceTimersByTime(100);
    });
    
    expect(api.startStudySession).toHaveBeenCalledWith({ mode: "test_mode", class_id: undefined });
  });

  it("persists state to localStorage and restores it on mount", async () => {
    // 1. Render and start session
    const { unmount } = render(
        <ActivityProvider>
            <SessionManager mode="test_mode" />
            <TestComponent />
        </ActivityProvider>
    );

    // Flush init and start session
    await act(async () => {
        vi.advanceTimersByTime(100);
    });

    // Advance time to accumulate stats
    await act(async () => {
        vi.advanceTimersByTime(5000); // 5 seconds
    });

    // Verify stats accumulated
    expect(screen.getByTestId("current")).toHaveTextContent("5");

    // Check localStorage
    const stored = localStorage.getItem("activityState");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.userId).toBe("test-user");
    expect(parsed.currentSessionSeconds).toBeGreaterThanOrEqual(5);

    // 2. Unmount and Remount (Simulate refresh)
    unmount();
    vi.clearAllMocks(); // Clear API mocks to ensure we don't rely on them for initial state

    // Reset API mock to fail to prove we loaded from localStorage first
    // If API succeeds (even with 0), it overwrites localStorage
    (api.getStudySessionOverview as any).mockRejectedValue(new Error("API Failed"));

    render(
        <ActivityProvider>
            <TestComponent />
        </ActivityProvider>
    );

    // Flush init
    await act(async () => {
        vi.advanceTimersByTime(100);
    });

    // Should have restored stats from localStorage (500 + 5 = 505)
    expect(screen.getByTestId("active")).toHaveTextContent("505");
  });

  it("resets stats at midnight", async () => {
    // Set time to 23:59:58
    const date = new Date(2023, 10, 10, 23, 59, 58);
    vi.setSystemTime(date);

    render(
        <ActivityProvider>
            <SessionManager mode="test_mode" />
            <TestComponent />
        </ActivityProvider>
    );

    // Flush init
    await act(async () => {
        vi.advanceTimersByTime(100);
    });

    // Advance 1 second -> 23:59:59
    await act(async () => {
        vi.advanceTimersByTime(1000);
    });
    
    // Stats should be accumulating
    // Initial (500) + 1 = 501
    expect(screen.getByTestId("active")).toHaveTextContent("501");

    // Advance 2 seconds -> 00:00:01 (Next Day)
    await act(async () => {
        vi.advanceTimersByTime(2000);
    });

    // Stats should have reset
    // Active seconds today should be small (just started new day)
    // Note: Session rotation happens async, so it might be 0 or 1 depending on timing
    // But definitely not 500+
    const activeText = screen.getByTestId("active").textContent;
    expect(parseInt(activeText || "0")).toBeLessThan(10);
  });

  it("does not reuse persisted time from a different user", async () => {
    const ymd = formatLocalISODate(new Date());
    localStorage.setItem(
      "activityState",
      JSON.stringify({
        userId: "old-user",
        activeSecondsToday: 999,
        totalDurationToday: 999,
        currentSessionSeconds: 999,
        currentSessionDuration: 999,
        trackingDate: ymd,
        timestamp: Date.now(),
        sessionId: null,
        sessionParams: null,
      })
    );

    mockProfile.id = "new-user";
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId("active")).toHaveTextContent("0");
    expect(screen.getByTestId("current")).toHaveTextContent("0");
  });

  it("counts streak at local midnight when activity occurred previous day", async () => {
    vi.setSystemTime(new Date(2023, 0, 1, 23, 59, 59, 900));
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("0");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("0");
    expect(screen.getByTestId("hasActivityToday")).toHaveTextContent("false");

    await act(async () => {
      screen.getByText("Register Activity").click();
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("0");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("1");
    expect(screen.getByTestId("hasActivityToday")).toHaveTextContent("true");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("1");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("1");
    expect(screen.getByTestId("hasActivityToday")).toHaveTextContent("false");

    await act(async () => {
      screen.getByText("Register Activity").click();
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("1");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("2");
  });

  it("resets streak to 0 after an inactive calendar day", async () => {
    vi.setSystemTime(new Date(2023, 0, 1, 23, 59, 59, 900));
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      screen.getByText("Register Activity").click();
    });
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("1");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("streak")).toHaveTextContent("1");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("1");

    await act(async () => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(screen.getByTestId("streak")).toHaveTextContent("0");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("0");
  });

  it("sanitizes invalid persisted streak state", async () => {
    const today = formatLocalISODate(new Date());
    localStorage.setItem(
      "dailyStreakState",
      JSON.stringify({
        userId: "test-user",
        streakCount: 5,
        lastCountedDay: "not-a-date",
        lastSeenDay: today,
        activityDay: today,
        activityOccurred: true,
      })
    );

    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("0");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("0");
  });

  it("updates streak state in real-time from storage events (concurrent sessions)", async () => {
    vi.setSystemTime(new Date(2023, 0, 1, 12, 0, 0));
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const today = formatLocalISODate(new Date());
    const nextValue = JSON.stringify({
      userId: "test-user",
      streakCount: 7,
      lastCountedDay: today,
      lastSeenDay: today,
      activityDay: today,
      activityOccurred: true,
      tz: "Etc/UTC",
      tzOffsetMinutes: 0,
      updatedAt: Date.now(),
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "dailyStreakState",
          newValue: nextValue,
        })
      );
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("7");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("8");
    expect(screen.getByTestId("hasActivityToday")).toHaveTextContent("true");
  });

  it("resets streak after large time jumps (timezone/DST or offline gaps)", async () => {
    vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));
    (api.getStudySessionOverview as any).mockResolvedValue({
      total_seconds_today: 0,
      total_duration_today: 0,
    });

    render(
      <ActivityProvider>
        <TestComponent />
      </ActivityProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      screen.getByText("Register Activity").click();
    });
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("1");

    vi.setSystemTime(new Date(2023, 0, 4, 10, 0, 0));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(screen.getByTestId("streak")).toHaveTextContent("0");
    expect(screen.getByTestId("streakDisplay")).toHaveTextContent("0");
  });
});
