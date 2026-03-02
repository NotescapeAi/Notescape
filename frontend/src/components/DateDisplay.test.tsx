import { render, screen } from '@testing-library/react';
import { DateDisplay } from './DateDisplay';
import { describe, it, expect } from 'vitest';

describe('DateDisplay Component', () => {
  it('renders a valid date correctly', () => {
    const date = new Date('2023-10-24T12:00:00Z');
    render(<DateDisplay date={date} />);
    
    // Check for standard formatting (Oct 24, 2023)
    const element = screen.getByText(/Oct 24, 2023/i);
    expect(element).toBeInTheDocument();
    
    // Check for semantic time element
    expect(element.tagName).toBe('TIME');
    expect(element).toHaveAttribute('datetime', date.toISOString());
  });

  it('handles string dates', () => {
    render(<DateDisplay date="2023-10-24" />);
    expect(screen.getByText(/Oct 24, 2023/i)).toBeInTheDocument();
  });

  it('handles timestamps', () => {
    const timestamp = 1698148800000; // Oct 24 2023
    render(<DateDisplay date={timestamp} />);
    expect(screen.getByText(/Oct 24, 2023/i)).toBeInTheDocument();
  });

  it('renders invalid dates with placeholder', () => {
    render(<DateDisplay date="invalid-date" placeholder="Custom Error" />);
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
  });

  it('renders null dates with placeholder', () => {
    render(<DateDisplay date={null} />);
    expect(screen.getByText('Date not available')).toBeInTheDocument();
  });

  it('supports custom locale (fr-FR)', () => {
    const date = new Date('2023-10-24');
    render(<DateDisplay date={date} locale="fr-FR" />);
    // French format usually "24 oct. 2023"
    expect(screen.getByText(/24 oct. 2023/i)).toBeInTheDocument();
  });

  it('supports custom formatting options', () => {
    const date = new Date('2023-10-24');
    render(
      <DateDisplay 
        date={date} 
        formatOptions={{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }} 
      />
    );
    expect(screen.getByText(/Tuesday, October 24, 2023/i)).toBeInTheDocument();
  });

  it('applies responsive classes', () => {
    const date = new Date('2023-10-24');
    const { container } = render(<DateDisplay date={date} />);
    const timeElement = container.querySelector('time');
    expect(timeElement).toHaveClass('text-sm');
    expect(timeElement).toHaveClass('lg:text-base');
  });

  it('has correct ARIA label', () => {
    const date = new Date('2023-10-24');
    render(<DateDisplay date={date} />);
    const element = screen.getByLabelText(/Date: Oct 24, 2023/i);
    expect(element).toBeInTheDocument();
  });

  it('handles leap years correctly', () => {
    const date = new Date('2024-02-29T12:00:00Z');
    // Using UTC to ensure consistent date across environments for this test
    render(<DateDisplay date={date} formatOptions={{ timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }} />);
    expect(screen.getByText(/Feb 29, 2024/i)).toBeInTheDocument();
  });

  it('handles different timezones', () => {
    const date = new Date('2023-10-24T12:00:00Z');
    
    // Tokyo is +9 hours, so 12:00Z -> 21:00 Tokyo
    render(
      <DateDisplay 
        date={date} 
        formatOptions={{ 
          timeZone: 'Asia/Tokyo', 
          hour: 'numeric', 
          minute: 'numeric', 
          hour12: false 
        }} 
        showTime={true}
      />
    );
    expect(screen.getByText(/21:00/)).toBeInTheDocument();

    // New York is -4 hours (EDT), so 12:00Z -> 08:00 New York
    render(
      <DateDisplay 
        date={date} 
        formatOptions={{ 
          timeZone: 'America/New_York', 
          hour: 'numeric', 
          minute: 'numeric', 
          hour12: false 
        }} 
        showTime={true}
      />
    );
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
  });
});
