import { useState } from 'react';
import { Plus, Trash2, CheckSquare, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useStageChecklist } from '@/hooks/useStageData';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  stageId: string;
  currentUserId?: string;
  canEdit: boolean;
}

export function StageChecklist({ projectId, stageId, currentUserId, canEdit }: Props) {
  const { toast } = useToast();
  const { items, doneCount, totalCount, addItem, toggleItem, deleteItem, isAdding } =
    useStageChecklist(projectId, stageId);

  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    try {
      await addItem(text, currentUserId);
      setNewText('');
    } catch {
      toast({ title: 'Failed to add item', variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    try {
      await toggleItem(id, completed, currentUserId);
    } catch {
      toast({ title: 'Failed to update item', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
    } catch {
      toast({ title: 'Failed to delete item', variant: 'destructive' });
    }
  };

  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <CheckSquare className="h-3.5 w-3.5" />
          Checklist
          {totalCount > 0 && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0 ml-1',
                pct === 100
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
              )}
            >
              {doneCount}/{totalCount}
            </Badge>
          )}
        </div>
        {canEdit && !adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Item
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full rounded-full bg-muted h-1.5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              pct === 100 ? 'bg-emerald-500' : 'bg-[#1D3461]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 group">
            <button
              type="button"
              onClick={() => handleToggle(item.id, !item.completed)}
              className="flex-shrink-0 text-muted-foreground hover:text-[#1D3461] transition-colors"
            >
              {item.completed ? (
                <CheckSquare className="h-4 w-4 text-emerald-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <span
              className={cn(
                'flex-1 text-sm',
                item.completed && 'line-through text-muted-foreground',
              )}
            >
              {item.itemText}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      {adding && (
        <div className="flex gap-2">
          <Input
            placeholder="New checklist item..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewText(''); }
            }}
            className="h-8 text-sm flex-1"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8 px-3 bg-[#1D3461] hover:bg-[#0F2041] text-white"
            onClick={handleAdd}
            disabled={isAdding || !newText.trim()}
          >
            {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3"
            onClick={() => { setAdding(false); setNewText(''); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">No checklist items yet</p>
      )}
    </div>
  );
}
