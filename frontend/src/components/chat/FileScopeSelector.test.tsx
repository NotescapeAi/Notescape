import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileScopeSelector } from './FileScopeSelector';
import type { FileRow } from '../../lib/api';

const mockFiles: FileRow[] = [
  { id: '1', filename: 'lecture1.pdf', status: 'INDEXED', created_at: '', class_id: 1, file_url: '' },
  { id: '2', filename: 'notes.txt', status: 'UPLOADED', created_at: '', class_id: 1, file_url: '' },
  { id: '3', filename: 'homework.docx', status: 'FAILED', created_at: '', class_id: 1, file_url: '' },
];

describe('FileScopeSelector', () => {
  it('renders all files', () => {
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={[]}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByText('lecture1.pdf')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('homework.docx')).toBeInTheDocument();
  });

  it('filters files by search query', () => {
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={[]}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
      />
    );
    const searchInput = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(searchInput, { target: { value: 'lecture' } });
    expect(screen.getByText('lecture1.pdf')).toBeInTheDocument();
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
  });

  it('calls onToggle when the toggle button is clicked', () => {
    const onToggle = vi.fn();
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={[]}
        onToggle={onToggle}
        onSelectAll={() => {}}
        onClear={() => {}}
      />
    );
    const toggleButtons = screen.getAllByTitle('Toggle context');
    fireEvent.click(toggleButtons[0]);
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('shows selected state correctly', () => {
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={['1']}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
      />
    );
    const row = screen.getByText('lecture1.pdf').closest('[aria-pressed]');
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelectAll when "All" is clicked', () => {
    const onSelectAll = vi.fn();
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={[]}
        onToggle={() => {}}
        onSelectAll={onSelectAll}
        onClear={() => {}}
      />
    );
    fireEvent.click(screen.getByText('Select All'));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it('calls onClear when "None" is clicked', () => {
    const onClear = vi.fn();
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={['1']}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('renders helper text in footer', () => {
    render(
      <FileScopeSelector
        files={mockFiles}
        selectedIds={[]}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByText('Select files for context')).toBeInTheDocument();
  });
});
