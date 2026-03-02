import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatSessionList } from './ChatSessionList';
import type { ChatSession } from '../../hooks/useChatSession';

const mockSessions: ChatSession[] = [
  { id: '1', title: 'Session 1', created_at: '2025-01-01', updated_at: '2025-01-01' },
  { id: '2', title: 'Session 2', created_at: '2025-01-02', updated_at: '2025-01-02' },
];

describe('ChatSessionList', () => {
  it('renders sessions', () => {
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId="1"
        onSelectSession={() => {}}
        onNewSession={() => {}}
        onRenameSession={() => {}}
        onClearMessages={() => {}}
        onDeleteSession={() => {}}
      />
    );
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();
  });

  it('highlights active session', () => {
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId="1"
        onSelectSession={() => {}}
        onNewSession={() => {}}
        onRenameSession={() => {}}
        onClearMessages={() => {}}
        onDeleteSession={() => {}}
      />
    );
    const activeSession = screen.getByText('Session 1').closest('[role="button"]');
    const inactiveSession = screen.getByText('Session 2').closest('[role="button"]');
    
    // Check for classes that indicate active state
    expect(activeSession).toHaveClass('bg-surface-active');
    expect(inactiveSession).not.toHaveClass('bg-surface-active');
  });

  it('calls onSelectSession when clicked', () => {
    const onSelectSession = vi.fn();
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId="1"
        onSelectSession={onSelectSession}
        onNewSession={() => {}}
        onRenameSession={() => {}}
        onClearMessages={() => {}}
        onDeleteSession={() => {}}
      />
    );
    fireEvent.click(screen.getByText('Session 2'));
    expect(onSelectSession).toHaveBeenCalledWith('2');
  });

  it('calls onNewSession when New button is clicked', () => {
    const onNewSession = vi.fn();
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId="1"
        onSelectSession={() => {}}
        onNewSession={onNewSession}
        onRenameSession={() => {}}
        onClearMessages={() => {}}
        onDeleteSession={() => {}}
      />
    );
    fireEvent.click(screen.getByTitle('Start a new chat session'));
    expect(onNewSession).toHaveBeenCalled();
  });
});
