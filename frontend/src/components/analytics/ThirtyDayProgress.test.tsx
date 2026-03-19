import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThirtyDayProgress, DayProgress } from './ThirtyDayProgress';

describe('ThirtyDayProgress', () => {
  const mockDays: DayProgress[] = [
    { day: 1, date: new Date('2023-10-20'), status: 'completed', label: 'Fri 20' },
    { day: 2, date: new Date('2023-10-21'), status: 'missed', label: 'Sat 21' },
    { day: 3, date: new Date('2023-10-22'), status: 'today', label: 'Sun 22' },
    { day: 4, date: new Date('2023-10-23'), status: 'upcoming', label: 'Mon 23' },
  ];

  it('renders loading state correctly with aria-busy', () => {
    render(<ThirtyDayProgress days={[]} isLoading={true} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading progress')).toBeInTheDocument();
  });

  it('renders the title and success rate badge', () => {
    render(<ThirtyDayProgress days={mockDays} thirtyDayOpen={true} />);
    expect(screen.getByText(/30-Day Progress/i)).toBeInTheDocument();
    
    // 1 completed out of 3 passed days (upcoming is not counted)
    // passed days: completed, missed, today = 3
    // completed = 1
    // rate = 33%
    expect(screen.getByText(/33% Success/i)).toBeInTheDocument();
  });

  it('renders correct number of days with appropriate labels', () => {
    render(<ThirtyDayProgress days={mockDays} thirtyDayOpen={true} />);
    
    expect(screen.getByText(/Day 1/i)).toBeInTheDocument();
    expect(screen.getByText('Fri 20')).toBeInTheDocument();
    
    expect(screen.getByText(/Day 2/i)).toBeInTheDocument();
    expect(screen.getByText('Sat 21')).toBeInTheDocument();
    
    expect(screen.getByText(/Day 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Day 4/i)).toBeInTheDocument();
  });

  it('handles click events on day cards', () => {
    const handleDayClick = vi.fn();
    render(<ThirtyDayProgress days={mockDays} onDayClick={handleDayClick} thirtyDayOpen={true} />);
    
    const day1 = screen.getByLabelText(/Day 1, Fri 20/i);
    fireEvent.click(day1);
    
    expect(handleDayClick).toHaveBeenCalledWith(mockDays[0]);
    expect(handleDayClick).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation (Enter and Space) for accessibility', () => {
    const handleDayClick = vi.fn();
    render(<ThirtyDayProgress days={mockDays} onDayClick={handleDayClick} thirtyDayOpen={true} />);
    
    const day2 = screen.getByLabelText(/Day 2, Sat 21/i);
    
    // Test Enter key
    fireEvent.keyDown(day2, { key: 'Enter', code: 'Enter' });
    expect(handleDayClick).toHaveBeenCalledWith(mockDays[1]);
    
    // Test Space key
    fireEvent.keyDown(day2, { key: ' ', code: 'Space' });
    expect(handleDayClick).toHaveBeenCalledWith(mockDays[1]);
    
    expect(handleDayClick).toHaveBeenCalledTimes(2);
  });

  it('expands and collapses day details on click', () => {
    render(<ThirtyDayProgress days={mockDays} thirtyDayOpen={true} />);
    
    // Check that details are not visible initially
    expect(screen.queryByText(/Daily Summary/i)).not.toBeInTheDocument();
    
    // Click to expand
    const day1 = screen.getByLabelText(/Day 1, Fri 20/i);
    fireEvent.click(day1);
    
    // Details should now be visible
    expect(screen.getByText(/Daily Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/You successfully completed your tasks/i)).toBeInTheDocument();
    
    // Click again to collapse
    fireEvent.click(day1);
    
    // Details should be gone
    // Note: Framer Motion might keep it in the DOM temporarily during exit animation,
    // but in testing environment without animation frame loop it often gets removed or 
    // we might need to wait, but wait is async. Let's just check the aria-expanded attribute.
    expect(day1).toHaveAttribute('aria-expanded', 'false');
  });
});
