import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "../hooks/useUser";
import { useNetwork } from "../hooks/useNetwork";
import {
  startStudySession,
  heartbeatStudySession,
  endStudySession,
  getStudySessionOverview,
} from "../lib/api";
import { formatDuration, formatLocalISODate, parseLocal } from "../lib/utils";

type ActivityContextType = {
  activeSecondsToday: number;
  totalDurationToday: number;
  currentSessionSeconds: number;
  currentSessionDuration: number;
  isIdle: boolean;
  formattedTime: string;
  formattedDuration: string;
  pause: () => void;
  resume: () => void;
  startSession: (mode: string, classId?: number) => Promise<string | null>;
  switchSession: (mode: string, classId?: number) => Promise<void>;
  endSession: (targetSessionId?: string) => Promise<void>;
  lastActiveTime: number;
  isReady: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  trackingDate: string;
  dailyStreakCount: number;
  dailyStreakDisplayCount: number;
  dailyStreakLastCountedDay: string | null;
  hasStreakActivityToday: boolean;
  registerStreakActivity: () => void;
  resetDailyStreak: () => void;
};

const ActivityContext = createContext<ActivityContextType>({
  activeSecondsToday: 0,
  totalDurationToday: 0,
  currentSessionSeconds: 0,
  currentSessionDuration: 0,
  isIdle: true,
  formattedTime: "00h 00m 00s",
  formattedDuration: "00h 00m 00s",
  pause: () => {},
  resume: () => {},
  switchSession: async () => {},
  endSession: async () => {},
  lastActiveTime: Date.now(),
  isReady: false,
  isOnline: true,
  isSyncing: false,
  trackingDate: formatLocalISODate(new Date()),
  dailyStreakCount: 0,
  dailyStreakDisplayCount: 0,
  dailyStreakLastCountedDay: null,
  hasStreakActivityToday: false,
  registerStreakActivity: () => {},
  resetDailyStreak: () => {},
});

