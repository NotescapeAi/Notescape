import React, { memo, useMemo } from 'react';

export interface DateDisplayProps {
  /**
   * The date to display. Can be a Date object, a timestamp number, or a date string.
   * If null or invalid, the component displays the error message.
   */
  date: Date | string | number | null | undefined;

  /**
   * The locale to use for formatting. Defaults to the user's browser locale.
   */
  locale?: string;

  /**
   * The format options for Intl.DateTimeFormat.
   * Defaults to a standard medium date format (e.g., "Oct 24, 2023").
   */
  formatOptions?: Intl.DateTimeFormatOptions;

  /**
   * Custom class name for the container.
   */
  className?: string;

  /**
   * Text to display when the date is null, undefined, or invalid.
   * Defaults to "Date not available".
   */
  placeholder?: string;

  /**
   * Whether to show the time alongside the date.
   * If true, adds hour and minute to the default format options.
   * Overridden by explicit `formatOptions`.
   */
  showTime?: boolean;
}

export function formatDate(
  date: Date | string | number | null | undefined,
  locale?: string,
  formatOptions?: Intl.DateTimeFormatOptions,
  showTime = false
): string | null {
  if (date === null || date === undefined) return null;

  try {
    const dateObj = new Date(date);
    
    // Check for invalid date
    if (isNaN(dateObj.getTime())) return null;

    const userLocale = locale || undefined; // undefined uses browser's default locale
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(showTime && {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };

    const finalOptions = formatOptions || defaultOptions;
    
    return new Intl.DateTimeFormat(userLocale, finalOptions).format(dateObj);
  } catch (error) {
    console.error('DateDisplay: Error formatting date', error);
    return null;
  }
}

/**
 * A standardized date display component ensuring accessibility, consistency, and responsiveness.
 * 
 * Features:
 * - Responsive font sizing (14px mobile, 16px desktop)
 * - High contrast text color
 * - ARIA label for screen readers
 * - Internationalization support
 * - Error handling for invalid dates
 * - Memoized for performance
 */
export const DateDisplay = memo(function DateDisplay({
  date,
  locale,
  formatOptions,
  className = '',
  placeholder = 'Date not available',
  showTime = false,
}: DateDisplayProps) {
  // Memoize the formatted date string to ensure performance < 100ms
  const { formattedDate, isValid, isoString } = useMemo(() => {
    const fDate = formatDate(date, locale, formatOptions, showTime);
    
    if (!fDate) {
      return { formattedDate: null, isValid: false, isoString: '' };
    }

    // Since formatDate succeeded, we know date is valid
    const dateObj = new Date(date!); 

    return {
      formattedDate: fDate,
      isValid: true,
      isoString: dateObj.toISOString(),
    };
  }, [date, locale, formatOptions, showTime]);

  if (!isValid || !formattedDate) {
    return (
      <span 
        className={`text-sm lg:text-base text-[var(--text-muted)] font-medium ${className}`}
        aria-label="Date not available"
      >
        {placeholder}
      </span>
    );
  }

  return (
    <time
      dateTime={isoString}
      className={`text-sm lg:text-base text-[var(--text-main)] font-medium leading-normal ${className}`}
      aria-label={`Date: ${formattedDate}`}
    >
      {formattedDate}
    </time>
  );
});
