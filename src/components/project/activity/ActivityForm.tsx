import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X, CalendarIcon, Info, ListChecks, Tag, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { ProjectActivity, SubActivity, ActivityStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const formSchema = z.object({
  name:        z.string().min(3, 'At least 3 characters'),
  description: z.string().optional(),
  startDate:   z.date({ required_error: 'Required' }),
  endDate:     z.date({ required_error: 'Required' }),
  dueDate:     z.date().optional(),
  status:      z.enum(['pending', 'inProgress', 'completed', 'cancelled']),
  priority:    z.enum(['low', 'medium', 'high']),
  isActive:    z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface ActivityFormProps {
  projectId?: string;
  onSubmit: (activity: ProjectActivity) => void;
  initialData?: ProjectActivity;
  isEditing?: boolean;
  onCancel?: () => void;
}

const STATUS_CFG = {
  pending:    { label: 'Pending',     dot: 'bg-slate-400' },
  inProgress: { label: 'In Progress', dot: 'bg-blue-500' },
  completed:  { label: 'Completed',   dot: 'bg-emerald-500' },
  cancelled:  { label: 'Cancelled',   dot: 'bg-rose-500' },
};

const PRIORITY_CFG = {
  high:   { label: 'High',   cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400' },
  low:    { label: 'Low',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' },
};

const SectionHeader = ({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) => (
  <div className="flex items-center gap-2 pb-1 border-b border-border/60 mb-3">
    <div className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary shrink-0">
      <Icon className="h-3 w-3" />
    </div>
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    {hint && <span className="ml-auto text-[10px] text-muted-foreground/70 italic">{hint}</span>}
  </div>
);

const ActivityForm = ({ onSubmit, initialData, isEditing = false, onCancel }: ActivityFormProps) => {
  const [subActivities, setSubActivities] = useState<SubActivity[]>(initialData?.subActivities || []);
  const [newSubName, setNewSubName] = useState('');
  const [newSubStatus, setNewSubStatus] = useState<ActivityStatus>('pending');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name:        initialData?.name || '',
      description: initialData?.description || '',
      startDate:   initialData?.startDate ? new Date(initialData.startDate) : new Date(),
      endDate:     initialData?.endDate   ? new Date(initialData.endDate)   : new Date(),
      dueDate:     initialData?.dueDate   ? new Date(initialData.dueDate)   : undefined,
      status:      (initialData?.status as FormValues['status']) || 'pending',
      priority:    (initialData?.priority as FormValues['priority']) || 'medium',
      isActive:    true,
    },
  });

  const handleAddSub = () => {
    if (!newSubName.trim()) return;
    setSubActivities(prev => [...prev, { id: `new-sub-${Date.now()}`, name: newSubName.trim(), status: newSubStatus, isActive: true }]);
    setNewSubName('');
    setNewSubStatus('pending');
  };

  const handleFormSubmit = (values: FormValues) => {
    const activity: ProjectActivity = {
      id:           initialData?.id || `new-${Date.now()}`,
      name:         values.name,
      description:  values.description,
      startDate:    values.startDate.toISOString().split('T')[0],
      endDate:      values.endDate.toISOString().split('T')[0],
      dueDate:      values.dueDate ? values.dueDate.toISOString().split('T')[0] : undefined,
      status:       values.status,
      priority:     values.priority,
      progress:     initialData?.progress ?? 0,
      isActive:     values.isActive,
      subActivities,
    };
    onSubmit(activity);
  };

  const DateField = ({ name, label, optional }: { name: 'startDate' | 'endDate' | 'dueDate'; label: string; optional?: boolean }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col gap-0.5">
          <FormLabel className="text-xs text-muted-foreground font-medium">
            {label}{optional && <span className="ml-1 text-[10px] opacity-60">(optional)</span>}
          </FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  className={cn(
                    'h-8 pl-2.5 pr-2 text-left text-xs font-normal justify-between',
                    !field.value && 'text-muted-foreground'
                  )}
                >
                  {field.value ? format(field.value as Date, 'd MMM yyyy') : 'Pick a date'}
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={field.value as Date | undefined} onSelect={field.onChange} initialFocus />
            </PopoverContent>
          </Popover>
          <FormMessage className="text-[10px]" />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">

        {/* ── Section 1: Basic Info ── */}
        <div>
          <SectionHeader icon={Info} title="Basic Information" hint="Required fields are marked *" />
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium">Activity Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Data Collection Phase 1"
                  className="h-8 text-sm"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-[10px]" />
            </FormItem>
          )} />

          <div className="mt-2.5">
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium">
                  Description
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground/70">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Briefly describe what this activity involves, its goals, and any key dependencies…"
                    className="min-h-[62px] max-h-[100px] text-xs resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
          </div>
        </div>

        {/* ── Section 2: Status & Priority ── */}
        <div>
          <SectionHeader icon={Tag} title="Classification" />
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium">Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(STATUS_CFG).map(([v, c]) => (
                      <SelectItem key={v} value={v}>
                        <span className="flex items-center gap-2 text-xs">
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />

            <FormField control={form.control} name="priority" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium">Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue>
                        {field.value && (
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border font-medium', PRIORITY_CFG[field.value as keyof typeof PRIORITY_CFG]?.cls)}>
                            {PRIORITY_CFG[field.value as keyof typeof PRIORITY_CFG]?.label}
                          </Badge>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(PRIORITY_CFG).map(([v, c]) => (
                      <SelectItem key={v} value={v}>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border font-medium', c.cls)}>{c.label}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
          </div>
        </div>

        {/* ── Section 3: Timeline ── */}
        <div>
          <SectionHeader icon={Clock} title="Timeline" hint="Set the activity window and optional deadline" />
          <div className="grid grid-cols-3 gap-3">
            <DateField name="startDate" label="Start Date *" />
            <DateField name="endDate"   label="End Date *" />
            <DateField name="dueDate"   label="Due Date" optional />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/70 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            Due Date is the internal deadline; it can differ from the End Date if reviews or approvals are needed before close.
          </p>
        </div>

        {/* ── Section 4: Sub-activities ── */}
        <div>
          <SectionHeader icon={ListChecks} title="Sub-activities" hint="Optional — press Enter or + to add" />

          {/* Add row */}
          <div className="flex gap-1.5 items-center">
            <Input
              placeholder="Sub-activity name…"
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSub(); } }}
              className="h-7 text-xs flex-1"
            />
            <Select value={newSubStatus} onValueChange={v => setNewSubStatus(v as ActivityStatus)}>
              <SelectTrigger className="w-28 h-7 text-[11px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleAddSub}
              data-testid="button-add-subactivity"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Sub-activity list */}
          {subActivities.length > 0 ? (
            <div className="mt-2 space-y-1 max-h-[130px] overflow-y-auto pr-0.5">
              {subActivities.map((sub, idx) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-border/50 bg-muted/30 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-muted-foreground/60 font-mono w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-xs truncate">{sub.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                      sub.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' :
                      sub.status === 'inProgress' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    )}>
                      {STATUS_CFG[sub.status as keyof typeof STATUS_CFG]?.label ?? sub.status}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => setSubActivities(prev => prev.filter(s => s.id !== sub.id))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground/60 text-center py-2 border border-dashed border-border/40 rounded-md">
              No sub-activities added yet. Break this activity into smaller tasks above.
            </p>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground/60">
            {subActivities.length > 0 ? `${subActivities.length} sub-activit${subActivities.length === 1 ? 'y' : 'ies'} added` : 'All fields can be edited after creation'}
          </p>
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs px-5 bg-[#0F2041] hover:bg-[#1D3461] text-white"
              data-testid="button-submit-activity"
            >
              {isEditing ? 'Save Changes' : 'Create Activity'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export { ActivityForm };
export default ActivityForm;