export function useActivity() {
  return useContext(ActivityContext);
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { profile: user } = useUser();
  const isOnline = useNetwork();
  const [activeSecondsToday, setActiveSecondsToday] = useState(0);
  const [totalDurationToday, setTotalDurationToday] = useState(0);
  const [currentSessionSeconds, setCurrentSessionSeconds] = useState(0);
  const [currentSessionDuration, setCurrentSessionDuration] = useState(0);
  const [dailyStreakCount, setDailyStreakCount] = useState(0);
  const [dailyStreakLastCountedDay, setDailyStreakLastCountedDay] = useState<string | null>(null);
  const [hasStreakActivityToday, setHasStreakActivityToday] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [trackingDate, setTrackingDate] = useState(formatLocalISODate(new Date()));
  const currentSessionSecondsRef = useRef(0);
  const currentSessionDurationRef = useRef(0);
  const activeSecondsTodayRef = useRef(0);
  const totalDurationTodayRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionParamsRef = useRef<{mode: string, classId?: number} | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const lastActivityRef = useRef(Date.now());
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track the current day to detect midnight transitions
  const lastDayRef = useRef(formatLocalISODate(new Date()));
  const streakMidnightTimeoutRef = useRef<number | null>(null);

  const normalizeDateKey = useCallback((value: string) => {
    if (!value) return formatLocalISODate(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return formatLocalISODate(new Date());
    return formatLocalISODate(parsed);
  }, []);

  const userKey = user?.id ? String(user.id) : "";

  const DAILY_STREAK_STATE_KEY = "dailyStreakState";

  const isValidYmd = useCallback((value: unknown): value is string => {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }, []);

  const dayNumberFromYmd = useCallback((ymd: string): number | null => {
    if (!isValidYmd(ymd)) return null;
    const parts = ymd.split("-").map((x) => Number(x));
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }, [isValidYmd]);

  const diffDays = useCallback((fromYmd: string, toYmd: string): number | null => {
    const a = dayNumberFromYmd(fromYmd);
    const b = dayNumberFromYmd(toYmd);
    if (a == null || b == null) return null;
    return b - a;
  }, [dayNumberFromYmd]);

  const getClientTimezone = useCallback(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  }, []);

  type DailyStreakPersistedState = {
    userId: string;
    streakCount: number;
    lastCountedDay: string | null;
    lastSeenDay: string;
    activityDay: string;
    activityOccurred: boolean;
    tz: string;
    tzOffsetMinutes: number;
    updatedAt: number;
  };

  const streakStateRef = useRef<DailyStreakPersistedState | null>(null);

  const getDefaultStreakState = useCallback(
    (today: string): DailyStreakPersistedState => ({
      userId: userKey,
      streakCount: 0,
      lastCountedDay: null,
      lastSeenDay: today,
      activityDay: today,
      activityOccurred: false,
      tz: getClientTimezone(),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      updatedAt: Date.now(),
    }),
    [getClientTimezone, userKey]
  );

  const sanitizePersistedStreakState = useCallback(
    (raw: any, today: string): DailyStreakPersistedState => {
      const base = getDefaultStreakState(today);
      const storedUserId = raw?.userId ? String(raw.userId) : "";
      if (!storedUserId || storedUserId !== userKey) return base;

      const streakCountRaw = Number(raw?.streakCount ?? 0);
      const streakCount = Number.isFinite(streakCountRaw) && streakCountRaw > 0 ? Math.floor(streakCountRaw) : 0;

      const lastCountedDay = isValidYmd(raw?.lastCountedDay) ? String(raw.lastCountedDay) : null;
      const lastSeenDay = isValidYmd(raw?.lastSeenDay) ? String(raw.lastSeenDay) : today;
      const activityDay = isValidYmd(raw?.activityDay) ? String(raw.activityDay) : today;
      const activityOccurred = Boolean(raw?.activityOccurred);

      const tz = typeof raw?.tz === "string" ? raw.tz : base.tz;
      const tzOffsetMinutesRaw = Number(raw?.tzOffsetMinutes ?? base.tzOffsetMinutes);
      const tzOffsetMinutes = Number.isFinite(tzOffsetMinutesRaw) ? Math.floor(tzOffsetMinutesRaw) : base.tzOffsetMinutes;

      const updatedAtRaw = Number(raw?.updatedAt ?? Date.now());
      const updatedAt = Number.isFinite(updatedAtRaw) ? Math.floor(updatedAtRaw) : Date.now();

      return {
        userId: userKey,
        streakCount,
        lastCountedDay,
        lastSeenDay,
        activityDay,
        activityOccurred,
        tz,
        tzOffsetMinutes,
        updatedAt,
      };
    },
    [getDefaultStreakState, isValidYmd, userKey]
  );

  const writePersistedStreakState = useCallback((next: DailyStreakPersistedState) => {
    if (!userKey) return;
    try {
      localStorage.setItem(DAILY_STREAK_STATE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  }, [userKey]);

  const applyStreakState = useCallback((next: DailyStreakPersistedState) => {
    streakStateRef.current = next;
    setDailyStreakCount(next.streakCount);
    setDailyStreakLastCountedDay(next.lastCountedDay);
    const today = formatLocalISODate(new Date());
    setHasStreakActivityToday(next.activityDay === today && next.activityOccurred);
  }, []);

  const readPersistedStreakState = useCallback(
    (today: string): DailyStreakPersistedState => {
      const stored = (() => {
        try {
          return localStorage.getItem(DAILY_STREAK_STATE_KEY);
        } catch {
          return null;
        }
      })();
      if (!stored) return getDefaultStreakState(today);
      try {
        const parsed = JSON.parse(stored);
        return sanitizePersistedStreakState(parsed, today);
      } catch {
        return getDefaultStreakState(today);
      }
    },
    [getDefaultStreakState, sanitizePersistedStreakState]
  );

  const rolloverToDay = useCallback(
    (targetDay: string) => {
      if (!userKey) return;
      if (!isValidYmd(targetDay)) return;

      const now = Date.now();
      const current = readPersistedStreakState(targetDay);

      if (current.lastSeenDay === targetDay) {
        applyStreakState(current);
        return;
      }

      const delta = diffDays(current.lastSeenDay, targetDay);
      if (delta == null) return;

      if (delta <= 0) {
        const next: DailyStreakPersistedState = {
          ...current,
          lastSeenDay: targetDay,
          activityDay: targetDay,
          activityOccurred: current.activityDay === targetDay ? current.activityOccurred : false,
          tz: getClientTimezone(),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          updatedAt: now,
        };
        writePersistedStreakState(next);
        applyStreakState(next);
        return;
      }

      if (delta > 1) {
        const next: DailyStreakPersistedState = {
          ...current,
          streakCount: 0,
          lastCountedDay: null,
          lastSeenDay: targetDay,
          activityDay: targetDay,
          activityOccurred: false,
          tz: getClientTimezone(),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          updatedAt: now,
        };
        writePersistedStreakState(next);
        applyStreakState(next);
        return;
      }

      const prevDay = current.lastSeenDay;
      const prevDayHadActivity = current.activityDay === prevDay && current.activityOccurred;

      let nextCount = 0;
      let nextLastCountedDay: string | null = null;
      if (prevDayHadActivity) {
        if (!current.lastCountedDay) {
          nextCount = 1;
          nextLastCountedDay = prevDay;
        } else {
          const chainDelta = diffDays(current.lastCountedDay, prevDay);
          if (chainDelta === 1) {
            nextCount = current.streakCount + 1;
            nextLastCountedDay = prevDay;
          } else {
            nextCount = 1;
            nextLastCountedDay = prevDay;
          }
        }
      }

      const next: DailyStreakPersistedState = {
        ...current,
        streakCount: nextCount,
        lastCountedDay: nextLastCountedDay,
        lastSeenDay: targetDay,
        activityDay: targetDay,
        activityOccurred: false,
        tz: getClientTimezone(),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        updatedAt: now,
      };
      writePersistedStreakState(next);
      applyStreakState(next);
    },
    [applyStreakState, diffDays, getClientTimezone, isValidYmd, readPersistedStreakState, userKey, writePersistedStreakState]
  );

  const registerStreakActivity = useCallback(() => {
    if (!userKey) return;
    const today = formatLocalISODate(new Date());
    if (!isValidYmd(today)) return;

    rolloverToDay(today);

    const current = readPersistedStreakState(today);
    const next: DailyStreakPersistedState = {
      ...current,
      activityDay: today,
      activityOccurred: true,
      tz: getClientTimezone(),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      updatedAt: Date.now(),
    };
    writePersistedStreakState(next);
    applyStreakState(next);
  }, [applyStreakState, getClientTimezone, isValidYmd, readPersistedStreakState, rolloverToDay, userKey, writePersistedStreakState]);

  const resetDailyStreak = useCallback(() => {
    if (!userKey) return;
    const today = formatLocalISODate(new Date());
    if (!isValidYmd(today)) return;
    const next = getDefaultStreakState(today);
    writePersistedStreakState(next);
    applyStreakState(next);
  }, [applyStreakState, getDefaultStreakState, isValidYmd, userKey, writePersistedStreakState]);
  
  const getInitialQueue = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('offlineQueue');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error("Failed to parse offline queue", e);
      return null;
    }
  };

  // Initialize offline queue from storage
  const offlineQueueRef = useRef<{ userId?: string; type: 'start' | 'end', payload: any } | null>(getInitialQueue());

  const updateOfflineQueue = useCallback((queue: { type: 'start' | 'end', payload: any } | null) => {
    const withUser = queue && userKey ? { ...queue, userId: userKey } : queue;
    offlineQueueRef.current = withUser;
    if (queue) {
      localStorage.setItem('offlineQueue', JSON.stringify(withUser));
    } else {
      localStorage.removeItem('offlineQueue');
    }
  }, [userKey]);

  const persistState = useCallback(() => {
    try {
      const state = {
          userId: userKey,
          activeSecondsToday: activeSecondsTodayRef.current,
          totalDurationToday: totalDurationTodayRef.current,
          currentSessionSeconds: currentSessionSecondsRef.current,
          currentSessionDuration: currentSessionDurationRef.current,
          trackingDate: trackingDate,
          timestamp: Date.now(),
          sessionId: sessionIdRef.current,
          sessionParams: sessionParamsRef.current,
          sessionStartTime: sessionStartTimeRef.current,
          isPaused: isPaused
      };
      localStorage.setItem('activityState', JSON.stringify(state));
      // Backup state to recover from accidental clears (e.g. reload triggering endSession)
      if (sessionIdRef.current) {
        localStorage.setItem('activityState_backup', JSON.stringify(state));
      }
    } catch (e) {
      console.warn("Failed to persist activity state", e);
    }
  }, [isPaused, trackingDate, userKey]);

  // Sync offline session when connectivity is restored
  const syncOfflineSession = useCallback(async () => {
    if (!isOnline) return;

    if (offlineQueueRef.current?.userId && offlineQueueRef.current.userId !== userKey) {
      updateOfflineQueue(null);
      return;
    }
    
    // Check if we have a pending session or a queued start
    if (sessionId === "offline_pending" || (offlineQueueRef.current && offlineQueueRef.current.type === 'start')) {
       setIsSyncing(true);
       try {
          const payload = offlineQueueRef.current?.payload || { mode: "app_usage" };
          console.log("Syncing offline session with payload:", payload);
          sessionParamsRef.current = { mode: payload.mode, classId: payload.class_id };

          const session = await startStudySession(payload);
          console.log("Recovered/Synced offline session:", session.id);
          
          setSessionId(session.id);
          updateOfflineQueue(null);
          
          // Send an immediate heartbeat with accumulated time
          await heartbeatStudySession({
            session_id: session.id,
            accumulated_seconds: currentSessionSecondsRef.current,
            duration_seconds: currentSessionDurationRef.current,
          });
          
       } catch (err) {
          console.error("Failed to sync offline session", err);
          // Keep it pending if it failed (e.g. server error even if online)
       } finally {
          setIsSyncing(false);
       }
    }
  }, [isOnline, sessionId, updateOfflineQueue, userKey]);

  // Trigger sync when coming online
  useEffect(() => {
    if (isOnline) {
        syncOfflineSession();
    }
  }, [isOnline, syncOfflineSession]);

  // Helper to format time
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const pause = useCallback(() => {
    setIsPaused(true);
    // Force a heartbeat before pausing to save progress
    if (sessionIdRef.current) {
      heartbeatStudySession({
        session_id: sessionIdRef.current,
        accumulated_seconds: currentSessionSecondsRef.current,
        duration_seconds: currentSessionDurationRef.current,
      }).catch(console.error);
    }
  }, [isIdle]);

  const resume = useCallback(() => {
    setIsPaused(false);
    lastActivityRef.current = Date.now();
  }, []);

  const startSession = useCallback(async (mode: string, classId?: number): Promise<string | null> => {
    const currentParams = sessionParamsRef.current;
    const sameMode = currentParams?.mode === mode;
    // Handle undefined vs null for classId comparison
    const currentClassId = currentParams?.classId ?? null;
    const targetClassId = classId ?? null;
    const sameClass = currentClassId === targetClassId;

    if (
      sessionIdRef.current &&
      currentParams &&
      sameMode &&
      sameClass
    ) {
      console.log("Resuming existing session:", sessionIdRef.current);
      return sessionIdRef.current;
    }
    
    sessionParamsRef.current = { mode, classId };
    // 1. Flush/End current session if exists
    if (sessionIdRef.current) {
      if (!isOnline && sessionIdRef.current === "offline_pending") {
         // Already offline and pending, just clear it locally
         setSessionId(null);
      } else if (isOnline) {
        try {
          await endStudySession({
            session_id: sessionIdRef.current,
            accumulated_seconds: currentSessionSecondsRef.current,
            duration_seconds: currentSessionDurationRef.current,
          });
        } catch (err) {
          console.error("Failed to end previous session during switch", err);
        }
      }
    }

    // 2. Start new session
    let newSessionId: string | null = null;
    if (!isOnline) {
      // Queue offline start
      console.log("Starting offline session:", mode);
      setSessionId("offline_pending");
      newSessionId = "offline_pending";
      updateOfflineQueue({ type: 'start', payload: { mode, class_id: classId } });
    } else {
      try {
        const session = await startStudySession({ mode, class_id: classId });
        setSessionId(session.id);
        newSessionId = session.id;
      } catch (err) {
        console.error("Failed to start session", err);
      }
    }

    // Reset counters
    setCurrentSessionSeconds(0);
    currentSessionSecondsRef.current = 0;
    setCurrentSessionDuration(0);
    currentSessionDurationRef.current = 0;
    setIsIdle(false);
    lastActivityRef.current = Date.now();
    sessionStartTimeRef.current = Date.now();
    
    return newSessionId;
  }, [isOnline]);

  const switchSession = useCallback(async (mode: string, classId?: number) => {
    await startSession(mode, classId);
  }, [startSession]);

  const endSession = useCallback(async (targetSessionId?: string) => {
    // If a specific session ID is targeted, only end if it matches current
    if (targetSessionId && sessionIdRef.current !== targetSessionId) {
      console.log(`Skipping endSession: Target ${targetSessionId} != Current ${sessionIdRef.current}`);
      return;
    }

    if (!sessionIdRef.current) return;

    if (!isOnline && sessionIdRef.current === "offline_pending") {
       setSessionId(null);
       updateOfflineQueue(null); // Cancel pending start
    } else if (isOnline) {
      try {
        await endStudySession({
            session_id: sessionIdRef.current,
            accumulated_seconds: currentSessionSecondsRef.current,
            duration_seconds: currentSessionDurationRef.current,
        });
      } catch (err) {
        console.error("Failed to end session", err);
      }
    }
    
    // Cleanup local persistence
    try {
      // Instead of removing the state entirely, we persist the current daily stats
      // but clear the session-specific fields. This prevents daily stats from being
      // lost if the session ends (e.g. on reload if endOnUnmount is true).
      const currentState = {
        userId: userKey,
        activeSecondsToday: activeSecondsTodayRef.current,
        totalDurationToday: totalDurationTodayRef.current,
        currentSessionSeconds: 0,
        currentSessionDuration: 0,
        trackingDate: trackingDate,
        timestamp: Date.now(),
        sessionId: null,
        sessionParams: null,
        sessionStartTime: null,
        isPaused: false
      };
      localStorage.setItem('activityState', JSON.stringify(currentState));
    } catch (e) {
      console.warn("Failed to update activity state in endSession", e);
    }

    setSessionId(null);
    setCurrentSessionSeconds(0);
    currentSessionSecondsRef.current = 0;
    setCurrentSessionDuration(0);
    currentSessionDurationRef.current = 0;
    sessionStartTimeRef.current = null;
  }, [isOnline]);

  // Initialize session and fetch initial data
  useEffect(() => {
    if (!user) {
      setSessionId(null);
      setActiveSecondsToday(0);
      setCurrentSessionSeconds(0);
      return;
    }

    const init = async () => {
      // 1. Load from local persistence first (fast)
      try {
        const today = formatLocalISODate(new Date());
        lastDayRef.current = today;
        setTrackingDate(today);

        const storedQueue = localStorage.getItem('offlineQueue');
        if (storedQueue) {
          try {
            const parsedQueue = JSON.parse(storedQueue);
            const queueUser = parsedQueue?.userId ? String(parsedQueue.userId) : "";
            if (queueUser && queueUser !== userKey) {
              localStorage.removeItem("offlineQueue");
              offlineQueueRef.current = null;
            }
          } catch {
            localStorage.removeItem("offlineQueue");
            offlineQueueRef.current = null;
          }
        }

        rolloverToDay(today);

        let storedStats = localStorage.getItem('activityState');
        let stats = storedStats ? JSON.parse(storedStats) : null;
        
        // If main state has no active session, check backup
        if (!stats?.sessionId) {
          const backup = localStorage.getItem('activityState_backup');
          if (backup) {
            try {
              const backupStats = JSON.parse(backup);
              // Only use backup if it belongs to current user and is recent (< 10 mins)
              const backupUser = backupStats?.userId ? String(backupStats.userId) : "";
              const backupTime = backupStats?.timestamp || 0;
              const isRecent = (Date.now() - backupTime) < 10 * 60 * 1000;
              
              if (backupUser === userKey && isRecent) {
                 console.log("Restoring session from backup (main state was cleared)");
                 stats = backupStats;
              }
            } catch (e) {
              console.warn("Failed to parse backup stats", e);
            }
          }
        }

        if (stats) {
            const storedUser = stats?.userId ? String(stats.userId) : "";
            if (!storedUser || storedUser !== userKey) {
              // Only clear if we are sure it's wrong user
              if (storedUser && storedUser !== userKey) {
                  localStorage.removeItem("activityState");
                  // Don't clear backup here, it might belong to another user but harmless
                  setSessionId(null);
                  sessionIdRef.current = null;
                  sessionParamsRef.current = null;
                  setActiveSecondsToday(0);
                  activeSecondsTodayRef.current = 0;
                  setTotalDurationToday(0);
                  totalDurationTodayRef.current = 0;
                  setCurrentSessionSeconds(0);
                  currentSessionSecondsRef.current = 0;
                  setCurrentSessionDuration(0);
                  currentSessionDurationRef.current = 0;
              }
            } else {
              const storedDate = normalizeDateKey(stats.trackingDate || "");

              if (storedDate === today) {
                  console.log("Restoring local stats for today");
                  
                  if (stats.sessionStartTime) {
                    sessionStartTimeRef.current = stats.sessionStartTime;
                  }
                  
                  if (stats.isPaused) {
                    setIsPaused(true);
                  }

                  let elapsed = 0;
                  // Only add elapsed time if we were active and have a valid timestamp
                  // Crucial fix: even if paused/idle, we might want to recover the gap if it was short
                  // But standard logic is: if not paused, add elapsed.
                  if (!stats.isPaused && stats.sessionId && stats.timestamp) {
                    const diff = Math.floor((Date.now() - stats.timestamp) / 1000);
                    // Sanity check: if elapsed is negative (clock skew) or huge (>24h), ignore it
                    if (diff > 0 && diff < 86400) {
                      elapsed = diff;
                      console.log(`Restoring session: added ${elapsed}s elapsed time`);
                    }
                  }

                  const restoredActive = (stats.activeSecondsToday || 0) + elapsed;
                  setActiveSecondsToday(restoredActive);
                  activeSecondsTodayRef.current = restoredActive;
                  
                  const restoredTotalDuration = (stats.totalDurationToday || 0) + elapsed;
                  setTotalDurationToday(restoredTotalDuration);
                  totalDurationTodayRef.current = restoredTotalDuration;
                  
                  const restoredSessionSeconds = (stats.currentSessionSeconds || 0) + elapsed;
                  setCurrentSessionSeconds(restoredSessionSeconds);
                  currentSessionSecondsRef.current = restoredSessionSeconds;
                  
                  const restoredSessionDuration = (stats.currentSessionDuration || 0) + elapsed;
                  setCurrentSessionDuration(restoredSessionDuration);
                  currentSessionDurationRef.current = restoredSessionDuration;

                  if (stats.sessionId) {
                      setSessionId(stats.sessionId);
                      sessionIdRef.current = stats.sessionId;
                      
                      // If we don't have a start time but have a session, approximate it
                      if (!sessionStartTimeRef.current) {
                        sessionStartTimeRef.current = Date.now() - (restoredSessionSeconds * 1000);
                      }
                  }
                  if (stats.sessionParams) {
                      sessionParamsRef.current = stats.sessionParams;
                  }
              } else {
                  console.log("Local stats are from previous day, resetting");
                  // Don't load old stats, start fresh for today
              }
            }
        }
      } catch(e) {
        console.error("Failed to parse local stats", e);
      }

      try {
        if (!isOnline) {
          // Offline initialization
          console.log("Initializing in offline mode");
          setIsReady(true);
          return;
        }

        // 2. Fetch today's total stats from server (authoritative)
        const todayStart = parseLocal(formatLocalISODate(new Date())).toISOString();
        const overview = await getStudySessionOverview(todayStart);
        
        const serverSeconds = overview.total_seconds_today || 0;
        // Use local if available and greater (to avoid jumping back due to sync lag)
        const localSeconds = activeSecondsTodayRef.current;
        const newSeconds = Math.max(serverSeconds, localSeconds);
        
        setActiveSecondsToday(newSeconds);
        activeSecondsTodayRef.current = newSeconds;

        const serverDuration = overview.total_duration_today || 0;
        const localDuration = totalDurationTodayRef.current;
        const newDuration = Math.max(serverDuration, localDuration);

        setTotalDurationToday(newDuration);
        totalDurationTodayRef.current = newDuration;

      } catch (err) {
        console.error("Failed to init activity session", err);
      } finally {
        setIsReady(true);
      }
    };

    init();
  }, [user]); // Only run on mount or user change, NOT on isOnline change

  useEffect(() => {
    if (!user) return;
    const updateToNow = () => {
      const currentDay = formatLocalISODate(new Date());
      setTrackingDate(currentDay);
      lastDayRef.current = currentDay;
      rolloverToDay(currentDay);
    };

    updateToNow();

    const scheduleNext = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 50);
      const delay = Math.max(0, nextMidnight.getTime() - now.getTime());
      if (streakMidnightTimeoutRef.current != null) {
        window.clearTimeout(streakMidnightTimeoutRef.current);
      }
      streakMidnightTimeoutRef.current = window.setTimeout(() => {
        updateToNow();
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    const onVisibility = () => {
      if (document.visibilityState === "visible") updateToNow();
    };
    const onFocus = () => updateToNow();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      if (streakMidnightTimeoutRef.current != null) {
        window.clearTimeout(streakMidnightTimeoutRef.current);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [rolloverToDay, user]);

  useEffect(() => {
    if (!userKey) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DAILY_STREAK_STATE_KEY) return;
      if (!e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        const today = formatLocalISODate(new Date());
        const next = sanitizePersistedStreakState(parsed, today);
        if (next.userId !== userKey) return;
        applyStreakState(next);
      } catch {
        return;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyStreakState, sanitizePersistedStreakState, userKey]);

  // Activity listeners to detect user presence
  useEffect(() => {
    if (!user) return;
    const lastStreakActivityTsRef = { current: 0 };

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) {
        setIsIdle(false);
        // We could optionally trigger an immediate heartbeat here to mark resumption
      }
      const now = Date.now();
      if (!hasStreakActivityToday && now - lastStreakActivityTsRef.current > 500) {
        lastStreakActivityTsRef.current = now;
        registerStreakActivity();
      }
    };

    // Listen for common user interactions
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, handleUserActivity));
    
    return () => {
      events.forEach((e) => window.removeEventListener(e, handleUserActivity));
    };
  }, [user, isIdle, hasStreakActivityToday, registerStreakActivity]);

  useEffect(() => {
    if (!user) return;
    const onAppActivity = () => {
      registerStreakActivity();
    };
    window.addEventListener("notescape:activity", onAppActivity as EventListener);
    return () => window.removeEventListener("notescape:activity", onAppActivity as EventListener);
  }, [registerStreakActivity, user]);

  // Ticking and Idle Detection
  useEffect(() => {
    // Add beforeunload listener to save state on page close/refresh
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        persistState();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    if (!user || !sessionId || isPaused) {
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }

    const tick = setInterval(() => {
      if (isPaused) return;

      // Check for midnight transition
      const currentDay = formatLocalISODate(new Date());
      if (currentDay !== lastDayRef.current) {
         console.log(`[ActivityContext] Midnight transition detected: ${lastDayRef.current} -> ${currentDay}`);
         
         // Update tracking date state
         setTrackingDate(currentDay);
         
         // Reset daily counters
        setActiveSecondsToday(0);
        activeSecondsTodayRef.current = 0;
        setTotalDurationToday(0);
        totalDurationTodayRef.current = 0;
        
        // Rotate session if active
         if (sessionParamsRef.current) {
            console.log("Rotating session for new day");
            // We use void to ignore promise and run it 'in background'
             // This will end current session and start a new one, resetting counters
             void startSession(sessionParamsRef.current.mode, sessionParamsRef.current.classId).catch(console.error);
         } else {
             // Fallback if no params (shouldn't happen if session active)
             setCurrentSessionSeconds(0);
             setCurrentSessionDuration(0);
             currentSessionSecondsRef.current = 0;
             currentSessionDurationRef.current = 0;
         }
         
         lastDayRef.current = currentDay;
         return; // Skip the rest of this tick to avoid double counting or race conditions
      }

      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      
      // If no activity for 60 seconds, mark as idle
      // We also check document.visibilityState to handle tab switching
      const isHidden = document.visibilityState === 'hidden';
      
      // Always increment duration if not paused
      currentSessionDurationRef.current += 1;
      totalDurationTodayRef.current += 1;
      setCurrentSessionDuration(currentSessionDurationRef.current);
      setTotalDurationToday(totalDurationTodayRef.current);

      if (timeSinceLastActivity > 60000 || isHidden) {
        if (!isIdle) {
            setIsIdle(true);
        }
      } else {
        if (isIdle) setIsIdle(false);
        
        // Increment active seconds only if not idle
        currentSessionSecondsRef.current += 1;
        activeSecondsTodayRef.current += 1;
        setCurrentSessionSeconds(currentSessionSecondsRef.current);
        setActiveSecondsToday(activeSecondsTodayRef.current);
      }
      
      // Persist state locally every second for robustness
      persistState();
    }, 1000);
    
    tickIntervalRef.current = tick;
    return () => {
      clearInterval(tick);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, sessionId, isIdle, isPaused, persistState]);

  // Heartbeat to sync with backend
  useEffect(() => {
    if (!user || !sessionId || isPaused) return;

    const heartbeat = setInterval(async () => {
      if (isPaused) return; 
      
      // If offline, just log or update local persistence
      if (!isOnline) {
         console.log("Offline heartbeat: accumulating time locally");
         persistState();
         return;
      }

      // If online but session is pending, try to start it first
      if (sessionId === "offline_pending") {
        try {
           const payload = offlineQueueRef.current?.payload || { mode: "app_usage" };
           const session = await startStudySession(payload);
           console.log("Recovered offline session:", session.id);
           setSessionId(session.id);
           updateOfflineQueue(null);
           
           // We keep the accumulated time
           // Now we can send a heartbeat immediately or wait for next tick
           // Let's force a heartbeat immediately
           await heartbeatStudySession({
            session_id: session.id,
            accumulated_seconds: currentSessionSecondsRef.current,
            duration_seconds: currentSessionDurationRef.current,
          });
        } catch (err) {
           console.error("Failed to recover offline session", err);
        } finally {
           setIsSyncing(false);
        }
        return;
      }

      // Normal online heartbeat
      try {
        const result = await heartbeatStudySession({
          session_id: sessionId,
          accumulated_seconds: currentSessionSecondsRef.current,
          duration_seconds: currentSessionDurationRef.current,
        });

        // Check for session rotation (midnight crossing)
        if (result.id !== sessionId) {
          console.log("Session rotated due to new day", result.id);
          setSessionId(result.id);
          // Reset counters for the new day
          setCurrentSessionSeconds(result.active_seconds);
          setCurrentSessionDuration(result.duration_seconds);
          setActiveSecondsToday(result.active_seconds);
          setTotalDurationToday(result.duration_seconds);
          
          // Update refs immediately
          currentSessionSecondsRef.current = result.active_seconds;
          currentSessionDurationRef.current = result.duration_seconds;
          sessionIdRef.current = result.id;
        }
      } catch (err) {
        console.error("Heartbeat failed", err);
      }
    }, 30000); // Sync every 30 seconds

    heartbeatIntervalRef.current = heartbeat;
    return () => clearInterval(heartbeat);
  }, [user, sessionId, isIdle, isPaused, isOnline]);

  const value = {
    activeSecondsToday,
    totalDurationToday,
    currentSessionSeconds,
    currentSessionDuration,
    isIdle,
    formattedTime: formatDuration(activeSecondsToday),
    formattedDuration: formatDuration(totalDurationToday),
    pause,
    resume,
    startSession,
    switchSession,
    endSession,
    lastActiveTime: lastActivityRef.current,
    isReady,
    isOnline,
    isSyncing,
    trackingDate,
    dailyStreakCount,
    dailyStreakDisplayCount: dailyStreakCount + (hasStreakActivityToday ? 1 : 0),
    dailyStreakLastCountedDay,
    hasStreakActivityToday,
    registerStreakActivity,
    resetDailyStreak,
  };

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
