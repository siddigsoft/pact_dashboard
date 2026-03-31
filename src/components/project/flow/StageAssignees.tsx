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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStageAssignees } from '@/hooks/useStageData';

interface Props {
  projectId: string;
  stageId: string;
  stageLabel?: string;
  projectName?: string;
  currentUserId?: string;
  assignedByName?: string;
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

async function sendAssignmentNotification(
  assigneeId: string,
  assigneeName: string,
  stageLabel: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
) {
  const titleEn = `You've been assigned to a stage`;
  const titleAr = `تم تعيينك في مرحلة`;
  const msgEn = `${assignedByName} assigned you to "${stageLabel}" in project "${projectName}"`;
  const msgAr = `قام ${assignedByName} بتعيينك في "${stageLabel}" في مشروع "${projectName}"`;

  await supabase.from('notifications').insert({
    recipient_id: assigneeId,
    user_id: assigneeId,
    title_en: titleEn,
    title_ar: titleAr,
    message_en: msgEn,
    message_ar: msgAr,
    priority: 'normal',
    action_url: `/projects/${projectId}`,
    entity_id: projectId,
    entity_type: 'project',
    event_type: 'project_stage_assigned',
    status: 'pending',
    email_sent: false,
  });
}

export function StageAssignees({
  projectId, stageId, stageLabel = 'Stage', projectName = 'Project',
  currentUserId, assignedByName = 'A manager', canEdit,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { assignees, addAssignee, removeAssignee, isAdding, isRemoving } =
    useStageAssignees(projectId, stageId);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: searchResults = [] } = useProfileSearch(search);

  const handleAdd = async (userId: string, userName: string) => {
    if (assignees.some(a => a.userId === userId)) {
      toast({ title: 'Already assigned', variant: 'destructive' });
      return;
    }
    try {
      await addAssignee(userId);
      // Invalidate the all-assignees cache so the card header updates
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
      // Notify the assignee (skip if assigning yourself)
      if (userId !== currentUserId) {
        sendAssignmentNotification(
          userId, userName, stageLabel, projectName, projectId, assignedByName,
        ).catch(() => {});
      }
      toast({ title: `${userName} assigned to "${stageLabel}"` });
      setSearch('');
      setOpen(false);
    } catch {
      toast({ title: 'Failed to add assignee', variant: 'destructive' });
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeAssignee(id);
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
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
                <UserPlus className="h-3 w-3 mr-1" /> Assign
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                Assign to "{stageLabel}"
              </p>
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
                {search.length < 2 && (
                  <p className="text-[10px] text-muted-foreground px-2 py-1">Type at least 2 characters…</p>
                )}
                {searchResults.map((p: any) => {
                  const alreadyAssigned = assignees.some(a => a.userId === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${alreadyAssigned ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted'}`}
                      onClick={() => !alreadyAssigned && handleAdd(p.id, p.full_name)}
                      disabled={isAdding || alreadyAssigned}
                    >
                      <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {p.full_name?.charAt(0) ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.full_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate capitalize">{p.role?.replace(/_/g, ' ')}</p>
                      </div>
                      {alreadyAssigned && (
                        <span className="text-[9px] text-emerald-600 font-medium flex-shrink-0">✓ Assigned</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {assignees.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No assignees — click Assign to add team members</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2 py-0.5"
              title={`${a.fullName} · ${a.role?.replace(/_/g, ' ')}`}
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
                  title="Remove assignee"
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
