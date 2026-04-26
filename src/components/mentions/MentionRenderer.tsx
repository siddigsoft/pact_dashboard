import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface MentionRendererProps {
  content: string;
  currentUserId?: string;
  className?: string;
}

const PATTERN = /@\[([^\]]+)\]\(([a-f0-9\-]+)\)/g;

export function MentionRenderer({ content, currentUserId, className }: MentionRendererProps) {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PATTERN.exec(content)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<Fragment key={key++}>{content.slice(lastIdx, match.index)}</Fragment>);
    }
    const name = match[1];
    const id = match[2];
    const isMe = currentUserId === id;
    parts.push(
      <span
        key={key++}
        className={cn(
          'inline-flex items-center px-1 py-0.5 rounded font-medium text-[0.95em]',
          isMe
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'
        )}
        data-testid={`mention-${id}`}
        title={isMe ? 'You were mentioned' : name}
      >
        @{name}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < content.length) {
    parts.push(<Fragment key={key++}>{content.slice(lastIdx)}</Fragment>);
  }

  return <span className={cn('whitespace-pre-wrap break-words', className)}>{parts}</span>;
}
