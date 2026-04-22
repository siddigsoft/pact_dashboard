import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useState, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Code, Minus, CheckSquare, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

const SLASH_COMMANDS = [
  { key: 'h1',     label: 'Heading 1',  icon: Heading1,    apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2',     label: 'Heading 2',  icon: Heading2,    apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'ul',     label: 'Bullet List', icon: List,       apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBulletList().run() },
  { key: 'ol',     label: 'Numbered List', icon: ListOrdered, apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleOrderedList().run() },
  { key: 'task',   label: 'Checklist',  icon: CheckSquare, apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleTaskList().run() },
  { key: 'quote',  label: 'Quote',      icon: Quote,       apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBlockquote().run() },
  { key: 'code',   label: 'Code Block', icon: Code,        apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleCodeBlock().run() },
  { key: 'hr',     label: 'Separator',  icon: Minus,       apply: (e: ReturnType<typeof useEditor>) => e?.chain().focus().setHorizontalRule().run() },
];

export function TaskRichEditor({ value, onChange, placeholder = "Type '/' for commands, or just write…", minHeight = 200, className }: Props) {
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: true, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none px-4 py-3',
          'prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg',
          'prose-table:border prose-td:border prose-td:border-slate-200 prose-td:p-2 prose-td:align-top',
          'prose-hr:my-4 prose-hr:border-slate-300',
          // Force list styling — Tailwind preflight resets ul/ol to list-style:none
          'tiptap-content',
        ),
        style: `min-height: ${minHeight}px;`,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === '/' && !showSlash) {
          setTimeout(() => {
            const rect = containerRef.current?.getBoundingClientRect();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && rect) {
              const r = sel.getRangeAt(0).getBoundingClientRect();
              setSlashPos({ top: r.bottom - rect.top + 4, left: r.left - rect.left });
            }
            setSlashFilter('');
            setShowSlash(true);
          }, 0);
          return false;
        }
        if (showSlash) {
          if (event.key === 'Escape') { setShowSlash(false); return true; }
          if (event.key === 'Backspace' && slashFilter === '') { setShowSlash(false); return false; }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      // Track slash filter
      if (showSlash) {
        const { from } = editor.state.selection;
        const text = editor.state.doc.textBetween(Math.max(0, from - 20), from, '\n');
        const m = text.match(/\/([\w]*)$/);
        if (m) setSlashFilter(m[1]); else setShowSlash(false);
      }
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filteredCmds = SLASH_COMMANDS.filter(c => !slashFilter || c.label.toLowerCase().includes(slashFilter.toLowerCase()));

  const applyCommand = (cmd: typeof SLASH_COMMANDS[number]) => {
    if (!editor) return;
    // Remove the slash + filter chars
    const { from } = editor.state.selection;
    const deleteFrom = from - (slashFilter.length + 1);
    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
    cmd.apply(editor);
    setShowSlash(false);
  };

  if (!editor) return null;

  return (
    <div ref={containerRef} className={cn('relative border border-slate-200 rounded-xl bg-white', className)} data-testid="task-rich-editor">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 className="w-3.5 h-3.5" /></ToolbarBtn>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Checklist"><CheckSquare className="w-3.5 h-3.5" /></ToolbarBtn>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code"><Code className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separator"><Minus className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => {
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }} title="Link"><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <span className="ml-auto text-[10px] text-slate-400 px-2">Type <kbd className="px-1 py-0.5 bg-white border rounded text-[9px]">/</kbd> for commands</span>
      </div>
      <EditorContent editor={editor} />

      {/* Slash menu */}
      {showSlash && slashPos && filteredCmds.length > 0 && (
        <div
          className="absolute z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{ top: slashPos.top, left: slashPos.left }}
          data-testid="slash-menu"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-bold text-slate-400 border-b">Insert</div>
          {filteredCmds.map(cmd => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.key}
                type="button"
                onClick={() => applyCommand(cmd)}
                onMouseDown={(e) => e.preventDefault()}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left text-sm text-slate-700"
                data-testid={`slash-cmd-${cmd.key}`}
              >
                <Icon className="w-4 h-4 text-slate-500" />
                <span>{cmd.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn('w-7 h-7 rounded flex items-center justify-center transition-colors',
        active ? 'bg-[#1D3461] text-white' : 'text-slate-600 hover:bg-slate-200')}
    >
      {children}
    </button>
  );
}
