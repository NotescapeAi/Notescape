import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';
import type { Msg } from '../../hooks/useChatSession';

const mockMessages: Msg[] = [
  { id: '1', role: 'user', content: 'Hello' },
  { id: '2', role: 'assistant', content: 'Hi there!' },
];

const defaultProps = {
  messages: [],
  isLoading: false,
  error: null,
  input: "",
  setInput: () => {},
  onSend: () => {},
  showCitations: false,
  onToggleCitations: () => {},
  selectedQuote: null,
  onClearQuote: () => {},
  pendingSnip: null,
  onSendSnip: () => {},
  onDiscardSnip: () => {},
  scrollRef: { current: null },
  onScroll: () => {},
};

describe('ChatConversation', () => {
  it('renders messages', () => {
    render(
      <ChatConversation
        {...defaultProps}
        messages={mockMessages}
      />
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('handles input change', () => {
    const setInput = vi.fn();
    render(
      <ChatConversation
        {...defaultProps}
        input=""
        setInput={setInput}
      />
    );
    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: 'New message' } });
    expect(setInput).toHaveBeenCalledWith('New message');
  });

  it('calls onSend when Send button is clicked', () => {
    const onSend = vi.fn();
    render(
      <ChatConversation
        {...defaultProps}
        input="test"
        onSend={onSend}
      />
    );
    fireEvent.click(screen.getByTitle('Send message'));
    expect(onSend).toHaveBeenCalled();
  });

  it('disables send button when loading', () => {
    render(
      <ChatConversation
        {...defaultProps}
        input="test"
        isLoading={true}
      />
    );
    const button = screen.getByTitle('Send message');
    expect(button).toBeDisabled();
  });

  it('shows error message', () => {
    render(
      <ChatConversation
        {...defaultProps}
        error="Something went wrong"
      />
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
