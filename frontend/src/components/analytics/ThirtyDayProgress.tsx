import React, { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X, Circle, Sparkles, Calendar } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export type DayStatus = 'completed' | 'missed' | 'upcoming' | 'today';

export interface DayProgress {
  day: number;
  date: Date;
  status: DayStatus;
  label?: string; // e.g., "Fri 20"
  details?: string;
}

export interface ThirtyDayProgressProps {
  days: DayProgress[];
  onDayClick?: (day: DayProgress) => void;
  isLoading?: boolean;
  className?: string;
  thirtyDayOpen?: boolean;
  onToggle?: () => void;
}

export const ThirtyDayProgress: React.FC<ThirtyDayProgressProps> = ({
  days,
  onDayClick,
  isLoading = false,
  className,
  thirtyDayOpen = false,
  onToggle
}) => {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Formatting date if label is missing
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  };

  // Scroll to "today" on initial load
  useEffect(() => {
    if (!isLoading && listRef.current && days.length > 0) {
      const todayIndex = days.findIndex(d => d.status === 'today');
      if (todayIndex !== -1) {
        const todayElement = listRef.current.children[todayIndex] as HTMLElement;
        if (todayElement) {
          todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [isLoading, days]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, day: DayProgress) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDay(day);
    }
  };

  const toggleDay = (day: DayProgress) => {
    setExpandedDay(prev => prev === day.day ? null : day.day);
    onDayClick?.(day);
  };

  if (isLoading) {
    return (
      <div className={cn("w-full py-8", className)} aria-busy="true" aria-label="Loading progress" role="progressbar">
        <div className="flex justify-between items-center mb-6 px-6 md:px-10">
          <div className="h-7 w-56 bg-slate-800/50 rounded-lg animate-pulse" />
        </div>
        <div className="flex flex-col gap-3 px-6 md:px-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-full h-20 bg-slate-800/30 rounded-xl animate-pulse border border-slate-700/30" />
          ))}
        </div>
      </div>
    );
  }

  // Calculate overall progress for visual flair
  const completedDays = days.filter(d => d.status === 'completed').length;
  const passedDays = days.filter(d => d.status !== 'upcoming').length;
  const completionRate = passedDays > 0 ? Math.round((completedDays / passedDays) * 100) : 0;

  return (
    <section 
      className={cn(
        "w-full py-8 relative overflow-hidden bg-gradient-to-b from-[#0B0F19] to-[#111827] text-slate-200 font-sans rounded-2xl",
        className
      )}
      aria-label="30-Day Progress Tracker"
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <button 
        onClick={onToggle}
        className="w-full relative flex flex-col md:flex-row justify-between items-start md:items-center px-6 md:px-10 py-2 gap-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-xl"
        aria-expanded={thirtyDayOpen}
        aria-controls="thirty-day-list"
      >
        <div className="text-left">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            30-Day Progress
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold tracking-wide">
              <Sparkles size={14} className="animate-pulse" />
              {completionRate}% Success
            </div>
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">Track your daily consistency and build lasting habits.</p>
        </div>
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/50 text-slate-400 shrink-0 transition-colors hover:bg-slate-700/50 hover:text-slate-200">
          <motion.div
            animate={{ rotate: thirtyDayOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <ChevronDown size={20} />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {thirtyDayOpen && (
          <motion.div
            id="thirty-day-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div 
              ref={listRef}
              className="relative flex flex-col gap-3 px-6 md:px-10 mt-6 max-h-[500px] overflow-y-auto custom-scrollbar focus-visible:outline-none"
              role="list"
              aria-label="List of days"
              tabIndex={-1}
            >
        <AnimatePresence initial={false}>
          {days.map((day, index) => {
            const isCompleted = day.status === 'completed';
            const isToday = day.status === 'today';
            const isMissed = day.status === 'missed';
            const isExpanded = expandedDay === day.day;
            
            return (
              <motion.div
                key={day.day}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.3) }}
                className={cn(
                  "flex flex-col rounded-xl border backdrop-blur-sm overflow-hidden transition-colors duration-300",
                  isExpanded ? "bg-slate-800/60 border-slate-600" : "bg-slate-900/40 border-slate-800/50 hover:bg-slate-800/40 hover:border-slate-700",
                  isToday && !isExpanded ? "border-blue-500/30 bg-blue-500/5" : ""
                )}
                role="listitem"
              >
                <button
                  onClick={() => toggleDay(day)}
                  onKeyDown={(e) => handleKeyDown(e, day)}
                  aria-expanded={isExpanded}
                  aria-controls={`day-details-${day.day}`}
                  aria-label={`Day ${day.day}, ${day.label || formatDate(day.date)}. Status: ${day.status}. ${isExpanded ? 'Collapse details' : 'Expand details'}`}
                  className="w-full flex items-center justify-between p-4 text-left focus-visible:outline-none focus-visible:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div className="relative flex items-center justify-center w-10 h-10 rounded-full shrink-0">
                      <div className={cn(
                        "absolute inset-0 rounded-full",
                        isCompleted ? "bg-emerald-500/20" :
                        isMissed ? "bg-rose-500/10" :
                        isToday ? "bg-blue-500/20 animate-pulse" :
                        "bg-slate-800/80"
                      )} />
                      {isCompleted ? (
                        <Check size={18} className="text-emerald-400 relative z-10" strokeWidth={3} />
                      ) : isMissed ? (
                        <X size={18} className="text-rose-400/70 relative z-10" strokeWidth={2.5} />
                      ) : isToday ? (
                        <div className="w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_12px_rgba(96,165,250,0.8)] relative z-10" />
                      ) : (
                        <Circle size={12} className="text-slate-600 relative z-10" strokeWidth={3} />
                      )}
                    </div>

                    {/* Compact Info */}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white flex items-center gap-2">
                        Day {day.day}
                        {isToday && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            Today
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Calendar size={12} className="opacity-70" />
                        {day.label || formatDate(day.date)}
                      </span>
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/50 text-slate-400 shrink-0">
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <ChevronDown size={16} />
                    </motion.div>
                  </div>
                </button>

                {/* Inline Expanded Panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      id={`day-details-${day.day}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 pl-[4.5rem] border-t border-slate-800/50 mt-2">
                        <div className="bg-slate-900/50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-slate-200 mb-2">Daily Summary</h4>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            {day.details || (
                              isCompleted 
                                ? "You successfully completed your tasks for this day. Great job maintaining your streak!" 
                                : isMissed 
                                  ? "You missed this day. Don't worry, consistency is about the long term. Keep going!" 
                                  : isToday 
                                    ? "This is today! Focus on completing your daily goals to build your streak." 
                                    : "This day is upcoming. Prepare yourself to stay on track."
                            )}
                          </p>
                          
                          <div className="mt-4 flex flex-wrap gap-3">
                            <div className="px-3 py-1.5 bg-slate-800/80 rounded text-xs text-slate-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-500" />
                              Status: <span className="capitalize text-white">{day.status}</span>
                            </div>
                            <div className="px-3 py-1.5 bg-slate-800/80 rounded text-xs text-slate-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-500" />
                              Date: <span className="text-white">{formatDate(day.date)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.8);
        }
      `}} />
    </section>
  );
};
