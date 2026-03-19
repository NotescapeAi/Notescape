import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import AppShell from '../layouts/AppShell';
import KebabMenu from '../components/KebabMenu';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Trash2, 
  AlertCircle,
  BarChart3,
  Filter,
  ArrowRight,
  X,
  Edit2,
  Link as LinkIcon,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  CalendarCheck2,
  Sparkles,
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import { formatLocalISODate, parseLocal } from '../lib/utils';
import { getWeakTags, listClasses, type ClassRow } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---

type Priority = 'High' | 'Medium' | 'Low';
type Status = 'Pending' | 'In Progress' | 'Completed';

export interface RevisionTask {
  id: string;
  subject: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  priority: Priority;
  status: Status;
  description?: string;
  link?: string;
  classId?: number;
  className?: string;
  createdAt: number;
}

// --- Components ---

// 0. AI Plan Generator
function AIPlanGenerator({ onGenerate, isOpen, onClose }: { onGenerate: (tasks: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>[]) => void, isOpen: boolean, onClose: () => void }) {
  const [subjects, setSubjects] = useState<{ name: string; score: number }[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [daysToPlan, setDaysToPlan] = useState(7);

  // Fetch weak tags on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getWeakTags({ limit: 5 })
        .then(tags => {
          if (tags.length > 0) {
            setSubjects(prev => {
              // Merge with existing, avoiding duplicates
              const existingNames = new Set(prev.map(s => s.name.toLowerCase()));
              const newSubs = tags
                .filter(t => !existingNames.has(t.tag.toLowerCase()))
                .map(t => ({ name: t.tag, score: Math.round(t.accuracy_rate * 100) }));
              return [...prev, ...newSubs];
            });
          }
        })
        .catch(err => console.error("Failed to fetch weak tags", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const addSubject = () => {
    if (!newSubject.trim()) return;
    setSubjects(prev => [...prev, { name: newSubject, score: 50 }]);
    setNewSubject('');
  };

  const removeSubject = (index: number) => {
    setSubjects(prev => prev.filter((_, i) => i !== index));
  };

  const updateScore = (index: number, score: number) => {
    setSubjects(prev => {
      const next = [...prev];
      next[index].score = score;
      return next;
    });
  };

  const handleGenerate = () => {
    const tasks: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>[] = [];
    const today = new Date();

    subjects.forEach(sub => {
      // Logic: Lower score = More frequency
      // Score < 50: Every 2 days
      // Score 50-79: Every 3 days
      // Score >= 80: Once a week
      
      let interval = 7;
      let priority: Priority = 'Low';

      if (sub.score < 50) {
        interval = 2;
        priority = 'High';
      } else if (sub.score < 80) {
        interval = 3;
        priority = 'Medium';
      }

      for (let i = 0; i < daysToPlan; i += interval) {
        // Add some jitter to avoid stacking everything on day 1
        const jitter = Math.floor(Math.random() * 2); 
        const dayOffset = i + jitter;
        if (dayOffset >= daysToPlan) break;

        const date = new Date(today);
        date.setDate(today.getDate() + dayOffset);
        
        tasks.push({
          subject: sub.name,
          date: formatLocalISODate(date),
          time: '10:00', // Default morning slot
          priority,
          description: `Generated based on score: ${sub.score}%`,
          link: ''
        });
      }
    });

    onGenerate(tasks);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-[var(--bg-surface)] rounded-2xl shadow-xl border border-[var(--border-subtle)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <h3 className="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI Study Plan Generator
          </h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 space-y-5">
          <div className="text-sm text-[var(--text-secondary)]">
            We'll generate a study schedule based on your current performance.
            Lower scores get higher priority and more frequent sessions.
          </div>

          {/* Subject List */}
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
            {subjects.map((sub, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-main)] truncate">{sub.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={sub.score} 
                      onChange={(e) => updateScore(idx, Number(e.target.value))}
                      className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className={`text-xs font-bold w-8 text-right ${
                      sub.score < 50 ? 'text-red-500' : sub.score < 80 ? 'text-amber-500' : 'text-green-500'
                    }`}>
                      {sub.score}%
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => removeSubject(idx)}
                  className="p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            
            {subjects.length === 0 && !loading && (
              <div className="text-center py-8 text-[var(--text-muted)] border-2 border-dashed border-[var(--border-subtle)] rounded-xl">
                No subjects added. Add one below or fetch from weak tags.
              </div>
            )}
            
            {loading && (
              <div className="flex items-center justify-center py-4 gap-2 text-[var(--text-muted)]">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Fetching weak tags...
              </div>
            )}
          </div>

          {/* Add Subject */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Add subject (e.g., Biology)..."
              className="flex-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
              onKeyDown={(e) => e.key === 'Enter' && addSubject()}
            />
            <button
              onClick={addSubject}
              disabled={!newSubject.trim()}
              className="px-4 h-10 rounded-xl bg-[var(--surface-2)] text-[var(--text-main)] font-medium hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
               <label className="text-sm font-medium text-[var(--text-secondary)]">Plan for:</label>
               <select 
                 value={daysToPlan}
                 onChange={(e) => setDaysToPlan(Number(e.target.value))}
                 className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm px-2 focus:outline-none"
               >
                 <option value={7}>7 Days</option>
                 <option value={14}>14 Days</option>
                 <option value={30}>30 Days</option>
               </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={subjects.length === 0}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Generate Plan
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 1. Task Form
interface TaskFormProps {
  onAdd?: (task: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>) => void;
  onUpdate?: (task: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>) => void;
  initialData?: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>;
  onCancel?: () => void;
  isEditing?: boolean;
}

function TaskForm({ onAdd, onUpdate, initialData, onCancel, isEditing = false }: TaskFormProps) {
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [date, setDate] = useState(() => initialData?.date || formatLocalISODate(new Date()));
  const [time, setTime] = useState(() => {
    if (initialData?.time) return initialData.time;
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  });
  const [priority, setPriority] = useState<Priority>(initialData?.priority || 'Medium');
  const [description, setDescription] = useState(initialData?.description || '');
  const [link, setLink] = useState(initialData?.link || '');
  const [isExpanded, setIsExpanded] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | undefined>(initialData?.classId);

  // Fetch classes on mount
  useEffect(() => {
    listClasses().then(setClasses).catch(console.error);
  }, []);

  // Reset form when initialData changes (for modal reuse)
  useEffect(() => {
    if (initialData) {
      setSubject(initialData.subject);
      setDate(initialData.date);
      setTime(initialData.time);
      setPriority(initialData.priority);
      setDescription(initialData.description || '');
      setLink(initialData.link || '');
      setSelectedClassId(initialData.classId);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    const taskData = {
      subject,
      date,
      time,
      priority,
      description,
      link,
      classId: selectedClassId,
      className: classes.find(c => c.id === selectedClassId)?.name
    };

    if (isEditing && onUpdate) {
      onUpdate(taskData);
    } else if (onAdd) {
      onAdd(taskData);
      
      // Reset form only if adding
      const now = new Date();
      setSubject('');
      setDescription('');
      setLink('');
      setSelectedClassId(undefined);
      setDate(formatLocalISODate(now));
      setTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setIsExpanded(false);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Subject */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Subject / Topic
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Quantum Physics Ch. 3"
            className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all placeholder:text-[var(--text-muted)]"
            required
            autoFocus
          />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all"
              required
            />
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Priority
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                  priority === p
                    ? p === 'High'
                      ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 ring-1 ring-red-500/20'
                      : p === 'Medium'
                        ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400 ring-1 ring-amber-500/20'
                        : 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 ring-1 ring-green-500/20'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Link */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Link (Optional)
          </label>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Class Link */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Link to Class (Optional)
          </label>
          <select
            value={selectedClassId || ''}
            onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-main)]"
          >
            <option value="">General Task (No Class)</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes (optional)..."
            rows={2}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all resize-none placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] font-bold hover:bg-[var(--surface-hover)] transition-all"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="flex-1 h-10 rounded-xl bg-[var(--primary)] text-white font-bold shadow-md shadow-[var(--primary)]/20 hover:bg-[var(--primary-hover)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Save Changes
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`group rounded-2xl border transition-all duration-300 ${isExpanded ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-sm' : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--primary)]/50'}`}>
      {!isExpanded ? (
        <div 
          className="p-4 flex items-center gap-3 cursor-text"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[var(--text-muted)] font-medium">Add a task...</span>
        </div>
      ) : (
        <div className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full text-lg font-semibold bg-transparent border-none p-0 focus:ring-0 placeholder:text-[var(--text-muted)]"
              autoFocus
              required
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <CalendarIcon className="w-4 h-4" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Clock className="w-4 h-4" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] sm:col-span-2">
                 <LinkIcon className="w-4 h-4" />
                 <input
                   type="url"
                   value={link}
                   onChange={(e) => setLink(e.target.value)}
                   placeholder="Add a link (optional)..."
                   className="bg-transparent border-none p-0 focus:ring-0 w-full placeholder:text-[var(--text-muted)]"
                 />
               </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] sm:col-span-2">
                 <Sparkles className="w-4 h-4" />
                 <select
                   value={selectedClassId || ''}
                   onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : undefined)}
                   className="bg-transparent border-none p-0 focus:ring-0 w-full text-[var(--text-main)] cursor-pointer"
                 >
                   <option value="">General Task (No Class)</option>
                   {classes.map(c => (
                     <option key={c.id} value={c.id}>{c.name}</option>
                   ))}
                 </select>
               </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    priority === p
                      ? p === 'High'
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : p === 'Medium'
                          ? 'bg-amber-50 border-amber-200 text-amber-600'
                          : 'bg-green-50 border-green-200 text-green-600'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full text-sm bg-[var(--surface-2)] rounded-lg p-3 border-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--text-muted)] resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-lg shadow-sm transition-colors"
              >
                Add Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// 2. Edit Task Modal
export function EditTaskModal({ task, isOpen, onClose, onUpdate }: { task: RevisionTask | null, isOpen: boolean, onClose: () => void, onUpdate: (id: string, updates: Partial<RevisionTask>) => void }) {
  if (!isOpen || !task) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-[var(--bg-surface)] rounded-2xl shadow-xl border border-[var(--border-subtle)] overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] shrink-0">
          <h3 className="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-[var(--primary)]" />
            Edit Task
          </h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <TaskForm 
            isEditing={true}
            initialData={task}
            onUpdate={(updates) => {
              onUpdate(task.id, updates);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// 2. Stats Component
function RevisionStats({ tasks }: { tasks: RevisionTask[] }) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const pending = total - completed;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  
  const highPriorityPending = tasks.filter(t => t.priority === 'High' && t.status !== 'Completed').length;

  const weeklyCompleted = useMemo(() => {
    const now = new Date();
    // Get start of week (Monday)
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startStr = formatLocalISODate(startOfWeek);
    const endStr = formatLocalISODate(endOfWeek);

    return tasks.filter(t => 
      t.status === 'Completed' && 
      t.date >= startStr && 
      t.date <= endStr
    ).length;
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
          <CalendarCheck2 className="w-4 h-4 text-purple-500" />
          Weekly Summary
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold text-[var(--text-main)]">{weeklyCompleted}</span>
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tasks Done</span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          Total Progress
        </div>
        <div className="flex items-end justify-between mb-2">
          <span className="text-2xl font-bold text-[var(--text-main)]">{progress}%</span>
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{completed}/{total} Done</span>
        </div>
        <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          Pending
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold text-[var(--text-main)]">{pending}</span>
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Remaining</span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          High Priority
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold text-[var(--text-main)]">{highPriorityPending}</span>
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Urgent</span>
        </div>
      </div>
    </div>
  );
}

// 3. Task Card
export function TaskCard({ task, onUpdate, onDelete, onEdit }: { task: RevisionTask, onUpdate: (id: string, updates: Partial<RevisionTask>) => void, onDelete: (id: string) => void, onEdit: (task: RevisionTask) => void }) {
  const priorityColors = {
    'High': 'text-red-500 bg-red-50 dark:bg-red-900/20',
    'Medium': 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
    'Low': 'text-green-500 bg-green-50 dark:bg-green-900/20'
  };

  const isCompleted = task.status === 'Completed';
  const isInProgress = task.status === 'In Progress';

  const statusOptions = (['Pending', 'In Progress', 'Completed'] as Status[])
    .filter(s => s !== task.status)
    .map(s => ({
      label: s === 'In Progress' ? 'Mark In Progress' : `Mark as ${s}`,
      onClick: () => onUpdate(task.id, { status: s })
    }));

  const ensureUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };

  const toggleStatus = () => {
    onUpdate(task.id, { status: isCompleted ? 'Pending' : 'Completed' });
  };

  return (
    <div className={`group relative flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 transition-all hover:shadow-sm hover:border-[var(--border)] ${isCompleted ? 'opacity-60 bg-[var(--surface-subtle)]' : ''}`}>
      {/* Checkbox */}
      <button 
        onClick={toggleStatus}
        className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          isCompleted 
            ? 'border-green-500 bg-green-500 text-white' 
            : isInProgress
              ? 'border-amber-500 text-amber-500 bg-amber-50 dark:bg-amber-900/20'
              : 'border-[var(--border)] hover:border-[var(--primary)]'
        }`}
      >
        {isCompleted && <CheckCircle2 className="w-4 h-4" />}
        {isInProgress && <Clock className="w-4 h-4" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h4 className={`text-base font-medium text-[var(--text-main)] truncate ${isCompleted ? 'line-through text-[var(--text-muted)]' : ''}`}>
            {task.subject}
          </h4>
          {task.className && (
            <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
              {task.className}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${priorityColors[task.priority]}`}>
            {task.priority}
          </span>
        </div>
        
        {task.description && (
          <p className={`text-sm text-[var(--text-secondary)] mb-2 line-clamp-1 ${isCompleted ? 'line-through' : ''}`}>
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)] mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{parseLocal(task.date).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{task.time}</span>
          </div>
          {task.link && (
            <a 
              href={ensureUrl(task.link)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[var(--primary)] hover:underline z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Link</span>
            </a>
          )}
        </div>

        {/* Suggested Links */}
        {!isCompleted && (
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
             <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
               <Sparkles className="w-3 h-3 text-[var(--primary)]" />
               Recommended Resources
             </div>
             <div className="flex flex-wrap gap-2">
               <a 
                 href={`https://www.google.com/search?q=${encodeURIComponent(task.subject + ' tutorial')}`}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="px-2 py-1 rounded bg-[var(--surface-2)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] transition-colors flex items-center gap-1"
                 onClick={(e) => e.stopPropagation()}
               >
                 Google
               </a>
               <a 
                 href={`https://www.youtube.com/results?search_query=${encodeURIComponent(task.subject + ' tutorial')}`}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="px-2 py-1 rounded bg-[var(--surface-2)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-red-500 transition-colors flex items-center gap-1"
                 onClick={(e) => e.stopPropagation()}
               >
                 YouTube
               </a>
               <a 
                 href={`https://www.google.com/search?q=site:geeksforgeeks.org+${encodeURIComponent(task.subject)}`}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="px-2 py-1 rounded bg-[var(--surface-2)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-green-600 transition-colors flex items-center gap-1"
                 onClick={(e) => e.stopPropagation()}
               >
                 GeeksForGeeks
               </a>
             </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <KebabMenu 
          items={[
            { label: 'Edit', onClick: () => onEdit(task) },
            ...statusOptions,
            { label: 'Delete', onClick: () => onDelete(task.id), className: 'text-red-600 dark:text-red-400' }
          ]} 
        />
      </div>
    </div>
  );
}

// --- Main Page Component ---

export default function RevisionPlanner() {
  const [tasks, setTasks] = useState<RevisionTask[]>(() => {
    const saved = localStorage.getItem('revision_tasks');
    return saved ? JSON.parse(saved) : [];
  });

  const [filter, setFilter] = useState<'All' | 'Today' | 'Upcoming' | 'Completed'>('All');
  const [editingTask, setEditingTask] = useState<RevisionTask | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // --- 1. Data Loading ---
  useEffect(() => {
    localStorage.setItem('revision_tasks', JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (newTask: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>) => {
    const task: RevisionTask = {
      ...newTask,
      id: crypto.randomUUID(),
      status: 'Pending',
      createdAt: Date.now()
    };
    setTasks(prev => [...prev, task].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'Completed') return 1;
        if (b.status === 'Completed') return -1;
      }
      const dateA = `${a.date}T${a.time}`;
      const dateB = `${b.date}T${b.time}`;
      return dateA.localeCompare(dateB);
    }));
  };

  const updateTask = (id: string, updates: Partial<RevisionTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t).sort((a, b) => {
      // Re-sort after update if date/time changed
      if (updates.date || updates.time || updates.status) {
        // Also sort by status (pending first)
        if (a.status !== b.status) {
          if (a.status === 'Completed') return 1;
          if (b.status === 'Completed') return -1;
        }
        const dateA = `${a.date}T${a.time}`;
        const dateB = `${b.date}T${b.time}`;
        return dateA.localeCompare(dateB);
      }
      return 0;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 30-Day Tracker Data
  const trackerData = useMemo(() => {
    const today = new Date();
    const days = [];

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateString = formatLocalISODate(date);
      
      const dayTasks = tasks.filter(t => t.date === dateString);
      const total = dayTasks.length;
      const completed = dayTasks.filter(t => t.status === 'Completed').length;
      
      // Calculate stroke offset for SVG circle (circumference = 2 * PI * 14 ≈ 88)
      const circumference = 88;
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
      const offset = circumference - (circumference * progress) / 100;
      
      days.push({
        dayIndex: i + 1,
        date: dateString,
        label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
        total,
        completed,
        progress,
        offset,
        status: total === 0 ? 'empty' : completed === total ? 'completed' : 'pending'
      });
    }
    return days;
  }, [tasks]);

  // Filter tasks based on active tab OR selected date
  const handleAiGenerate = (newTasks: Omit<RevisionTask, 'id' | 'status' | 'createdAt'>[]) => {
    const tasksToAdd = newTasks.map(t => ({
      ...t,
      id: crypto.randomUUID(),
      status: 'Pending' as const,
      createdAt: Date.now()
    }));
    setTasks(prev => [...prev, ...tasksToAdd]);
    // Force switch to 'All' or 'Upcoming' to see new tasks
    setFilter('All');
  };

  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // If a specific date is selected from tracker, override tab filter
    if (selectedDate) {
      return tasks.filter(t => t.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
    }

    const todayStr = formatLocalISODate(new Date());

    switch (filter) {
      case 'Today':
        filtered = tasks.filter(t => t.date === todayStr);
        break;
      case 'Upcoming':
        filtered = tasks.filter(t => t.date > todayStr);
        break;
      case 'Completed':
        filtered = tasks.filter(t => t.status === 'Completed');
        break;
      default:
        break;
    }
    
    // Sort by date and time
    return filtered.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });
  }, [tasks, filter, selectedDate]);

  return (
    <AppShell title="Study Planner" subtitle="Organize your study schedule and stay on track">
      <AIPlanGenerator 
        isOpen={isAiModalOpen} 
        onClose={() => setIsAiModalOpen(false)} 
        onGenerate={handleAiGenerate}
      />
      
      {/* Header Area */}
      <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <CalendarCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Study Planner</h1>
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                {formatLocalISODate(new Date())}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-main)] text-sm font-semibold hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="hidden sm:inline">AI Plan</span>
          </button>
      </div>

      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6">
        
        {/* Stats Grid */}
        <RevisionStats tasks={tasks} />
        
        {/* 30-Day Tracker */}
      <div className="mb-8 mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            30-Day Progress
          </h2>
        </div>
        
        <div className="flex flex-col gap-3">
          {trackerData.map((day) => {
            const isExpanded = selectedDate === day.date;
            const dayTasks = tasks.filter(t => t.date === day.date).sort((a, b) => a.time.localeCompare(b.time));
            
            return (
              <div 
                key={day.date} 
                className={`flex flex-col rounded-xl border transition-all ${
                  isExpanded 
                    ? 'border-[var(--primary)] bg-[var(--surface)] shadow-sm' 
                    : 'border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--primary)]/50'
                }`}
              >
                <button
                  onClick={() => {
                    if (isExpanded) {
                      setSelectedDate(null);
                    } else {
                      setSelectedDate(day.date);
                    }
                  }}
                  className="flex items-center justify-between p-4 w-full text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[var(--text-main)]">
                        {day.label}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                        Day {day.dayIndex}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
                      <div className="relative w-8 h-8 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-[var(--surface-2)]" />
                          {day.total > 0 && (
                            <circle
                              cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                              strokeDasharray={88} strokeDashoffset={day.offset} strokeLinecap="round"
                              className={`transition-all duration-500 ${day.progress === 100 ? 'text-green-500' : 'text-[var(--primary)]'}`}
                            />
                          )}
                        </svg>
                        {day.total === 0 ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] opacity-20" />
                        ) : day.progress === 100 ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <span className="text-[9px] font-bold text-[var(--text-main)]">{day.progress}%</span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {day.total} {day.total === 1 ? 'Task' : 'Tasks'}
                      </span>
                    </div>
                  </div>
                  
                  <ChevronDown className={`w-5 h-5 text-[var(--text-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[var(--primary)]' : ''}`} />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                        {dayTasks.length === 0 ? (
                          <div className="text-center py-6 text-sm text-[var(--text-muted)]">
                            No tasks scheduled for this day.
                          </div>
                        ) : (
                          dayTasks.map(task => {
                            const isCompleted = task.status === 'Completed';
                            return (
                              <div key={task.id} className={`flex items-start gap-4 p-3 rounded-lg hover:bg-[var(--surface-hover)] transition-colors group ${isCompleted ? 'opacity-60' : ''}`}>
                                <button 
                                  onClick={() => updateTask(task.id, { status: isCompleted ? 'Pending' : 'Completed' })}
                                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isCompleted 
                                      ? 'border-green-500 bg-green-500 text-white' 
                                      : 'border-[var(--border)] hover:border-[var(--primary)]'
                                  }`}
                                >
                                  {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                                </button>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className={`text-sm font-medium text-[var(--text-main)] truncate ${isCompleted ? 'line-through text-[var(--text-muted)]' : ''}`}>
                                      {task.subject}
                                    </h4>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                      task.priority === 'High' ? 'text-red-500 bg-red-50 dark:bg-red-900/20' :
                                      task.priority === 'Medium' ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' :
                                      'text-green-500 bg-green-50 dark:bg-green-900/20'
                                    }`}>
                                      {task.priority}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      <span>{task.time}</span>
                                    </div>
                                    {task.className && (
                                      <span className="text-purple-500 font-medium">{task.className}</span>
                                    )}
                                    {task.link && (
                                      <a 
                                        href={task.link.startsWith('http') ? task.link : `https://${task.link}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-[var(--primary)] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Link</span>
                                      </a>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className={`mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-2 ${isCompleted ? 'line-through' : ''}`}>
                                      {task.description}
                                    </p>
                                  )}
                                </div>

                                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <KebabMenu 
                                    items={[
                                      { label: 'Edit', onClick: () => setEditingTask(task) },
                                      { label: 'Delete', onClick: () => deleteTask(task.id), className: 'text-red-600 dark:text-red-400' }
                                    ]} 
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

        <div className="space-y-8">
          {/* Add Task Form */}
          <TaskForm onAdd={addTask} />
          
          {/* Tasks Section */}
          <div className="space-y-4">
            {/* Filter Tabs */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1">
              <div className="flex gap-1">
                {(['All', 'Today', 'Upcoming', 'Completed'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setFilter(f);
                      setSelectedDate(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all relative ${
                      filter === f && !selectedDate
                        ? 'text-[var(--primary)]' 
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {f}
                    {filter === f && !selectedDate && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-t-full" />
                    )}
                  </button>
                ))}
              </div>
              <span className="text-xs font-medium text-[var(--text-muted)] hidden sm:block">
                {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>

            {/* Task List */}
            {filteredTasks.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-16 text-center">
                 <div className="w-16 h-16 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-4">
                   <CalendarIcon className="w-8 h-8 text-[var(--text-muted)]" />
                 </div>
                 <h4 className="text-base font-medium text-[var(--text-main)]">No tasks found</h4>
                 <p className="text-sm text-[var(--text-secondary)] mt-1">
                   {selectedDate 
                     ? `No tasks scheduled for ${new Date(selectedDate).toLocaleDateString()}.`
                     : filter === 'All' 
                       ? "Add a task to get started!"
                       : `No ${filter.toLowerCase()} tasks.`}
                 </p>
               </div>
             ) : (
               <div className="space-y-2">
                 {filteredTasks.map(task => (
                   <TaskCard 
                     key={task.id} 
                     task={task} 
                     onUpdate={updateTask} 
                     onDelete={deleteTask} 
                     onEdit={setEditingTask}
                   />
                 ))}
               </div>
             )}
          </div>
        </div>
      </div>
      <EditTaskModal 
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onUpdate={updateTask}
      />
    </AppShell>
  );
}
