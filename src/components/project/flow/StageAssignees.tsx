import { useState } from 'react';
import { UserPlus, X, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStageAssignees } from '@/hooks/useStageData';

interface Props {
  projectId: string;
  stageId: string;
  currentUserId?: string;
  canEdit: boolean;
}

function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ['profile_search', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('status', 'approved')
        .ilike('full_name', `%${query}%`)
        .limit(8);
      return data ?? [];
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

export function StageAssignees({ projectId, stageId, currentUserId, canEdit }: Props) {
  const { toast } = useToast();
  const { assignees, addAssignee, removeAssignee, isAdding, isRemoving } =
    useStageAssignees(projectId, stageId);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: searchResults = [] } = useProfileSearch(search);

  const handleAdd = async (userId: string) => {
    if (assignees.some(a => a.userId === userId)) {
      toast({ title: 'Already assigned', variant: 'destructive' });
      return;
    }
    try {
      await addAssignee(userId);
      toast({ title: 'Assignee added' });
      setSearch('');
      setOpen(false);
    } catch {
      toast({ title: 'Failed to add assignee', variant: 'destructive' });
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeAssignee(id);
    } catch {
      toast({ title: 'Failed to remove assignee', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Users className="h-3.5 w-3.5" />
          Assignees
          {assignees.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {assignees.length}
            </Badge>
          )}
        </div>
        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                <UserPlus className="h-3 w-3 mr-1" /> Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <Input
                placeholder="Search staff by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm mb-2"
                autoFocus
              />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {searchResults.length === 0 && search.length >= 2 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">No results</p>
                )}
                {searchResults.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-muted text-sm"
                    onClick={() => handleAdd(p.id)}
                    disabled={isAdding}
                  >
                    <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {p.full_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate capitalize">{p.role?.replace(/_/g, ' ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {assignees.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No assignees yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2 py-0.5"
            >
              <div className="h-5 w-5 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[9px] font-bold">
                {a.fullName.charAt(0)}
              </div>
              <span className="text-xs font-medium">{a.fullName}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  disabled={isRemoving}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
