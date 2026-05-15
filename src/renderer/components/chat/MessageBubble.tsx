import { useMemo } from 'react';
import { Bot, User, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeInUp, smoothTransition } from '@/lib/motion';
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

export default function MessageBubble({ message }: { message: Message }) {
  const { thinking, content } = useMemo(() => parseThinking(message.content), [message.content]);
  const isUser = message.role === 'user';

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
      <div
        className={cn(
          'max-w-[80%] px-4 py-3 rounded-2xl',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-[var(--surface)] border border-[hsl(var(--border))]'
        )}
      >
        {/* Thinking chain */}
        {thinking && (
          <details className="mb-3 group">
            <summary className="flex items-center gap-1 cursor-pointer text-sm opacity-60 hover:opacity-100 select-none">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
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
      </div>
    </motion.div>
  );
}
