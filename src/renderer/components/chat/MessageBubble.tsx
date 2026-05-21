import { useMemo } from 'react';
import { Bot, User, ChevronDown, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeInUp, smoothTransition } from '@/lib/motion';
import { useState } from 'react';
import type { Message } from './types';

function parseThinking(text: string): { thinking: string | null; content: string } {
  const thinkOpenTags = ['<think>'];
  const thinkCloseTags = ['</think>'];

  for (let i = 0; i < thinkOpenTags.length; i++) {
    const open = thinkOpenTags[i];
    const close = thinkCloseTags[i];
    const startIdx = text.indexOf(open);
    if (startIdx === -1) continue;
    const endIdx = text.indexOf(close, startIdx + open.length);
    if (endIdx === -1) continue;
    const thinking = text.slice(startIdx + open.length, endIdx).trim();
    const after = text.slice(endIdx + close.length).trim();
    return { thinking, content: after };
  }
  return { thinking: null, content: text };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time;
}

export default function MessageBubble({ message }: { message: Message }) {
  const { thinking, content } = useMemo(() => parseThinking(message.content), [message.content]);
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={smoothTransition}
      className={cn('flex items-start gap-3', isUser ? 'flex-row-reverse' : '')}
    >
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
        isUser
          ? 'bg-primary/10 text-primary'
          : 'bg-primary text-primary-foreground'
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={cn(
            'px-4 py-3 rounded-2xl group relative',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-[var(--surface)] border border-[hsl(var(--border))]'
          )}
        >
          {/* Thinking chain */}
          {thinking && (
            <details className="mb-3 group/details">
              <summary className="flex items-center gap-1 cursor-pointer text-sm opacity-60 hover:opacity-100 select-none">
                <ChevronDown size={14} className="transition-transform group-open/details:rotate-180" />
                <span className="font-medium">Thinking...</span>
              </summary>
              <div className="mt-2 pl-3 border-l-2 border-[hsl(var(--border))] text-sm opacity-70 whitespace-pre-wrap">
                {thinking}
              </div>
            </details>
          )}

          {/* Main content */}
          {isUser ? (
            <div className="whitespace-pre-wrap text-sm">{content}</div>
          ) : (
            <div className="markdown prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}

          {/* Copy button - hover to show */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              title="复制"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
        {message.timestamp && (
          <span className={cn('text-xs opacity-40 px-1', isUser ? 'text-right' : 'text-left')}>
            {formatTimestamp(message.timestamp)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
