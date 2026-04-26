import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ProfileLite {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
}

export interface MentionTextareaHandle {
  focus: () => void;
  clear: () => void;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string, mentionIds: string[]) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
  excludeUserIds?: string[];
}

const MENTION_PATTERN = /@\[([^\]]+)\]\(([a-f0-9\-]+)\)/g;

export function extractMentionIds(content: string): string[] {
  const ids: string[] = [];
  let match;
  const regex = new RegExp(MENTION_PATTERN.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    ids.push(match[2]);
  }
  return Array.from(new Set(ids));
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(
  function MentionTextarea(
    { value, onChange, onSubmit, placeholder, rows = 3, className, disabled, excludeUserIds, ...rest },
    ref
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const [atPos, setAtPos] = useState<number | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => taRef.current?.focus(),
      clear: () => onChange(''),
    }));

    const { data: profiles = [], isLoading } = useQuery<ProfileLite[]>({
      queryKey: ['/profiles/mentionable'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('is_active', true)
          .order('full_name', { ascending: true });
        if (error) throw error;
        return (data ?? []) as ProfileLite[];
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    });

    const excluded = new Set(excludeUserIds ?? []);
    const filtered = profiles
      .filter((p) => !excluded.has(p.id))
      .filter((p) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          p.full_name?.toLowerCase().includes(q) ||
          (p.email ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);

    useEffect(() => {
      if (activeIdx >= filtered.length) setActiveIdx(0);
    }, [filtered.length, activeIdx]);

    const updateQueryFromCaret = useCallback(
      (text: string, caret: number) => {
        for (let i = caret - 1; i >= 0; i--) {
          const ch = text[i];
          if (ch === '@') {
            const before = i === 0 ? ' ' : text[i - 1];
            if (before === ' ' || before === '\n' || i === 0) {
              const q = text.slice(i + 1, caret);
              if (/^[\w\u0600-\u06FF\.\-\s]{0,40}$/.test(q)) {
                setAtPos(i);
                setQuery(q);
                setOpen(true);
                setActiveIdx(0);
                return;
              }
            }
            break;
          }
          if (ch === ' ' || ch === '\n') break;
        }
        setOpen(false);
        setAtPos(null);
        setQuery('');
      },
      []
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      const caret = e.target.selectionStart ?? next.length;
      updateQueryFromCaret(next, caret);
    };

    const handleSelect = useCallback(
      (e?: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const ta = (e?.currentTarget as HTMLTextAreaElement | undefined) ?? taRef.current;
        if (!ta) return;
        const caret = ta.selectionStart ?? value.length;
        updateQueryFromCaret(value, caret);
      },
      [value, updateQueryFromCaret]
    );

    const insertMention = useCallback(
      (profile: ProfileLite) => {
        if (atPos === null || !taRef.current) return;
        const ta = taRef.current;
        const caret = ta.selectionStart ?? value.length;
        const token = `@[${profile.full_name}](${profile.id}) `;
        const next = value.slice(0, atPos) + token + value.slice(caret);
        onChange(next);
        setOpen(false);
        setAtPos(null);
        setQuery('');
        const newCaret = atPos + token.length;
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(newCaret, newCaret);
        });
      },
      [atPos, value, onChange]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open && filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % filtered.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(filtered[activeIdx]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
          setAtPos(null);
          return;
        }
      }
      if (!open && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault();
        onSubmit(value, extractMentionIds(value));
      }
    };

    return (
      <div className="relative w-full">
        <Textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={cn('resize-none', className)}
          {...rest}
        />
        {open && (
          <div
            ref={listRef}
            className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
            data-testid="mention-picker"
          >
            {isLoading ? (
              <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No matches for "{query}"
              </div>
            ) : (
              filtered.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertMention(p)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center gap-2 text-xs',
                    idx === activeIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                  )}
                  data-testid={`mention-option-${p.id}`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                    {(p.full_name ?? '?').split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{p.full_name}</span>
                    {p.role && (
                      <span className="block text-[10px] text-muted-foreground truncate">{p.role}</span>
                    )}
                  </span>
                </button>
              ))
            )}
            <div className="border-t px-3 py-1 text-[10px] text-muted-foreground bg-muted/50">
              ↑↓ navigate · Enter/Tab select · Esc cancel
            </div>
          </div>
        )}
      </div>
    );
  }
);
