import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { ProjectActivity, SubActivity, ActivityStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const formSchema = z.object({
  name:        z.string().min(3, 'At least 3 characters'),
  description: z.string().optional(),
  startDate:   z.date({ required_error: 'Start date is required' }),
  endDate:     z.date({ required_error: 'End date is required' }),
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

const PRIORITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-green-100 text-green-700 border-green-200',
};

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

  const DateField = ({ name, label }: { name: 'startDate' | 'endDate' | 'dueDate'; label: string }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button variant="outline" className="pl-3 text-left font-normal h-9">
                  {field.value ? format(field.value as Date, 'd MMM yyyy') : <span className="text-muted-foreground">Pick a date</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 text-muted-foreground" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={field.value as Date | undefined} onSelect={field.onChange} initialFocus />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-5">
        {/* Name */}
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Activity Name *</FormLabel>
            <FormControl><Input placeholder="e.g. Data Collection Phase 1" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Status + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger className="h-9"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inProgress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="priority" render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger className="h-9"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="high"><span className="flex items-center gap-2"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${PRIORITY_COLORS.high}`}>High</Badge></span></SelectItem>
                  <SelectItem value="medium"><span className="flex items-center gap-2"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${PRIORITY_COLORS.medium}`}>Medium</Badge></span></SelectItem>
                  <SelectItem value="low"><span className="flex items-center gap-2"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${PRIORITY_COLORS.low}`}>Low</Badge></span></SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DateField name="startDate" label="Start Date *" />
          <DateField name="endDate"   label="End Date *" />
          <DateField name="dueDate"   label="Due Date (optional)" />
        </div>

        {/* Description */}
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea placeholder="Describe what this activity involves…" className="min-h-[100px] resize-none" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Sub-activities */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sub-activities</h3>
            <p className="text-xs text-muted-foreground">Optional smaller tasks</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Sub-activity name…"
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSub(); } }}
              className="h-8 text-sm"
            />
            <Select value={newSubStatus} onValueChange={v => setNewSubStatus(v as ActivityStatus)}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={handleAddSub}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {subActivities.length > 0 && (
            <div className="space-y-1.5">
              {subActivities.map(sub => (
                <Card key={sub.id} className="shadow-none border-border/50">
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{sub.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sub.status}</Badge>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSubActivities(prev => prev.filter(s => s.id !== sub.id))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" className="bg-[#0F2041] hover:bg-[#1D3461] text-white px-6">
            {isEditing ? 'Save Changes' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export { ActivityForm };
export default ActivityForm;
