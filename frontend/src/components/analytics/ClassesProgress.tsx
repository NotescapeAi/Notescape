import React from "react";
import { motion } from "framer-motion";
import { BookOpen, Clock, Trophy } from "lucide-react";
import { ClassProgress } from "../../lib/api";
import { formatDuration } from "../../lib/utils";

interface ClassesProgressProps {
  data: ClassProgress[];
  loading?: boolean;
}

const CircularProgress = ({
  percentage,
  size = 60,
  strokeWidth = 6,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  // Color based on percentage
  let colorClass = "text-emerald-500";
  if (percentage < 30) colorClass = "text-red-500";
  else if (percentage < 70) colorClass = "text-yellow-500";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-1000 ease-out ${colorClass}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-sm font-bold text-[var(--text-primary)]">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
};

export const ClassesProgress: React.FC<ClassesProgressProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-[var(--bg-subtle)] rounded-xl"></div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-4">
          <BookOpen size={24} />
        </div>
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No Classes Yet</h3>
        <p className="text-[var(--text-secondary)] mb-4">Start by creating a class and adding some flashcards to track your progress!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
          <Trophy size={20} className="text-yellow-500" />
          Flashcard Summary
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((item) => {
          const totalCount = Number(item.total_cards ?? 0) || 0;
          const masteredCount = Math.max(0, Math.min(totalCount, Number(item.reviewed_cards ?? 0) || 0));
          const remainingCount = Math.max(0, totalCount - masteredCount);
          const overallPercent = Number(item.reviewed_percentage ?? 0) || 0;

          return (
            <motion.div
              key={item.class_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-[var(--primary)] to-transparent opacity-5 rounded-full blur-2xl group-hover:opacity-10 transition-opacity"></div>

              <div className="flex justify-between items-start gap-4 mb-4 relative z-10">
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--text-primary)] text-lg line-clamp-1" title={item.class_name}>
                    {item.class_name}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] mt-1">
                    <Clock size={12} />
                    <span>{formatDuration(item.study_time_seconds)} studied</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CircularProgress percentage={overallPercent} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4 relative z-10">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Total
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">{totalCount}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Mastered
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">{masteredCount}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Remaining
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">{remainingCount}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
