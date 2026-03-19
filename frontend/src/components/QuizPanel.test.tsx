import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuizPanel from './QuizPanel';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  createQuizJob: vi.fn(),
  getQuizJobStatus: vi.fn(),
  uploadFile: vi.fn(),
}));

const mockFiles = [
  { id: '1', filename: 'test.pdf', mime_type: 'application/pdf', uploaded_at: '', size_bytes: 1000 },
  { id: '2', filename: 'notes.txt', mime_type: 'text/plain', uploaded_at: '', size_bytes: 500 },
];

describe('QuizPanel', () => {
  const mockOnQuizCreated = vi.fn();
  const defaultProps = {
    classId: 1,
    files: mockFiles,
    onQuizCreated: mockOnQuizCreated,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with source selection options', () => {
    render(<QuizPanel {...defaultProps} />);
    
    expect(screen.getByText('1. Choose Source')).toBeInTheDocument();
    expect(screen.getByText('Existing File')).toBeInTheDocument();
    expect(screen.getByText('Paste Text')).toBeInTheDocument();
    expect(screen.getByText('From Topic')).toBeInTheDocument();
  });

  it('shows file selection when "Existing File" is clicked', () => {
    render(<QuizPanel {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Existing File'));
    
    expect(screen.getByLabelText('Select file')).toBeInTheDocument();
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });

  it('shows text input when "Paste Text" is clicked', () => {
    render(<QuizPanel {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Paste Text'));
    
    expect(screen.getByPlaceholderText('Title (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste your study material here...')).toBeInTheDocument();
  });

  it('shows topic input when "From Topic" is clicked', () => {
    render(<QuizPanel {...defaultProps} />);
    
    fireEvent.click(screen.getByText('From Topic'));
    
    expect(screen.getByPlaceholderText('e.g., Photosynthesis, The French Revolution...')).toBeInTheDocument();
  });

  it('enables "Next Step" button when input is provided', () => {
    render(<QuizPanel {...defaultProps} />);
    
    // Select Topic mode
    fireEvent.click(screen.getByText('From Topic'));
    
    const nextButton = screen.getByText('Next Step');
    expect(nextButton).toBeDisabled();
    
    // Enter topic
    const input = screen.getByPlaceholderText('e.g., Photosynthesis, The French Revolution...');
    fireEvent.change(input, { target: { value: 'Physics' } });
    
    expect(nextButton).toBeEnabled();
  });

  it('navigates to Step 2 and allows configuration', () => {
    render(<QuizPanel {...defaultProps} />);
    
    // Go to Step 2
    fireEvent.click(screen.getByText('From Topic'));
    fireEvent.change(screen.getByPlaceholderText('e.g., Photosynthesis, The French Revolution...'), { target: { value: 'Physics' } });
    fireEvent.click(screen.getByText('Next Step'));
    
    expect(screen.getByText('2. Configure Quiz')).toBeInTheDocument();
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    expect(screen.getByText('Generate Quiz')).toBeInTheDocument();
  });

  it('calls createQuizJob when "Generate Quiz" is clicked', async () => {
    // Mock API responses
    (api.uploadFile as any).mockResolvedValue({ id: 'topic-file-id' });
    (api.createQuizJob as any).mockResolvedValue({ job_id: 'job-123' });
    (api.getQuizJobStatus as any).mockResolvedValue({ status: 'completed', progress: 100 });

    render(<QuizPanel {...defaultProps} />);
    
    // Step 1: Topic
    fireEvent.click(screen.getByText('From Topic'));
    fireEvent.change(screen.getByPlaceholderText('e.g., Photosynthesis, The French Revolution...'), { target: { value: 'Physics' } });
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 2: Generate
    fireEvent.click(screen.getByText('Generate Quiz'));
    
    await waitFor(() => {
      expect(api.uploadFile).toHaveBeenCalled();
      expect(api.createQuizJob).toHaveBeenCalledWith(expect.objectContaining({
        class_id: 1,
        source_type: 'topic',
        difficulty: 'medium'
      }));
    });
  });
});
