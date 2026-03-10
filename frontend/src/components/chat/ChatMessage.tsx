import React from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Check, Volume2, Square, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '../../lib/api';

interface ChatMessageProps {
  message: ChatMessageType;
  isSpeaking: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
}

export default function ChatMessage({ message, isSpeaking, onSpeak, onStopSpeak }: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group flex w-full gap-4 px-4 py-6 ${isUser ? 'flex-row-reverse' : 'flex-row'} hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border ${
        isUser 
          ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300' 
          : 'bg-violet-600 dark:bg-violet-700 border-transparent text-white'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={18} />}
      </div>

      <div className={`flex flex-col max-w-[85%] lg:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Name & Time (Optional, could add later) */}
        <div className={`mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'You' : 'Notescape AI'}
        </div>

        {/* Message Content */}
        <div className={`relative text-sm leading-relaxed ${
          isUser 
            ? 'text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-5 py-3.5 rounded-2xl rounded-tr-sm' 
            : 'text-zinc-900 dark:text-zinc-100 w-full max-w-none'
        }`}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert 
              prose-p:leading-relaxed prose-p:my-2
              prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100
              prose-strong:font-bold prose-strong:text-violet-600 dark:prose-strong:text-violet-400
              prose-a:text-violet-600 dark:prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline 
              prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none 
              prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-pre:p-3 prose-pre:rounded-xl
              prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4
              prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4
              prose-li:my-0.5"
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          
          {/* Selected Text Context */}
          {message.selected_text && (
            <div className={`mt-4 text-xs p-3 rounded-xl border ${
              isUser 
                ? 'bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-zinc-700' 
                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
            }`}>
              <div className="flex items-center gap-1.5 mb-1.5 text-zinc-500 dark:text-zinc-400 font-medium text-[10px] uppercase tracking-wider">
                <FileText size={10} />
                Context Reference
              </div>
              <div className="italic text-zinc-600 dark:text-zinc-300 border-l-2 border-violet-500/30 pl-3 py-0.5">
                "{message.selected_text}"
              </div>
            </div>
          )}

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className={`mt-4 pt-3 border-t border-dashed ${
              isUser ? 'border-zinc-300 dark:border-zinc-700' : 'border-zinc-200 dark:border-zinc-800'
            }`}>
              <div className="flex flex-wrap gap-2">
                {message.citations.slice(0, 3).map((c: any, i: number) => (
                  <div 
                    key={i} 
                    className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1.5 max-w-[220px] transition-colors cursor-default border ${
                      isUser 
                        ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400' 
                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-violet-300 dark:hover:border-violet-700'
                    }`}
                    title={c.filename}
                  >
                    <span className="opacity-70">📄</span>
                    <span className="truncate font-medium">{c.filename}</span>
                    {c.page_start && <span className="opacity-50 border-l border-zinc-300 dark:border-zinc-700 pl-1.5 ml-0.5">p.{c.page_start}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar (Copy/Speak) */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-xs"
              title="Copy to clipboard"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              <span>Copy</span>
            </button>
            <button
              onClick={isSpeaking ? onStopSpeak : onSpeak}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs ${
                isSpeaking 
                  ? 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' 
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={isSpeaking ? "Stop reading" : "Read aloud"}
            >
              {isSpeaking ? <Square size={12} className="fill-current" /> : <Volume2 size={12} />}
              <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
