import { useMemo, useState } from "react";
import { format, subDays, eachDayOfInterval, startOfYear, endOfYear, getDay } from "date-fns";
import { QuizAnalyticsSummary, QuizDailyStreakItem } from "../lib/api";

type ActivityHeatmapProps = {
  summary: QuizAnalyticsSummary;
import { QuizDailyStreakItem, QuizHistoryItem } from "../lib/api";

type ActivityHeatmapProps = {
  history: QuizHistoryItem[];
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
export default function ActivityHeatmap({ history, streakDays }: ActivityHeatmapProps) {
  const [selectedYear, setSelectedYear] = useState(Number(karachiDayKey(new Date()).slice(0, 4)));

  // Bubble color source of truth: persisted daily streak records.
  const activityMap = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const day of streakDays) {
      if (day.status === "passed" || day.status === "failed") {
        map.set(day.local_date, day.status);
      }
    }
    return map;
  }, [streakDays]);

  // 2. Calculate stats
  const stats = useMemo(() => {
    const totalAttempts = summary.total_attempts;
    const passed = summary.passed_attempts;
    const failed = summary.failed_attempts;
    const totalAttempts = history.length;
    const passed = history.filter(h => h.passed).length;
    const failed = totalAttempts - passed;

    // Consecutive days streak
    // Check backwards from today (or last active day)
    // We want current streak. If today has activity, include it. If not, check yesterday.
    // Actually, usually streak means "up to today". If you missed yesterday, streak is 0.
    // Let's implement "Current Streak" logic strictly.
    
    const today = new Date();
    let streak = 0;
    let checkDate = today;
    
    // Karachi-local "today" check for streak continuity
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

  // 3. Generate grid for selected year
  const grid = useMemo(() => {
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const end = endOfYear(new Date(selectedYear, 0, 1));
    const days = eachDayOfInterval({ start, end });

    // We need to arrange in columns (weeks) x rows (days 0-6 Sun-Sat)
    // Actually standard contribution graph is usually columns=weeks, rows=days
    
    // Group by weeks
    const weeks: Array<Array<Date | null>> = [];
    let currentWeek: Array<Date | null> = [];
    
    // Pad first week if year doesn't start on Sunday
    const firstDayOfWeek = getDay(start); // 0 = Sun
    for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push(null); // Spacer
    }

    days.forEach(day => {
        currentWeek.push(day);
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });
    
    // Push last week
    if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
            currentWeek.push(null);
        }
        weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedYear]);

  // Transpose for rendering: we want 7 rows (Sun-Sat), N columns
  const rows = [0, 1, 2, 3, 4, 5, 6]; 

  // Available years from data + current year
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
      {/* Header & Year Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-main">Quiz Activity</h3>
        <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-sm bg-transparent border border-token rounded-md px-2 py-1 text-main outline-none focus:border-primary"
        >
            {years.map(y => (
                <option key={y} value={y}>{y}</option>
            ))}
        </select>
      </div>

      {/* Heatmap Grid */}
      <div className="w-full overflow-x-auto pb-2">
        <div className="min-w-max flex flex-col gap-[2px]">
            {/* Month Labels */}
            {/* Month Labels */}
            <div className="flex gap-[2px] mb-1 ml-8">
              {grid.map((week, wIndex) => {
                const firstDay = week.find(d => d !== null);
                if (!firstDay) return <div key={wIndex} className="w-4" />;

                const month = firstDay.getMonth();

                const prevWeek = grid[wIndex - 1];
                const prevDay = prevWeek ? prevWeek.find(d => d !== null) : null;

                const showMonth =
                  wIndex === 0 || (prevDay && prevDay.getMonth() !== month);

                return (
                  <div key={wIndex} className="w-4 text-[10px] text-muted text-center">
                    {showMonth ? format(firstDay, "MMM") : ""}
                  </div>
                );
              })}
            </div>
            {rows.map(dayIndex => (
                <div key={dayIndex} className="flex gap-[2px]">
                    {/* Day Label (optional, maybe just for Mon/Wed/Fri) */}
                    <div className="w-8 text-[10px] text-muted flex items-center">
                        {dayIndex === 1 ? "Mon" : dayIndex === 3 ? "Wed" : dayIndex === 5 ? "Fri" : ""}
                    </div>
                    {grid.map((week, wIndex) => {
                        const day = week[dayIndex];
                        if (!day) return <div key={wIndex} className="w-4 h-4 border border-gray-400 bg-transparent rounded-sm" />;                        
                        const dateKey = format(day, "yyyy-MM-dd");
                        const status = activityMap.get(dateKey) || "none";
                        
                        let colorClass = "bg-surface-hover"; // none
                        if (status === "passed") colorClass = "bg-green-500";
                        else if (status === "failed") colorClass = "bg-red-500";

                        const title = `${format(day, "MMM d, yyyy")}: ${status === 'none' ? 'No activity' : status === 'passed' ? 'Passed' : 'Failed'}`;

                        return (
                            <div 
                                key={dateKey} 
                                className={`w-4 h-4 border border-gray-300 rounded-sm ${colorClass} transition-colors hover:opacity-80 relative group`}
                                title={title}
                            >
                                {/* Tooltip using standard title for now, or custom absolute div if needed */}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-token pt-6">
         <div className="flex flex-col gap-1">
            <span className="text-xs text-muted uppercase tracking-wider">Total Attempted</span>
            <span className="text-xl font-bold text-main">{stats.totalAttempts}</span>
         </div>
         <div className="flex flex-col gap-1">
            <span className="text-xs text-muted uppercase tracking-wider">Passed</span>
            <span className="text-xl font-bold text-green-500">{stats.passed}</span>
         </div>
         <div className="flex flex-col gap-1">
            <span className="text-xs text-muted uppercase tracking-wider">Failed</span>
            <span className="text-xl font-bold text-red-500">{stats.failed}</span>
         </div>
         <div className="flex flex-col gap-1">
            <span className="text-xs text-muted uppercase tracking-wider">Current Streak</span>
            <span className="text-xl font-bold text-primary">{stats.streak} <span className="text-sm font-normal text-muted">days</span></span>
         </div>
      </div>
    </div>
  );
}
