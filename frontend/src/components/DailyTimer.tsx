import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
export default function DailyTimer() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [isMounted, setIsMounted] = useState(false);

  const dateTimeString = currentDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="flex items-center gap-3 sm:gap-4 text-xs font-medium text-[var(--text-muted)]">
      <div className="hidden lg:flex items-center gap-2" title="Current Date & Time">
        <Calendar className="h-3.5 w-3.5 text-[var(--primary)]" />
        <span className="whitespace-nowrap">{dateTimeString}</span>
      </div>
    </div>
  );
}
