import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatInterface } from './ChatInterface';
import type { ChatSession, FileRow } from '../../lib/api';

// Mock sub-components
vi.mock('./ChatSessionList', () => ({
  ChatSessionList: (props: any) => (
    <div data-testid="chat-session-list">
      Session List: {props.sessions.length}
    </div>
  ),
}));

vi.mock('./ChatConversation', () => ({
  ChatConversation: (props: any) => (
    <div data-testid="chat-conversation">
      Conversation: {props.messages.length}
    </div>
  ),
}));

vi.mock('./FileScopeSelector', () => ({
  FileScopeSelector: (props: any) => (
    <div data-testid="file-scope-selector">
      Files: {props.files.length}
    </div>
  ),
}));

const mockSessions: ChatSession[] = [
  { id: '1', title: 'Session 1', created_at: '', updated_at: '' },
];
const mockFiles: FileRow[] = [
  { id: '1', filename: 'file1.pdf', status: 'INDEXED', created_at: '', class_id: 1, file_url: '' },
];

const defaultProps = {
  sessions: mockSessions,
  activeSessionId: '1',
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onRenameSession: vi.fn(),
  onClearMessages: vi.fn(),
  onDeleteSession: vi.fn(),
  messages: [],
  isLoading: false,
  error: null,
  input: '',
  setInput: vi.fn(),
  onSend: vi.fn(),
  showCitations: false,
  onToggleCitations: vi.fn(),
  selectedQuote: null,
  onClearQuote: vi.fn(),
  pendingSnip: null,
  onSendSnip: vi.fn(),
  onDiscardSnip: vi.fn(),
  scrollRef: { current: null },
  onScroll: vi.fn(),
  files: mockFiles,
  selectedFileIds: [],
  onToggleFile: vi.fn(),
  onSetFileScope: vi.fn(),
};

describe('ChatInterface', () => {
  it('renders all three main sections', () => {
    render(<ChatInterface {...defaultProps} />);
    
    expect(screen.getByTestId('chat-session-list')).toBeInTheDocument();
    expect(screen.getByTestId('chat-conversation')).toBeInTheDocument();
    expect(screen.getByTestId('file-scope-selector')).toBeInTheDocument();
  });

  it('passes correct props to sub-components', () => {
    render(<ChatInterface {...defaultProps} />);
    
    expect(screen.getByText('Session List: 1')).toBeInTheDocument();
    expect(screen.getByText('Files: 1')).toBeInTheDocument();
  });

  it('renders with correct layout classes', () => {
    const { container } = render(<ChatInterface {...defaultProps} />);
    // Check for grid layout
    const grid = container.firstChild;
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveClass('lg:grid-cols-3');
  });
});
