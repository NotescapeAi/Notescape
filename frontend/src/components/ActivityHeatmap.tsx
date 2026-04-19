import { useMemo, useState } from "react";
import { eachDayOfInterval, endOfYear, format, getDay, startOfYear, subDays } from "date-fns";
import { QuizAnalyticsSummary, QuizDailyStreakItem } from "../lib/api";

type ActivityHeatmapProps = {
  summary: QuizAnalyticsSummary;
  streakDays: QuizDailyStreakItem[];
};

type DayStatus = "passed" | "failed" | "none";
const KARACHI_TZ = "Asia/Karachi";

function karachiDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KARACHI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export default function ActivityHeatmap({ summary, streakDays }: ActivityHeatmapProps) {
  const [selectedYear, setSelectedYear] = useState(Number(karachiDayKey(new Date()).slice(0, 4)));

  const activityMap = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const day of streakDays) {
      if (day.status === "passed" || day.status === "failed") {
        map.set(day.local_date, day.status);
      }
    }
    return map;
  }, [streakDays]);

  const stats = useMemo(() => {
    const totalAttempts = summary.total_attempts;
    const passed = summary.passed_attempts;
    const failed = summary.failed_attempts;

    const today = new Date();
    let streak = 0;
    let checkDate = today;
    const todayKey = karachiDayKey(today);

    if (!activityMap.has(todayKey)) {
      checkDate = subDays(today, 1);
    }

    while (true) {
      const key = karachiDayKey(checkDate);
      if (activityMap.has(key)) {
        streak++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }

    return { totalAttempts, passed, failed, streak };
  }, [summary, activityMap]);

  const grid = useMemo(() => {
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const end = endOfYear(new Date(selectedYear, 0, 1));
    const days = eachDayOfInterval({ start, end });

    const weeks: Array<Array<Date | null>> = [];
    let currentWeek: Array<Date | null> = [];
    const firstDayOfWeek = getDay(start);

    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }

    days.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedYear]);

  const rows = [0, 1, 2, 3, 4, 5, 6];

  const years = useMemo(() => {
    const yearsSet = new Set<number>([Number(karachiDayKey(new Date()).slice(0, 4))]);
    streakDays.forEach((d) => {
      const year = Number(d.local_date.slice(0, 4));
      if (!Number.isNaN(year)) yearsSet.add(year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [streakDays]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-main">Quiz Activity</h3>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="text-sm bg-transparent border border-token rounded-md px-2 py-1 text-main outline-none focus:border-primary"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full overflow-x-auto pb-2">
        <div className="min-w-max flex flex-col gap-[2px]">
          <div className="mb-1 ml-8 flex gap-[2px]">
            {grid.map((week, weekIndex) => {
              const firstDay = week.find((day) => day !== null);
              if (!firstDay) return <div key={weekIndex} className="w-4" />;

              const month = firstDay.getMonth();
              const prevWeek = grid[weekIndex - 1];
              const prevDay = prevWeek ? prevWeek.find((day) => day !== null) : null;
              const showMonth = weekIndex === 0 || (prevDay && prevDay.getMonth() !== month);

              return (
                <div key={weekIndex} className="w-4 text-center text-[10px] text-muted">
                  {showMonth ? format(firstDay, "MMM") : ""}
                </div>
              );
            })}
          </div>

          {rows.map((dayIndex) => (
            <div key={dayIndex} className="flex gap-[2px]">
              <div className="flex w-8 items-center text-[10px] text-muted">
                {dayIndex === 1 ? "Mon" : dayIndex === 3 ? "Wed" : dayIndex === 5 ? "Fri" : ""}
              </div>
              {grid.map((week) => {
                const day = week[dayIndex];
                if (!day) {
                  return <div key={`empty-${dayIndex}-${Math.random()}`} className="h-4 w-4 rounded-sm border border-gray-400 bg-transparent" />;
                }

                const dateKey = format(day, "yyyy-MM-dd");
                const status = activityMap.get(dateKey) || "none";
                const colorClass =
                  status === "passed" ? "bg-green-500" : status === "failed" ? "bg-red-500" : "bg-surface-hover";
                const title = `${format(day, "MMM d, yyyy")}: ${
                  status === "none" ? "No activity" : status === "passed" ? "Passed" : "Failed"
                }`;

                return (
                  <div
                    key={dateKey}
                    className={`relative h-4 w-4 rounded-sm border border-gray-300 ${colorClass} transition-colors hover:opacity-80`}
                    title={title}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-token pt-6 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted">Total Attempted</span>
          <span className="text-xl font-bold text-main">{stats.totalAttempts}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted">Passed</span>
          <span className="text-xl font-bold text-green-500">{stats.passed}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted">Failed</span>
          <span className="text-xl font-bold text-red-500">{stats.failed}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted">Current Streak</span>
          <span className="text-xl font-bold text-primary">
            {stats.streak} <span className="text-sm font-normal text-muted">days</span>
          </span>
        </div>
      </div>
    </div>
  );
}
