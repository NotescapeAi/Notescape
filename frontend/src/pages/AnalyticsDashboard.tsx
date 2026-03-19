import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  LineController,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Clock,
  Check,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  PartyPopper,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Download,
  Timer,
  Zap,
} from "lucide-react";
import {
  getAnalyticsOverview,
  getActivityTimeline,
  getStreaks,
  getStudyTrends,
  getStudySessionOverview,
  AnalyticsOverview,
  ActivityTimelineItem,
  StreaksResponse,
  StudyTrendPoint,
  StudySessionOverview,
  API_BASE_URL,
} from "../lib/api";
import { formatDuration, formatDurationFixed, parseLocal } from "../lib/utils";
import { toast } from "react-toastify";
import AppShell from "../layouts/AppShell";
import { useUser } from "../hooks/useUser";
import { useActivity } from "../contexts/ActivityContext";
import { ThirtyDayProgress, DayProgress } from "../components/analytics/ThirtyDayProgress";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

type TimeRange = "daily" | "weekly" | "monthly";

const BLUE_DAY_SHADES = ["#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#1E3A8A", "#0B4EA2"];
const DISPLAY_CAP_HOURS = 8;

function formatYYYYMMDD(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getBaseTotalHours(timeRange: TimeRange, anchor: Date) {
  if (timeRange === "daily") return 24;
  if (timeRange === "weekly") return 168;
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return 24 * daysInMonth;
}

type CalendarViewMode = "weekly" | "monthly";

function isValidDate(d: Date) {
  return Number.isFinite(d.getTime());
}

function startOfWeekMonday(d: Date) {
  const out = new Date(d);
  const day = out.getDay();
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDaysMidnight(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  out.setHours(0, 0, 0, 0);
  return out;
}

function clampDayInMonth(year: number, monthIndex: number, day: number) {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  return clamp(day, 1, dim);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function DualViewCalendar({
  value,
  onChange,
  view,
  onViewChange,
}: {
  value: Date;
  onChange: (next: Date) => void;
  view: CalendarViewMode;
  onViewChange: (next: CalendarViewMode) => void;
}) {
  const selected = useMemo(() => {
    const next = new Date(value);
    if (!isValidDate(next)) return addDaysMidnight(new Date(), 0);
    next.setHours(0, 0, 0, 0);
    return next;
  }, [value]);

  const [displayYear, setDisplayYear] = useState(selected.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(selected.getMonth());

  useEffect(() => {
    setDisplayYear(selected.getFullYear());
    setDisplayMonth(selected.getMonth());
  }, [selected]);

  const todayIso = useMemo(() => formatYYYYMMDD(new Date()), []);
  const selectedIso = useMemo(() => formatYYYYMMDD(selected), [selected]);

  const monthLabel = `${MONTH_NAMES[displayMonth]} ${displayYear}`;

  const setMonthYear = (nextYear: number, nextMonth: number) => {
    const y = clamp(Math.trunc(nextYear), 1970, 2100);
    const m = clamp(Math.trunc(nextMonth), 0, 11);
    setDisplayYear(y);
    setDisplayMonth(m);

    const nextDay = clampDayInMonth(y, m, selected.getDate());
    const nextSelected = new Date(y, m, nextDay);
    nextSelected.setHours(0, 0, 0, 0);
    onChange(nextSelected);
  };

  const prevMonth = () => {
    const d = new Date(displayYear, displayMonth, 1);
    d.setMonth(d.getMonth() - 1);
    setMonthYear(d.getFullYear(), d.getMonth());
  };

  const nextMonth = () => {
    const d = new Date(displayYear, displayMonth, 1);
    d.setMonth(d.getMonth() + 1);
    setMonthYear(d.getFullYear(), d.getMonth());
  };

  const prevWeek = () => onChange(addDaysMidnight(selected, -7));
  const nextWeek = () => onChange(addDaysMidnight(selected, 7));

  const weekStart = useMemo(() => startOfWeekMonday(selected), [selected]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysMidnight(weekStart, i)), [weekStart]);
  const weekLabel = useMemo(() => {
    const startTxt = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endTxt = addDaysMidnight(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startTxt} – ${endTxt}`;
  }, [weekStart]);

  const monthGridDays = useMemo(() => {
    const first = new Date(displayYear, displayMonth, 1);
    first.setHours(0, 0, 0, 0);
    const mondayIndex = (first.getDay() + 6) % 7;
    const gridStart = addDaysMidnight(first, -mondayIndex);
    return Array.from({ length: 42 }, (_, i) => addDaysMidnight(gridStart, i));
  }, [displayYear, displayMonth]);

  const dayCellClassName = (iso: string, inMonth: boolean) => {
    const isSelected = iso === selectedIso;
    const isToday = iso === todayIso;

    const base =
      "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60";
    const tone = inMonth ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] opacity-60";
    const selectedCls = isSelected ? "bg-blue-500/15 ring-1 ring-blue-400/50" : "hover:bg-[var(--bg-subtle)]";
    const todayCls = isToday && !isSelected ? "ring-1 ring-orange-400/60" : "";
    return `${base} ${tone} ${selectedCls} ${todayCls}`;
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
            <button
              type="button"
              onClick={() => onViewChange("weekly")}
              aria-pressed={view === "weekly"}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                view === "weekly" ? "bg-blue-500/15 text-blue-200" : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => onViewChange("monthly")}
              aria-pressed={view === "monthly"}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                view === "monthly" ? "bg-blue-500/15 text-blue-200" : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              Monthly
            </button>
          </div>
          <div className="text-xs font-semibold text-[var(--text-secondary)]">{view === "weekly" ? weekLabel : monthLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={view === "weekly" ? prevWeek : prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            aria-label={view === "weekly" ? "Previous week" : "Previous month"}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="dual-calendar-month">
              Month
            </label>
            <select
              id="dual-calendar-month"
              aria-label="Month"
              value={displayMonth}
              onChange={(e) => setMonthYear(displayYear, Number(e.target.value))}
              className="h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-semibold text-[var(--text-primary)]"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>
                  {m}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="dual-calendar-year">
              Year
            </label>
            <input
              id="dual-calendar-year"
              aria-label="Year"
              type="number"
              value={displayYear}
              min={1970}
              max={2100}
              onChange={(e) => setMonthYear(Number(e.target.value), displayMonth)}
              className="h-9 w-[92px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-semibold text-[var(--text-primary)]"
            />
          </div>

          <button
            type="button"
            onClick={view === "weekly" ? nextWeek : nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            aria-label={view === "weekly" ? "Next week" : "Next month"}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        <AnimatePresence mode="wait" initial={false}>
          {view === "weekly" ? (
            <motion.div
              key="weekly"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-7 gap-2"
            >
              {weekDays.map((d) => {
                const iso = formatYYYYMMDD(d);
                const isSelected = iso === selectedIso;
                const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-label={`Calendar day ${iso}`}
                    onClick={() => onChange(d)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center transition-colors ${
                      isSelected
                        ? "border-blue-500/30 bg-blue-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]"
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{weekday}</div>
                    <div className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{d.getDate()}</div>
                  </button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="monthly"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="grid grid-cols-7 gap-1 px-1 pb-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
                  <div key={w} className="text-center text-[11px] font-semibold text-[var(--text-secondary)]">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGridDays.map((d) => {
                  const iso = formatYYYYMMDD(d);
                  const inMonth = d.getMonth() === displayMonth && d.getFullYear() === displayYear;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-label={`Calendar day ${iso}`}
                      onClick={() => onChange(d)}
                      className={dayCellClassName(iso, inMonth)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] shadow-sm">
      <Clock size={14} className="text-[var(--primary)]" />
      <span suppressHydrationWarning>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>
  );
}

const LongestStreakCard = ({
  streak,
  onClick,
  ariaControls,
  ariaExpanded,
}: {
  streak: number;
  onClick: () => void;
  ariaControls?: string;
  ariaExpanded?: boolean;
}) => {
  const [tapPulse, setTapPulse] = useState(0);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      onClick={() => {
        setTapPulse((n) => n + 1);
        onClick();
      }}
      aria-haspopup="dialog"
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={`Streak ${streak} days`}
      className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-[var(--bg-surface)] p-6 text-left shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-blue-500/60 hover:shadow-[0_18px_40px_rgba(37,99,235,0.14)]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 55%), radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.18), transparent 55%)",
        }}
      />

      <motion.span
        key={tapPulse}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.span
          className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(59, 130, 246, 0.30), rgba(59, 130, 246, 0.00) 65%)",
          }}
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: 2.4, opacity: [0, 1, 0] }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      </motion.span>

      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">Streak</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="inline-flex items-center gap-2">
              <Flame className="text-orange-400" size={22} />
              <div className="text-4xl font-bold text-[var(--text-primary)] tabular-nums">{streak}</div>
            </div>
            <div className="text-sm text-[var(--text-secondary)]">days</div>
          </div>
          <div className="mt-3 text-xs text-blue-300/90"></div>
        </div>
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full bg-blue-500/10" />
          <div className="absolute inset-1 rounded-full bg-blue-500/10" />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Flame className="text-orange-400" size={20} />
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
};

const StatCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  colorClass,
  onClick,
  ariaControls,
  ariaExpanded,
}: {
  title: string;
  value: string | number;
  subtext?: string;
  icon: any;
  colorClass: string;
  onClick?: () => void;
  ariaControls?: string;
  ariaExpanded?: boolean;
}) => {
  const [tapPulse, setTapPulse] = useState(0);
  const interactive = typeof onClick === "function";
  const Root: any = interactive ? motion.button : motion.div;

  return (
    <Root
      type={interactive ? "button" : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      onClick={
        interactive
          ? () => {
              setTapPulse((n) => n + 1);
              onClick();
            }
          : undefined
      }
      aria-haspopup={interactive ? "dialog" : undefined}
      aria-controls={interactive ? ariaControls : undefined}
      aria-expanded={interactive ? ariaExpanded : undefined}
      className={`relative overflow-hidden bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--border-subtle)] p-6 text-left ${
        interactive
          ? "cursor-pointer transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 hover:shadow-[0_18px_40px_rgba(37,99,235,0.12)]"
          : ""
      }`}
    >
      {interactive ? (
        <motion.span
          key={tapPulse}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.span
            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(59, 130, 246, 0.28), rgba(59, 130, 246, 0.00) 65%)",
            }}
            initial={{ scale: 0.55, opacity: 0 }}
            animate={{ scale: 2.2, opacity: [0, 1, 0] }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        </motion.span>
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg bg-opacity-10 ${colorClass.replace('text-', 'bg-')}`}>
          <Icon className={colorClass} size={24} />
        </div>
        {subtext && (
          <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-1 rounded-full">
            {subtext}
          </span>
        )}
      </div>
      <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-1 tabular-nums font-mono tracking-tight">
        {value}
      </h3>
      <p className="text-sm text-[var(--text-secondary)]">{title}</p>
    </Root>
  );
};

type WeeklyStreakConfig = {
  goalDays?: number;
  activeGradient?: [string, string];
  missedBg?: string;
  missedBorder?: string;
  todayRing?: string;
};

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayLocal(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDaysLocal(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function computeLongestRun(flags: boolean[]) {
  let best = 0;
  let cur = 0;
  for (const f of flags) {
    if (f) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

function computeTrailingRun(flags: boolean[]) {
  let cur = 0;
  for (let i = flags.length - 1; i >= 0; i -= 1) {
    if (flags[i]) cur += 1;
    else break;
  }
  return cur;
}

const WEEKLY_STREAK_CACHE_KEY = "notescape.weekly_streak.cache.v1";
const WEEKLY_STREAK_CONFIG_KEY = "notescape.weekly_streak.config.v1";

const WeeklyStreakViz = ({
  trends,
  overallCurrent,
  overallLongest,
  config,
  activeSecondsToday,
  totalDurationToday,
}: {
  trends: StudyTrendPoint[];
  overallCurrent: number;
  overallLongest: number;
  config?: WeeklyStreakConfig;
  activeSecondsToday?: number;
  totalDurationToday?: number;
}) => {
  const [userCfg, setUserCfg] = useState<WeeklyStreakConfig | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEEKLY_STREAK_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setUserCfg(parsed);
    } catch (e) {
      void e;
    }
  }, []);

  useEffect(() => {
    if (!userCfg) return;
    try {
      window.localStorage.setItem(WEEKLY_STREAK_CONFIG_KEY, JSON.stringify(userCfg));
    } catch (e) {
      void e;
    }
  }, [userCfg]);

  const cfg: Required<WeeklyStreakConfig> = useMemo(
    () => ({
      goalDays: userCfg?.goalDays ?? config?.goalDays ?? 7,
      activeGradient: (config?.activeGradient ?? ["#3B82F6", "#6366F1"]) as [string, string],
      missedBg: userCfg?.missedBg ?? config?.missedBg ?? "var(--bg-subtle)",
      missedBorder: userCfg?.missedBorder ?? config?.missedBorder ?? "var(--border-subtle)",
      todayRing: userCfg?.todayRing ?? config?.todayRing ?? "rgba(59, 130, 246, 0.55)",
    }),
    [config, userCfg]
  );

  const trendMap = useMemo(() => {
    const m = new Map<string, number>();

    // 1. Initialize with cached data to preserve recent sessions not yet synced
    try {
      const raw = window.localStorage.getItem(WEEKLY_STREAK_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const days = parsed?.days;
        if (days && typeof days === "object") {
          for (const [k, v] of Object.entries(days)) {
            const seconds = Number(v) || 0;
            if (typeof k === "string") m.set(k, seconds);
          }
        }
      }
    } catch (e) {
      void e;
    }

    // 2. Merge authoritative trends from backend (taking max to avoid regression)
    for (const t of trends || []) {
      // Prioritize active study time over total tracked duration
      const backendSeconds = Number(t.study_time ?? 0);
      const localSeconds = m.get(t.day) || 0;
      m.set(t.day, Math.max(backendSeconds, localSeconds));
    }

    // 3. Merge live data for today
    if ((activeSecondsToday || 0) > 0 || (totalDurationToday || 0) > 0) {
      const todayKey = localYmd(startOfDayLocal(new Date()));
      // Prioritize live active session time (timer value) over total duration
      const liveTotal = activeSecondsToday || 0;
      // Use max of live vs existing (though live is usually authoritative for today)
      const existing = m.get(todayKey) || 0;
      m.set(todayKey, Math.max(liveTotal, existing));
    }

    return m;
  }, [trends, activeSecondsToday, totalDurationToday]);

  useEffect(() => {
    // Save both trends and current active session to cache
    try {
      const current: any = (() => {
        const raw = window.localStorage.getItem(WEEKLY_STREAK_CACHE_KEY);
        if (!raw) return { days: {}, updatedAt: Date.now() };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { days: {}, updatedAt: Date.now() };
        if (!parsed.days || typeof parsed.days !== "object") return { days: {}, updatedAt: Date.now() };
        return parsed;
      })();

      const nextDays: Record<string, number> = { ...(current.days || {}) };
      
      // Update from trends
      if (trends) {
        for (const t of trends) {
          const seconds = Number(t.study_time ?? 0);
          if (t.day) nextDays[t.day] = Math.max(seconds, nextDays[t.day] || 0);
        }
      }

      // Update from live session
      if ((activeSecondsToday || 0) > 0) {
        const todayKey = localYmd(startOfDayLocal(new Date()));
        nextDays[todayKey] = Math.max(activeSecondsToday, nextDays[todayKey] || 0);
      }

      const now = startOfDayLocal(new Date());
      const cutoff = startOfDayLocal(addDaysLocal(now, -90));
      for (const key of Object.keys(nextDays)) {
        const d = parseLocal(key);
        if (d && startOfDayLocal(d) < cutoff) delete nextDays[key];
      }

      window.localStorage.setItem(
        WEEKLY_STREAK_CACHE_KEY,
        JSON.stringify({ days: nextDays, updatedAt: Date.now() })
      );
    } catch (e) {
      void e;
    }
  }, [trends, activeSecondsToday]);

  const days = useMemo(() => {
    const goal = Math.max(1, Math.min(14, cfg.goalDays));
    const today = startOfDayLocal(new Date());
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const fmtLong = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const list = [];
    for (let i = goal - 1; i >= 0; i -= 1) {
      const d = startOfDayLocal(addDaysLocal(today, -i));
      const key = localYmd(d);
      const seconds = trendMap.get(key) ?? 0;
      const isActive = seconds > 0;
      list.push({
        key,
        date: d,
        weekday: fmt.format(d),
        dateLabel: fmtLong.format(d),
        seconds,
        isActive,
        isToday: key === localYmd(today),
      });
    }
    return list;
  }, [cfg.goalDays, trendMap]);

  const flags = useMemo(() => days.map((d) => d.isActive), [days]);
  const current7 = useMemo(() => computeTrailingRun(flags), [flags]);
  const best7 = useMemo(() => computeLongestRun(flags), [flags]);
  const activeCount = useMemo(() => flags.filter(Boolean).length, [flags]);
  const missedCount = Math.max(0, days.length - activeCount);

  const tooltip = useMemo(() => {
    if (!hoveredKey) return null;
    const d = days.find((x) => x.key === hoveredKey);
    if (!d) return null;
    const hours = d.seconds / 3600;
    const value =
      d.seconds <= 0 ? "No activity" : hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(d.seconds / 60)}m`;
    return { ...d, value };
  }, [days, hoveredKey]);

  const progressPct = Math.round((current7 / Math.max(1, days.length)) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(circle at top, rgba(245, 158, 11, 0.18), transparent 60%), radial-gradient(circle at bottom right, rgba(239, 68, 68, 0.12), transparent 55%)",
        }}
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <Flame className="h-4 w-4 text-[#F59E0B]" />
            Weekly Streak
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="flex items-baseline gap-2">
              <div
                className="text-4xl font-extrabold tracking-tight tabular-nums"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${cfg.activeGradient[0]}, ${cfg.activeGradient[1]})`,
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                }}
              >
                {current7}
              </div>
              <div className="text-sm font-semibold text-[var(--text-secondary)]">/ {days.length} days</div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                Best {best7}/{days.length}
              </span>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                Current {overallCurrent}d
              </span>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                Longest {overallLongest}d
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundImage: `linear-gradient(90deg, ${cfg.activeGradient[0]}, ${cfg.activeGradient[1]})` }}
              />
            </div>
            <div className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">{progressPct}%</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">Missed</div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text-primary)] tabular-nums">{missedCount}</div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">Last 7 days</div>
        </div>
      </div>

      <div className="relative z-10 mt-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">This week</div>
          <div className="text-xs text-[var(--text-muted)] sm:hidden">
            Best {best7}/{days.length} • Current {overallCurrent}d • Longest {overallLongest}d
          </div>
        </div>

        <details className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
            Customize
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="weekly-streak-goal">
                Streak goal (days)
              </label>
              <input
                id="weekly-streak-goal"
                type="number"
                min={1}
                max={14}
                value={cfg.goalDays}
                onChange={(e) =>
                  setUserCfg((prev) => ({ ...(prev || {}), goalDays: Math.max(1, Math.min(14, Number(e.target.value) || 7)) }))
                }
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
            </div>
          </div>
        </details>

        <div className="mt-3 grid grid-cols-7 gap-2 sm:gap-3">
          {days.map((d) => {
            const status = d.isActive ? "Active" : "Missed";
            const id = `weekly-streak-tip-${d.key}`;
            const isHovered = hoveredKey === d.key;
            return (
              <div key={d.key} className="relative flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Streak day ${d.key}: ${status}`}
                  aria-describedby={isHovered ? id : undefined}
                  onMouseEnter={() => setHoveredKey(d.key)}
                  onMouseLeave={() => setHoveredKey((prev) => (prev === d.key ? null : prev))}
                  onFocus={() => setHoveredKey(d.key)}
                  onBlur={() => setHoveredKey((prev) => (prev === d.key ? null : prev))}
                  className="group relative outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
                  style={{ borderRadius: 9999, boxShadow: d.isToday ? `0 0 0 3px ${cfg.todayRing}` : undefined }}
                >
                  <motion.div
                    layout
                    className="flex h-10 w-10 items-center justify-center rounded-full border"
                    style={{
                      borderColor: d.isActive ? "rgba(245, 158, 11, 0.35)" : cfg.missedBorder,
                      background: d.isActive
                        ? `linear-gradient(135deg, ${cfg.activeGradient[0]}, ${cfg.activeGradient[1]})`
                        : cfg.missedBg,
                      transform: "translateZ(0)",
                    }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  >
                    {d.isActive ? (
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <Check className="h-5 w-5 text-white" />
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0.6 }}
                        animate={{ scale: 1, opacity: 0.8 }}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: "rgba(148, 163, 184, 0.55)" }}
                      />
                    )}
                  </motion.div>
                </button>
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{d.weekday.slice(0, 1)}</div>

                {isHovered && tooltip && tooltip.key === d.key ? (
                  <div
                    id={id}
                    role="tooltip"
                    className="absolute -top-12 z-20 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] shadow-lg"
                  >
                    <span className="font-semibold">{tooltip.dateLabel}</span>
                    <span className="mx-1 text-[var(--text-muted)]">•</span>
                    <span className="text-[var(--text-secondary)]">{tooltip.value}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default function AnalyticsDashboard() {
  const { user } = useUser();
  const { formattedTime, isIdle, isReady, activeSecondsToday, totalDurationToday, isOnline, isSyncing, trackingDate, dailyStreakDisplayCount } = useActivity();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [sessionOverview, setSessionOverview] = useState<StudySessionOverview | null>(null);
  const [streaks, setStreaks] = useState<StreaksResponse | null>(null);
  const [trends, setTrends] = useState<StudyTrendPoint[]>([]);

  const [activityTimeline, setActivityTimeline] = useState<ActivityTimelineItem[]>([]);
  const [activityTimelineLoading, setActivityTimelineLoading] = useState(false);
  const [activityTimelineError, setActivityTimelineError] = useState<string | null>(null);
  
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const [yScrollByRange, setYScrollByRange] = useState<Record<TimeRange, number>>({
    daily: 0,
    weekly: 0,
    monthly: 0,
  });
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastSSEMessage, setLastSSEMessage] = useState<any>(null);
  const [timeDetailsOpen, setTimeDetailsOpen] = useState(false);
  const [streakCongratsOpen, setStreakCongratsOpen] = useState(false);
  const [thirtyDayOpen, setThirtyDayOpen] = useState(false);
  const [streakCelebrationStage, setStreakCelebrationStage] = useState<0 | 1 | 2 | 3>(3);
  const [streakCelebrationSeed, setStreakCelebrationSeed] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("weekly");
  const [calendarUserSelected, setCalendarUserSelected] = useState(false);
  const calendarPopoverRef = React.useRef<HTMLDivElement | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => {
    const parsed = trackingDate
      ? /^\d{4}-\d{2}-\d{2}$/.test(trackingDate)
        ? parseLocal(trackingDate)
        : new Date(trackingDate)
      : new Date();
    if (!isValidDate(parsed)) return addDaysMidnight(new Date(), 0);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  });

  // SSE Connection Status
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const retryTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOnline) {
        loadData();
    } else {
        setLoading(false);
    }
  }, [timeRange, isOnline, calendarAnchor]);

  useEffect(() => {
    if (calendarUserSelected) return;
    const parsed = trackingDate
      ? /^\d{4}-\d{2}-\d{2}$/.test(trackingDate)
        ? parseLocal(trackingDate)
        : new Date(trackingDate)
      : new Date();
    if (!isValidDate(parsed)) return;
    parsed.setHours(0, 0, 0, 0);
    setCalendarAnchor(parsed);
  }, [trackingDate, calendarUserSelected]);

  useEffect(() => {
    if (!calendarOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!calendarPopoverRef.current) return;
      if (calendarPopoverRef.current.contains(e.target as Node)) return;
      setCalendarOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [calendarOpen]);

  const streakCongratsCloseRef = React.useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!streakCongratsOpen) return;
    streakCongratsCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStreakCongratsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [streakCongratsOpen]);

  useEffect(() => {
    if (!streakCongratsOpen) {
      setStreakCelebrationStage(3);
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setStreakCelebrationSeed((v) => v + 1);
    setStreakCelebrationStage(reduceMotion ? 3 : 0);
    if (reduceMotion) return;

    const t1 = window.setTimeout(() => setStreakCelebrationStage(1), 220);
    const t2 = window.setTimeout(() => setStreakCelebrationStage(2), 520);
    const t3 = window.setTimeout(() => setStreakCelebrationStage(3), 1200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [streakCongratsOpen, dailyStreakDisplayCount]);

  useEffect(() => {
    if (!streakCongratsOpen) return;
    let cancelled = false;
    setActivityTimelineLoading(true);
    setActivityTimelineError(null);
    getActivityTimeline({ limit: 25 })
      .then((items) => {
        if (cancelled) return;
        setActivityTimeline(items);
        if ((import.meta as any)?.env?.DEV && items.length === 0) {
          getActivityTimeline({ limit: 25, trace: true }).catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message ? String(err.message) : "Failed to load activity timeline";
        setActivityTimelineError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setActivityTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [streakCongratsOpen]);

  useEffect(() => {
    if (!timeDetailsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimeDetailsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [timeDetailsOpen]);

  // Real-time SSE Connection with Retry Logic
  useEffect(() => {
    if (!user || !isOnline) {
        setSseStatus('error');
        return;
    }

    const connectSSE = async () => {
        // Cleanup previous connection if exists
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
        }

        try {
            const token = await user.getIdToken();
            setSseStatus('connecting');
            
            const eventSource = new EventSource(`${API_BASE_URL}/analytics/stream?token=${token}`);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                setSseStatus('connected');
                setLiveConnected(true);
                setError(null); 
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setLastSSEMessage(data);
                    if (data.type === 'overview_update') {
                        setOverview(prev => ({ ...prev, ...data.payload }));
                    } else if (data.type === 'heartbeat') {
                        // Optional: update live counters if needed
                    }
                } catch (err) {
                    console.error("Error parsing SSE message", err);
                }
            };

            eventSource.onerror = (err) => {
                console.warn("SSE Connection Error, retrying in 5s...", err);
                setSseStatus('error');
                setLiveConnected(false);
                eventSource.close();
                
                // Retry after 5 seconds
                retryTimeoutRef.current = setTimeout(() => {
                    if (isOnline) connectSSE();
                }, 5000);
            };
        } catch (err) {
            console.error("Failed to setup SSE", err);
            setSseStatus('error');
        }
    };

    connectSSE();

    return () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
        }
    };
  }, [user, isOnline]);



  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const anchorStart = new Date(calendarAnchor);
      if (!isValidDate(anchorStart)) {
        anchorStart.setTime(new Date().getTime());
      }
      anchorStart.setHours(0, 0, 0, 0);
      const todayStart = anchorStart.toISOString();

      const trendDays = timeRange === "monthly" ? 730 : 365;

      const results = await Promise.allSettled([
        getAnalyticsOverview(todayStart),
        getStreaks(),
        getStudyTrends({ days: trendDays }),
        getStudySessionOverview(todayStart),
      ]);

      const [ovResult, strResult, trResult, soResult] = results;

      if (ovResult.status === 'fulfilled') setOverview(ovResult.value);
      if (strResult.status === 'fulfilled') setStreaks(strResult.value);
      if (trResult.status === 'fulfilled') setTrends(trResult.value); // Full year data
      if (soResult.status === 'fulfilled') setSessionOverview(soResult.value);

      // Check for errors
      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length > 0) {
        console.error("Some analytics data failed to load", errors);
        if (errors.length === results.length) {
            setError("Failed to load analytics data. Database might be unavailable.");
        } else {
            toast.warn("Some analytics sections could not be loaded.");
        }
      }
    } catch (err: any) {
      console.error("Failed to load analytics:", err);
      setError("Failed to load analytics data. Please try again later.");
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!trends.length) {
      toast.info("No data to export");
      return;
    }

    const headers = ["Date", "Total Reviews", "Avg Response Time (ms)"];
    const csvContent = [
      headers.join(","),
      ...trends.map(t => 
        `${t.day},${t.total_reviews},${t.avg_response_time}`
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `study_analytics_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  const { trendLineData, trendLineTooltipMeta, yTotalHours, yMaxDataHours } = useMemo(() => {
    const anchor = new Date(calendarAnchor);
    if (Number.isNaN(anchor.getTime())) {
      const fallback = new Date();
      fallback.setHours(0, 0, 0, 0);
      anchor.setTime(fallback.getTime());
    }
    anchor.setHours(0, 0, 0, 0);

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

    const toIso = (d: Date) => formatYYYYMMDD(d);

    const byIso = new Map<string, StudyTrendPoint>();
    for (const t of trends || []) {
      if (!t?.day) continue;
      byIso.set(t.day, t);
    }

    const anchorIso = toIso(anchor);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isAnchorToday = anchorIso === toIso(todayStart);
    if (isAnchorToday && (activeSecondsToday > 0 || totalDurationToday > 0)) {
      const existing = byIso.get(anchorIso);
      if (existing) {
        byIso.set(anchorIso, {
          ...existing,
          study_time: Math.max(existing.study_time || 0, activeSecondsToday),
          duration_seconds: Math.max(existing.duration_seconds || 0, totalDurationToday),
        });
      } else {
        byIso.set(anchorIso, {
          day: anchorIso,
          total_reviews: 0,
          avg_response_time: 0,
          study_time: activeSecondsToday,
          duration_seconds: totalDurationToday,
        } as any);
      }
    }

    const labels: string[] = [];
    const hours: number[] = [];
    const tooltipMeta: Array<{ kind: "day" | "week" | "month"; startIso: string; endIso?: string }> = [];
    const targetHours = timeRange === "weekly" ? 5 : timeRange === "monthly" ? 10 : null;

    if (timeRange === "daily") {
      const start = addDays(anchor, -6);
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i);
        const iso = toIso(day);
        const p = byIso.get(iso);
        labels.push(day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase());
        hours.push((Number(p?.study_time ?? 0) || 0) / 3600);
        tooltipMeta.push({ kind: "day", startIso: iso });
      }
    } else if (timeRange === "weekly") {
      const endWeekStart = startOfWeekMonday(anchor);
      const firstWeekStart = addDays(endWeekStart, -(11 * 7));
      for (let w = 0; w < 12; w++) {
        const weekStart = addDays(firstWeekStart, w * 7);
        const weekEnd = addDays(weekStart, 6);
        let sumSeconds = 0;
        for (let i = 0; i < 7; i++) {
          const iso = toIso(addDays(weekStart, i));
          const p = byIso.get(iso);
          sumSeconds += Number(p?.study_time ?? 0) || 0;
        }
        labels.push(weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        hours.push(sumSeconds / 3600);
        tooltipMeta.push({ kind: "week", startIso: toIso(weekStart), endIso: toIso(weekEnd) });
      }
    } else {
      const endMonthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      endMonthStart.setHours(0, 0, 0, 0);
      const firstMonthStart = new Date(endMonthStart.getFullYear(), endMonthStart.getMonth() - 19, 1);
      firstMonthStart.setHours(0, 0, 0, 0);

      for (let m = 0; m < 20; m++) {
        const monthStart = new Date(firstMonthStart.getFullYear(), firstMonthStart.getMonth() + m, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        monthEnd.setHours(0, 0, 0, 0);

        let sumSeconds = 0;
        for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
          const iso = toIso(d);
          const p = byIso.get(iso);
          sumSeconds += Number(p?.study_time ?? 0) || 0;
        }

        const monthLabel =
          m === 0 || monthStart.getMonth() === 0
            ? monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
            : monthStart.toLocaleDateString("en-US", { month: "short" });

        labels.push(monthLabel);
        hours.push(sumSeconds / 3600);
        tooltipMeta.push({ kind: "month", startIso: toIso(monthStart), endIso: toIso(monthEnd) });
      }
    }

    const maxHours = hours.reduce((acc, v) => (Number.isFinite(v) && v > acc ? v : acc), 0);
    const baseTotalHours = getBaseTotalHours(timeRange, anchor);
    const yTotalHours = Math.max(baseTotalHours, maxHours, targetHours ?? 0);

    const datasets: any[] = [
      {
        label: "Study Hours",
        data: hours,
        borderColor: (ctx: any) => {
          const chart = ctx.chart;
          const area = chart?.chartArea;
          if (!area) return "#0066CC";
          const g = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
          g.addColorStop(0, "#60A5FA");
          g.addColorStop(0.5, "#2563EB");
          g.addColorStop(1, "#0B4EA2");
          return g;
        },
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart;
          const area = chart?.chartArea;
          if (!area) return "rgba(0, 102, 204, 0.10)";
          const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, "rgba(96, 165, 250, 0.18)");
          g.addColorStop(1, "rgba(11, 78, 162, 0.02)");
          return g;
        },
        fill: true,
        cubicInterpolationMode: timeRange === "daily" ? "default" : "monotone",
        tension: timeRange === "daily" ? 0.35 : 0.15,
        borderWidth: 3.5,
        pointRadius: timeRange === "monthly" ? 0 : 3.5,
        pointHoverRadius: 7,
        pointHitRadius: 18,
        pointBackgroundColor: (ctx: any) => BLUE_DAY_SHADES[(ctx.dataIndex ?? 0) % BLUE_DAY_SHADES.length],
        pointHoverBackgroundColor: (ctx: any) => BLUE_DAY_SHADES[(ctx.dataIndex ?? 0) % BLUE_DAY_SHADES.length],
        pointBorderColor: "rgba(17, 24, 39, 0.92)",
        pointHoverBorderColor: "rgba(17, 24, 39, 0.92)",
        pointBorderWidth: 2,
      },
    ];

    if (targetHours != null) {
      datasets.push({
        label: "Target",
        data: hours.map(() => targetHours),
        borderColor: "rgba(147, 197, 253, 0.95)",
        backgroundColor: "transparent",
        borderWidth: 2,
        borderDash: [6, 6],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
      });
    }

    return {
      trendLineTooltipMeta: tooltipMeta,
      yTotalHours,
      yMaxDataHours: maxHours,
      trendLineData: {
        labels,
        datasets,
      },
    };
  }, [trends, calendarAnchor, activeSecondsToday, totalDurationToday, timeRange]);

  const viewportHours = timeRange === "weekly" ? 28 : timeRange === "monthly" ? 120 : DISPLAY_CAP_HOURS;
  const maxScrollHours = Math.max(0, yTotalHours - viewportHours);
  const yMin = clamp(yScrollByRange[timeRange] || 0, 0, maxScrollHours);
  const yMax = yMin + viewportHours;
  const showScrollUI = maxScrollHours > 0;

  useEffect(() => {
    if (!Number.isFinite(maxScrollHours)) return;
    setYScrollByRange((prev) => {
      const current = prev[timeRange] || 0;
      const next = clamp(current, 0, maxScrollHours);
      if (next === current) return prev;
      return { ...prev, [timeRange]: next };
    });
  }, [maxScrollHours, timeRange]);

  useEffect(() => {
    if (!showScrollUI) return;
    if (timeRange === "weekly") return;
    setYScrollByRange((prev) => {
      const current = prev[timeRange] || 0;
      if (current !== 0) return prev;
      if (!(yMaxDataHours > viewportHours)) return prev;
      const next = clamp(yMaxDataHours - viewportHours, 0, maxScrollHours);
      if (next === current) return prev;
      return { ...prev, [timeRange]: next };
    });
  }, [showScrollUI, timeRange, yMaxDataHours, viewportHours, maxScrollHours]);

  const applyScrollDelta = (deltaHours: number) => {
    if (!showScrollUI) return;
    setYScrollByRange((prev) => {
      const current = prev[timeRange] || 0;
      const next = clamp(current + deltaHours, 0, maxScrollHours);
      if (next === current) return prev;
      return { ...prev, [timeRange]: next };
    });
  };

  const dragRef = React.useRef<{ active: boolean; startY: number; startOffset: number }>({
    active: false,
    startY: 0,
    startOffset: 0,
  });

  const scrollbarDragRef = React.useRef<{ active: boolean }>({ active: false });

  const setScrollFromTrackPointer = (clientY: number, trackRect: DOMRect) => {
    if (!showScrollUI) return;
    const rel = clamp((clientY - trackRect.top) / Math.max(1, trackRect.height), 0, 1);
    const next = rel * (yTotalHours - viewportHours);
    setYScrollByRange((prev) => ({ ...prev, [timeRange]: clamp(next, 0, maxScrollHours) }));
  };

  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 14, bottom: 12 } },
      interaction: {
        mode: "index",
        intersect: false,
      },
      animation: {
        duration: 250,
        easing: "easeOutQuart" as any,
      },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          titleColor: "#f9fafb",
          bodyColor: "#f9fafb",
          borderColor: "rgba(59, 130, 246, 0.45)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              const meta = trendLineTooltipMeta[idx];
              if (!meta?.startIso) return items?.[0]?.label ?? "";
              if (meta.kind === "week" && meta.endIso) {
                const start = parseLocal(meta.startIso);
                const end = parseLocal(meta.endIso);
                const startTxt = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const endTxt = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return `${startTxt} – ${endTxt}`;
              }
              if (meta.kind === "month") {
                const start = parseLocal(meta.startIso);
                return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              }
              const date = parseLocal(meta.startIso);
              return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            },
            label: (context) => `${(Number(context.parsed.y) || 0).toFixed(1)} hrs`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: {
            color: (ctx: any) => BLUE_DAY_SHADES[(ctx.index ?? 0) % BLUE_DAY_SHADES.length],
            font: { family: "Inter", weight: "bold", size: 11 },
            padding: 10,
            maxRotation: 0,
          },
          border: { display: false },
        },
        y: {
          display: true,
          min: yMin,
          max: yMax,
          suggestedMax: yMax,
          ticks: {
            color: "var(--text-secondary, #6b7280)",
            padding: 8,
            stepSize: timeRange === "weekly" ? 4 : timeRange === "monthly" ? 10 : 2,
            callback: (v: any) => `${Number(v).toFixed(0)}h`,
          },
          grid: {
            color: "rgba(59, 130, 246, 0.10)",
            drawBorder: false,
          },
          border: { display: false },
        },
      },
      elements: {
        line: {
          capBezierPoints: true,
        },
      },
    }),
    [trendLineTooltipMeta, yMin, yMax, timeRange]
  );

  // Use dailyStreakDisplayCount (from ActivityContext) as the primary source of truth
  // to ensure consistency with the main page and avoid potential backend data issues.
  const longestStreakValue = dailyStreakDisplayCount;

  const streakConfetti = useMemo(() => {
    const palette = ["#F97316", "#F59E0B", "#A855F7", "#3B82F6", "#60A5FA", "#EC4899"];
    const count = 26;
    let seed = (streakCelebrationSeed + 1) * 1103515245;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    return Array.from({ length: count }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const dist = 62 + rand() * 72;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist - (24 + rand() * 18);
      const rotate = (rand() * 360 - 180) * 1.4;
      const size = 6 + rand() * 6;
      const delay = rand() * 0.08;
      const color = palette[i % palette.length];
      return { id: i, x, y, rotate, size, delay, color };
    });
  }, [streakCelebrationSeed]);



  const thirtyDaysData: DayProgress[] = React.useMemo(() => {
    const days: DayProgress[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const activeDates = new Set(
      (streaks?.history || [])
        .filter(h => h.count > 0)
        .map(h => h.date)
    );

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localYmd(d);
      
      let status: 'completed' | 'missed' | 'upcoming' | 'today' = 'missed';
      if (i === 0) {
        status = 'today';
      } else if (activeDates.has(dateStr)) {
        status = 'completed';
      }
      
      days.push({
        day: 30 - i,
        date: d,
        status,
        label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).replace(',', '')
      });
    }
    return days;
  }, [streaks]);

  const thirtyDaySuccessRate = React.useMemo(() => {
    const passedDays = thirtyDaysData.filter(d => d.status !== 'upcoming');
    const completedCount = thirtyDaysData.filter(d => d.status === 'completed').length;
    if (passedDays.length === 0) return 0;
    return Math.round((completedCount / passedDays.length) * 100);
  }, [thirtyDaysData]);

  return (
    <AppShell title="Analytics Dashboard">
      <AnimatePresence>
        {timeDetailsOpen ? (
          <motion.div
            key="time-details-overlay"
            id="time-details-dialog"
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close time details"
              className="absolute inset-0 bg-black/60"
              onClick={() => setTimeDetailsOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-blue-500/20 bg-[var(--bg-surface)] shadow-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 60%), radial-gradient(circle at bottom right, rgba(37, 99, 235, 0.14), transparent 55%)",
                }}
              />
              <div className="relative flex items-center justify-between border-b border-blue-500/15 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">Time Details</div>
                  <div className="text-xs text-[var(--text-secondary)]">Today’s study time breakdown</div>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/15 bg-blue-500/10 text-[var(--text-primary)] hover:bg-blue-500/15"
                  onClick={() => setTimeDetailsOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="relative p-5">
                <div className="grid gap-3">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.22, ease: "easeOut" }}
                    className="rounded-xl border border-blue-500/15 bg-blue-500/10 p-4"
                  >
                    <div className="text-xs font-semibold text-blue-200">Active Session</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--text-primary)] tabular-nums font-mono">
                      {formatDurationFixed(activeSecondsToday)}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.22, ease: "easeOut" }}
                    className="rounded-xl border border-blue-500/15 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),rgba(59,130,246,0.00))] p-4"
                  >
                    <div className="text-xs font-semibold text-blue-200">Tracked Today</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--text-primary)] tabular-nums font-mono">
                      {formatDurationFixed(totalDurationToday)}
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
        {streakCongratsOpen ? (
          <motion.div
            key="streak-congrats-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close streak congratulations"
              className="absolute inset-0 bg-black/60"
              onClick={() => setStreakCongratsOpen(false)}
            />
            <motion.div
              id="streak-congrats-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="streak-congrats-title"
              aria-describedby="streak-congrats-desc"
              className="relative w-[min(920px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-blue-500/20 bg-[var(--bg-surface)] shadow-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.22), transparent 50%), radial-gradient(circle at 90% 25%, rgba(99, 102, 241, 0.18), transparent 55%), radial-gradient(circle at 50% 120%, rgba(59, 130, 246, 0.16), transparent 60%)",
                }}
              />

              {[
                { left: "10%", top: "14%", size: 10, color: "bg-blue-400/70", delay: 0.0 },
                { left: "22%", top: "8%", size: 8, color: "bg-indigo-400/70", delay: 0.15 },
                { left: "34%", top: "18%", size: 6, color: "bg-purple-400/70", delay: 0.25 },
                { left: "46%", top: "10%", size: 10, color: "bg-blue-300/70", delay: 0.05 },
                { left: "58%", top: "16%", size: 7, color: "bg-indigo-300/70", delay: 0.2 },
                { left: "70%", top: "7%", size: 9, color: "bg-purple-300/70", delay: 0.1 },
                { left: "82%", top: "15%", size: 7, color: "bg-blue-400/70", delay: 0.3 },
                { left: "90%", top: "9%", size: 8, color: "bg-indigo-400/70", delay: 0.18 },
              ].map((p, idx) => (
                <motion.span
                  key={idx}
                  aria-hidden="true"
                  className={`pointer-events-none absolute rounded-sm ${p.color}`}
                  style={{
                    left: p.left,
                    top: p.top,
                    width: p.size,
                    height: p.size,
                  }}
                  initial={{ opacity: 0, y: -12, rotate: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [0, 8, 22, 34], rotate: [0, 25, 60] }}
                  transition={{ duration: 2.2, delay: p.delay, repeat: Infinity, ease: "easeOut" }}
                />
              ))}

              <div className="relative flex items-center justify-between border-b border-blue-500/15 px-5 py-4">
                <div>
                  <div id="streak-congrats-title" className="text-sm font-semibold text-[var(--text-primary)]">
                    Congratulations
                  </div>
                  <div id="streak-congrats-desc" className="text-xs text-[var(--text-secondary)]">
                    {streakCelebrationStage >= 3
                      ? `Your streak is ${longestStreakValue} days. Keep the fire going.`
                      : "Celebrating your streak. Keep the fire going."}
                  </div>
                </div>
                <button
                  ref={streakCongratsCloseRef}
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/15 bg-blue-500/10 text-[var(--text-primary)] hover:bg-blue-500/15"
                  onClick={() => setStreakCongratsOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="relative max-h-[calc(100vh-2rem-64px)] overflow-y-auto p-5">
                <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                  <div className="rounded-2xl border border-blue-500/15 bg-blue-500/10 p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">Current Streak</div>
                      <div className="rounded-full border border-blue-500/20 bg-[var(--bg-surface)] px-2 py-1 text-xs text-blue-300">
                        Keep going!
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-center">
                      <div className="relative flex h-28 w-28 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-blue-500/15" />
                        <div className="absolute inset-2 rounded-full bg-blue-500/10" />
                        <motion.div
                          className="absolute inset-0"
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <div className="h-full w-full rounded-full border border-blue-500/20" />
                        </motion.div>
                        <AnimatePresence mode="wait" initial={false}>
                          {streakCelebrationStage < 2 ? (
                            <motion.div
                              key={`popper-${streakCelebrationSeed}`}
                              initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="relative z-10"
                              aria-hidden="true"
                            >
                              <PartyPopper className="text-orange-300" size={40} />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="flame"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="relative z-10"
                              aria-hidden="true"
                            >
                              <Flame className="text-orange-400" size={38} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {streakCelebrationStage >= 1 ? (
                            <motion.div
                              key={`burst-${streakCelebrationSeed}`}
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 z-20"
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.18 }}
                            >
                              {streakConfetti.map((p) => (
                                <motion.span
                                  key={p.id}
                                  className="absolute left-1/2 top-1/2 rounded-sm"
                                  style={{
                                    width: p.size,
                                    height: p.size,
                                    backgroundColor: p.color,
                                  }}
                                  initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
                                  animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], rotate: p.rotate, scale: [0.4, 1, 0.9] }}
                                  transition={{ duration: 1.05, delay: p.delay, ease: "easeOut" }}
                                />
                              ))}

                              {[
                                { x: -52, y: -28, color: "text-purple-300", delay: 0.02, rot: -10 },
                                { x: 52, y: -22, color: "text-blue-300", delay: 0.05, rot: 8 },
                                { x: -32, y: 34, color: "text-yellow-300", delay: 0.08, rot: -6 },
                                { x: 34, y: 38, color: "text-orange-300", delay: 0.1, rot: 10 },
                              ].map((s, idx) => (
                                <motion.div
                                  key={idx}
                                  className={`absolute left-1/2 top-1/2 ${s.color}`}
                                  style={{ translateX: s.x, translateY: s.y }}
                                  initial={{ opacity: 0, scale: 0.6, rotate: s.rot }}
                                  animate={{ opacity: [0, 1, 0], scale: [0.6, 1.05, 0.9], rotate: [s.rot, s.rot + 12, s.rot + 18] }}
                                  transition={{ duration: 0.95, delay: s.delay, ease: "easeOut" }}
                                >
                                  <Sparkles size={18} />
                                </motion.div>
                              ))}

                              {[
                                { x: -10, y: -54, color: "text-blue-200", delay: 0.06, rot: -18 },
                                { x: 10, y: -54, color: "text-purple-200", delay: 0.09, rot: 18 },
                              ].map((z, idx) => (
                                <motion.div
                                  key={`zap-${idx}`}
                                  className={`absolute left-1/2 top-1/2 ${z.color}`}
                                  style={{ translateX: z.x, translateY: z.y }}
                                  initial={{ opacity: 0, scale: 0.6, rotate: z.rot }}
                                  animate={{ opacity: [0, 1, 0], scale: [0.6, 1.1, 0.9], rotate: [z.rot, z.rot + 22, z.rot + 32] }}
                                  transition={{ duration: 0.85, delay: z.delay, ease: "easeOut" }}
                                >
                                  <Zap size={16} />
                                </motion.div>
                              ))}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mt-4 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <AnimatePresence mode="wait" initial={false}>
                          {streakCelebrationStage >= 2 ? (
                            <motion.div
                              key={`num-${streakCelebrationSeed}-${longestStreakValue}`}
                              data-testid="streak-animated-number"
                              initial={{ opacity: 0, scale: 0.2, y: 10, filter: "blur(8px)" }}
                              animate={{
                                opacity: 1,
                                scale: [0.2, 1.22, 1],
                                y: [10, -6, 0],
                                filter: ["blur(8px)", "blur(0px)", "blur(0px)"],
                              }}
                              transition={{ duration: 0.7, ease: "easeOut", times: [0, 0.65, 1] }}
                              className="text-5xl font-bold text-[var(--text-primary)] tabular-nums"
                            >
                              {longestStreakValue}
                            </motion.div>
                          ) : (
                            <motion.div key="placeholder" className="h-[60px]" initial={{ opacity: 0 }} animate={{ opacity: 0 }} />
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {streakCelebrationStage >= 3 ? (
                            <motion.div
                              key="days"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="text-sm text-[var(--text-secondary)]"
                            >
                              days
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-blue-500/15 bg-[var(--bg-surface)] p-3">
                        <div className="text-[11px] font-semibold text-blue-300">Current</div>
                        <div className="mt-1 text-xl font-bold text-[var(--text-primary)] tabular-nums">
                          {dailyStreakDisplayCount}
                          <span className="ml-1 text-xs font-medium text-[var(--text-secondary)]">days</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-500/15 bg-[var(--bg-surface)] p-3">
                        <div className="text-[11px] font-semibold text-blue-300">Next Milestone</div>
                        {(() => {
                          const current = dailyStreakDisplayCount;
                          const milestones = [7, 30, 50, 100, 365];
                          const next = milestones.find((m) => m > current) || current + 10;
                          const progress = Math.min(100, (current / next) * 100);
                          return (
                            <>
                              <div className="mt-1 text-xl font-bold text-[var(--text-primary)] tabular-nums">
                                {next}
                                <span className="ml-1 text-xs font-medium text-[var(--text-secondary)]">days</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20">
                                <div
                                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.9),rgba(99,102,241,0.9))] transition-all duration-700"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{Math.round(progress)}% to goal</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:bg-blue-500 active:scale-[0.99]"
                      onClick={() => setStreakCongratsOpen(false)}
                    >
                      Continue Learning
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">Streak Details</div>
                      <div className="text-xs text-[var(--text-secondary)]">Last 7 days</div>
                    </div>
                    <div className="mt-4">
                      <WeeklyStreakViz
                        trends={trends}
                        overallCurrent={dailyStreakDisplayCount}
                        overallLongest={streakCelebrationStage >= 3 ? longestStreakValue : 0}
                        config={{
                          goalDays: 7,
                          activeGradient: ["#3B82F6", "#6366F1"],
                        }}
                        activeSecondsToday={activeSecondsToday}
                        totalDurationToday={totalDurationToday}
                      />
                    </div>
                    <div className="mt-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">Activity timeline</div>
                        <div className="text-xs text-[var(--text-secondary)]">Most recent</div>
                      </div>
                      <div className="mt-3 space-y-3">
                        {activityTimelineLoading ? (
                          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-4 text-sm text-[var(--text-secondary)]">
                            Loading activity…
                          </div>
                        ) : activityTimelineError ? (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-200">
                            {activityTimelineError}
                          </div>
                        ) : activityTimeline.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-4 text-sm text-[var(--text-secondary)]">
                            No recent activity found. Study flashcards, upload a document, or take a quiz to populate your timeline.
                          </div>
                        ) : (
                          activityTimeline.map((item) => {
                            const dt = new Date(item.occurred_at);
                            const timeLabel = isValidDate(dt)
                              ? dt.toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : item.occurred_at;
                            const kind = String(item.kind || "");
                            const meta: any = item.meta || {};
                            const durationSeconds = Math.max(0, Number(meta.active_seconds ?? meta.duration_seconds ?? 0) || 0);
                            const quizScore =
                              meta.score != null && meta.total != null ? `${meta.score}/${meta.total}` : null;
                            const Icon =
                              kind === "document_upload"
                                ? Download
                                : kind === "quiz_attempt"
                                  ? Check
                                  : kind === "flashcard_review"
                                    ? Zap
                                  : kind === "class_created"
                                    ? Sparkles
                                    : Activity;
                            const rightLabel =
                              kind === "study_session"
                                ? formatDuration(durationSeconds)
                                : kind === "flashcard_review" && meta.rating
                                  ? String(meta.rating)
                                : kind === "quiz_attempt" && quizScore
                                  ? quizScore
                                  : null;
                            const subtitleParts = [item.detail, item.class_name].filter(Boolean);
                            const subtitle =
                              subtitleParts.length === 2 && subtitleParts[0] === subtitleParts[1]
                                ? String(subtitleParts[0])
                                : subtitleParts.join(" • ");
                            return (
                              <div
                                key={`${kind}-${item.id}`}
                                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--primary)]">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-[var(--text-primary)]">{item.title}</div>
                                    {subtitle ? (
                                      <div className="text-xs text-[var(--text-secondary)]">{subtitle}</div>
                                    ) : null}
                                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{timeLabel}</div>
                                  </div>
                                </div>
                                <div className="shrink-0 text-xs text-[var(--text-secondary)] tabular-nums">
                                  {rightLabel}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Analytics Dashboard</h1>
            <p className="text-[var(--text-secondary)] mt-1">Track your progress and study habits</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Activity Status Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isIdle 
                ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            }`}>
                <div className={`w-2 h-2 rounded-full ${
                    isIdle 
                    ? 'bg-gray-400'
                    : 'bg-emerald-500 animate-pulse'
                }`} />
                {isIdle ? 'Idle' : 'Active'}
            </div>

            {/* Connection Status Badge */}
            {(!isOnline || isSyncing || sseStatus !== 'connected') && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !isOnline 
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : isSyncing
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            }`}>
               <div className={`w-2 h-2 rounded-full ${
                 !isOnline 
                   ? 'bg-red-500'
                   : isSyncing
                     ? 'bg-blue-500 animate-ping'
                     : 'bg-yellow-500 animate-pulse'
               }`} />
               {!isOnline ? 'Offline' : isSyncing ? 'Syncing...' : 'Connecting...'}
            </div>
            )}

            <div className="relative" ref={calendarPopoverRef}>
              <button
                type="button"
                onClick={() => {
                  setStreakCongratsOpen(false);
                  setTimeDetailsOpen(false);
                  setCalendarOpen((v) => !v);
                }}
                aria-label="Open calendar"
                aria-expanded={calendarOpen}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm font-medium hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-primary)]"
              >
                <Calendar size={18} />
                <span className="tabular-nums">
                  {new Date(calendarAnchor).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </button>

              <AnimatePresence>
                {calendarOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-12 z-30 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow)]"
                    role="region"
                    aria-label="Calendar"
                  >
                    <DualViewCalendar
                      value={calendarAnchor}
                      view={calendarView}
                      onViewChange={setCalendarView}
                      onChange={(next) => {
                        const normalized = new Date(next);
                        if (!isValidDate(normalized)) return;
                        normalized.setHours(0, 0, 0, 0);
                        setCalendarAnchor(normalized);
                        setCalendarUserSelected(true);
                        setCalendarOpen(false);
                      }}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            
            <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm font-medium hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-primary)]"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && !overview ? (
            <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
            </div>
        ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle size={20} />
                {error}
            </div>
        ) : (
            <>
                {/* Top Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                   <LongestStreakCard
                        streak={dailyStreakDisplayCount}
                        ariaControls="streak-congrats-dialog"
                        ariaExpanded={streakCongratsOpen}
                        onClick={() => {
                          setTimeDetailsOpen(false);
                          setThirtyDayOpen(false);
                          setStreakCongratsOpen(true);
                        }}
                   />
                   <StatCard 
                        title="Time Spent Today" 
                        value={formatDurationFixed(activeSecondsToday)} 
                        subtext="Active Session" 
                        icon={Clock} 
                        colorClass="text-emerald-500" 
                        ariaControls="time-details-dialog"
                        ariaExpanded={timeDetailsOpen}
                        onClick={() => {
                          setStreakCongratsOpen(false);
                          setThirtyDayOpen(false);
                          setTimeDetailsOpen(true);
                        }}
                   />
                   <StatCard 
                        title="30-Day Success" 
                        value={`${thirtyDaySuccessRate}%`} 
                        subtext="Consistency" 
                        icon={Activity} 
                        colorClass="text-blue-500" 
                        ariaControls="thirty-day-progress-section"
                        ariaExpanded={thirtyDayOpen}
                        onClick={() => {
                          setStreakCongratsOpen(false);
                          setTimeDetailsOpen(false);
                          setThirtyDayOpen((prev) => !prev);
                        }}
                   />
                </div>

                {/* 30-Day Progress Collapsible Section */}
                <div className="w-full mt-8">
                  <ThirtyDayProgress 
                    days={thirtyDaysData} 
                    thirtyDayOpen={thirtyDayOpen}
                    onToggle={() => {
                      setStreakCongratsOpen(false);
                      setTimeDetailsOpen(false);
                      setThirtyDayOpen((prev) => !prev);
                    }}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" 
                  />
                </div>

                {/* Charts Row */}
                <div className="w-full mt-8">
                   {/* Main Chart */}
                   <motion.div
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.35 }}
                     className="bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border-subtle)] p-6"
                   >
                       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                         <div>
                           <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                             {timeRange === 'daily' ? 'Daily' : timeRange === 'weekly' ? 'Weekly' : 'Monthly'} Study Trend
                           </h2>
                          <p className="text-sm text-[var(--text-secondary)] mt-1">
                            {timeRange === "daily" ? "Hours per day" : timeRange === "weekly" ? "Hours per week" : "Hours per month"}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">
                              <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" />
                              Study hours
                            </div>
                            {timeRange !== "daily" ? (
                              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/15 bg-blue-500/5 px-3 py-1 text-xs font-semibold text-[#93C5FD]">
                                <span className="inline-block h-[2px] w-4 rounded bg-[#93C5FD]" style={{ backgroundImage: "linear-gradient(90deg, #93C5FD 0 60%, transparent 60% 100%)", backgroundSize: "10px 2px" }} />
                                Target {timeRange === "weekly" ? "5h/week" : "10h/month"}
                              </div>
                            ) : null}
                            {showScrollUI ? (
                              <div className="inline-flex items-center gap-2 rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-xs font-semibold text-slate-200">
                                <span className="tabular-nums font-mono">{Math.round(yMin)}–{Math.round(yMax)}h</span>
                                <span className="text-slate-300/80">of</span>
                                <span className="tabular-nums font-mono">{Math.round(yTotalHours)}h</span>
                                <span className="text-slate-300/80">remaining</span>
                                <span className="tabular-nums font-mono">{Math.max(0, Math.round(yTotalHours - yMax))}h</span>
                              </div>
                            ) : null}
                          </div>
                         </div>
                         <div className="flex bg-[var(--bg-subtle)] p-1 rounded-lg self-start sm:self-auto">
                           {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                             <button 
                                key={r} 
                                onClick={() => setTimeRange(r)} 
                                aria-pressed={timeRange === r}
                                className={`px-3 py-1 rounded-md text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 ${timeRange === r ? 'bg-blue-500/10 shadow-sm text-[#60A5FA] border border-blue-500/20' : 'text-[var(--text-secondary)] hover:text-[#93C5FD]'}`}
                             >
                               {r.charAt(0).toUpperCase() + r.slice(1)}
                             </button>
                           ))}
                         </div>
                       </div>
                       <div className="mt-4 rounded-xl border border-blue-500/10 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),rgba(59,130,246,0.00))] p-4">
                         <div
                           className="h-64 w-full relative"
                           data-testid="trend-chart-scroll"
                           onWheel={(e) => {
                             if (!showScrollUI) return;
                             e.preventDefault();
                             applyScrollDelta((e.deltaY || 0) / 90);
                           }}
                           onPointerDown={(e) => {
                             if (!showScrollUI) return;
                             (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                             dragRef.current.active = true;
                             dragRef.current.startY = e.clientY;
                             dragRef.current.startOffset = yMin;
                           }}
                           onPointerMove={(e) => {
                             if (!showScrollUI) return;
                             if (!dragRef.current.active) return;
                             const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                             const hoursPerPx = viewportHours / Math.max(1, rect.height);
                             const dy = e.clientY - dragRef.current.startY;
                             const next = dragRef.current.startOffset + (-dy * hoursPerPx);
                             setYScrollByRange((prev) => ({ ...prev, [timeRange]: clamp(next, 0, maxScrollHours) }));
                           }}
                           onPointerUp={(e) => {
                             if (!showScrollUI) return;
                             dragRef.current.active = false;
                             (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
                           }}
                           onPointerCancel={() => {
                             dragRef.current.active = false;
                           }}
                           style={{ touchAction: "none" }}
                         >
                           <Line data={trendLineData as any} options={chartOptions as any} />
                           {showScrollUI ? (
                             <div
                               className="absolute right-2 top-2 bottom-2 w-2 rounded-full bg-white/5 border border-white/10"
                               data-testid="trend-chart-scrollbar"
                               onPointerDown={(e) => {
                                 e.stopPropagation();
                                 if (!showScrollUI) return;
                                 (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                                 scrollbarDragRef.current.active = true;
                                 setScrollFromTrackPointer(e.clientY, (e.currentTarget as HTMLDivElement).getBoundingClientRect());
                               }}
                               onPointerMove={(e) => {
                                 e.stopPropagation();
                                 if (!showScrollUI) return;
                                 if (!scrollbarDragRef.current.active) return;
                                 setScrollFromTrackPointer(e.clientY, (e.currentTarget as HTMLDivElement).getBoundingClientRect());
                               }}
                               onPointerUp={(e) => {
                                 e.stopPropagation();
                                 scrollbarDragRef.current.active = false;
                                 (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
                               }}
                               onPointerCancel={() => {
                                 scrollbarDragRef.current.active = false;
                               }}
                             >
                               <div
                                 className="absolute left-0 right-0 rounded-full bg-slate-200/50"
                                 style={{
                                   height: `${Math.max(10, (viewportHours / yTotalHours) * 100)}%`,
                                   top: `${(yMin / Math.max(1e-6, yTotalHours - viewportHours)) * (100 - Math.max(10, (viewportHours / yTotalHours) * 100))}%`,
                                 }}
                               />
                             </div>
                           ) : null}
                           {showScrollUI ? (
                             <>
                               <div className="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-[linear-gradient(180deg,rgba(11,78,162,0.18),rgba(11,78,162,0.00))]" style={{ opacity: yMin > 0 ? 1 : 0 }} />
                               <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-6 bg-[linear-gradient(0deg,rgba(11,78,162,0.18),rgba(11,78,162,0.00))]" style={{ opacity: yMin < maxScrollHours ? 1 : 0 }} />
                             </>
                           ) : null}
                         </div>
                       </div>

                       {/* Footer Stats */}
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[var(--border-subtle)]">
                         <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3">
                           <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold">Current Streak</p>
                           <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">
                             {dailyStreakDisplayCount} <span className="text-sm font-normal text-[var(--text-secondary)]">days</span>
                           </p>
                         </div>
                         <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3">
                           <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold">Avg Session</p>
                           <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">
                             {Math.round((timeRange === 'daily' ? (sessionOverview?.avg_seconds_7d || 0) : timeRange === 'weekly' ? (sessionOverview?.avg_seconds_30d || 0) : (sessionOverview?.avg_seconds_all || 0)) / 60)} <span className="text-sm font-normal text-[var(--text-secondary)]">min</span>
                           </p>
                         </div>
                       </div>
                   </motion.div>

                </div>


            </>
        )}
      </div>
    </AppShell>
  );
}
