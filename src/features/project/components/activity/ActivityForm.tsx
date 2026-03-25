import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X, CircleCheck, CircleX } from 'lucide-react';
import { format } from 'date-fns';

import { ProjectActivity, SubActivity, ActivityStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const formSchema = z.object({
  name: z.string().min(3, 'Activity name must be at least 3 characters'),
  description: z.string().optional(),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  status: z.enum(['pending', 'inProgress', 'completed', 'cancelled']),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface ActivityFormProps {
  projectId?: string;
  onSubmit: (activity: ProjectActivity) => void;
  initialData?: ProjectActivity;
  isEditing?: boolean;
  onCancel?: () => void;
  projectType?: string;
}

const ActivityForm: React.FC<ActivityFormProps> = ({
  projectId,
  onSubmit,
  initialData,
  isEditing = false,
  onCancel,
  projectType,
}) => {
  const [subActivities, setSubActivities] = useState<SubActivity[]>(
    initialData?.subActivities || []
  );
  
  const [newSubActivity, setNewSubActivity] = useState<{
    name: string;
    status: ActivityStatus;
    isActive: boolean;
  }>({
    name: '',
    status: 'pending',
    isActive: true,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      startDate: initialData?.startDate ? new Date(initialData.startDate) : new Date(),
      endDate: initialData?.endDate ? new Date(initialData.endDate) : new Date(),
      status: initialData?.status || 'pending',
      isActive: true,
    },
  });

  const handleAddSubActivity = () => {
    if (newSubActivity.name.trim() === '') return;
    
    const newSub: SubActivity = {
      id: `new-sub-${Date.now()}`,
      name: newSubActivity.name,
      status: newSubActivity.status,
      isActive: newSubActivity.isActive,
    };
    
    setSubActivities([...subActivities, newSub]);
    setNewSubActivity({
      name: '',
      status: 'pending',
      isActive: true,
    });
  };

  const handleRemoveSubActivity = (id: string) => {
    setSubActivities(subActivities.filter(sub => sub.id !== id));
  };

  const handleFormSubmit = (values: FormValues) => {
    const activity: ProjectActivity = {
      id: initialData?.id || `new-${Date.now()}`,
      name: values.name,
      description: values.description,
      startDate: values.startDate.toISOString().split('T')[0],
      endDate: values.endDate.toISOString().split('T')[0],
      status: values.status,
      isActive: values.isActive,
      subActivities: subActivities,
    };
    
    onSubmit(activity);
  };

  const getStatusBadge = (status: ActivityStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'inProgress':
        return <Badge variant="secondary">In Progress</Badge>;
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Name*</FormLabel>
                <FormControl>
                  <Input placeholder="Enter activity name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Status</FormLabel>
                <div className="flex items-center space-x-2">
                  <Toggle
                    pressed={field.value}
                    onPressedChange={field.onChange}
                    className="data-[state=on]:bg-primary"
                  >
                    {field.value ? (
                      <div className="flex items-center">
                        <CircleCheck className="h-4 w-4 mr-2 text-green-500" />
                        Active
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <CircleX className="h-4 w-4 mr-2 text-red-500" />
                        Not Active
                      </div>
                    )}
                  </Toggle>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="inProgress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className="pl-3 text-left font-normal"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className="pl-3 text-left font-normal"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Enter activity description" 
                  className="min-h-[120px]" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Sub-activities</h3>
            <p className="text-sm text-muted-foreground">
              Add smaller tasks within this activity
            </p>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Enter sub-activity name"
                value={newSubActivity.name}
                onChange={(e) => setNewSubActivity({...newSubActivity, name: e.target.value})}
              />
            </div>
            <Select
              value={newSubActivity.status}
              onValueChange={(value) => setNewSubActivity({...newSubActivity, status: value as ActivityStatus})}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              type="button" 
              variant="secondary"
              onClick={handleAddSubActivity}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
          
          {subActivities.length > 0 ? (
            <div className="grid gap-2 mt-2">
              {subActivities.map((subActivity) => (
                <Card key={subActivity.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span>{subActivity.name}</span>
                      {getStatusBadge(subActivity.status)}
                      <Toggle
                        pressed={subActivity.isActive}
                        onPressedChange={(active) => {
                          setSubActivities(subActivities.map(sub => 
                            sub.id === subActivity.id 
                              ? { ...sub, isActive: active }
                              : sub
                          ));
                        }}
                        className="data-[state=on]:bg-primary"
                      >
                        {subActivity.isActive ? (
                          <div className="flex items-center">
                            <CircleCheck className="h-4 w-4 mr-2 text-green-500" />
                            Active
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <CircleX className="h-4 w-4 mr-2 text-red-500" />
                            Not Active
                          </div>
                        )}
                      </Toggle>
                    </div>
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveSubActivity(subActivity.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic py-2">
              No sub-activities added yet
            </p>
          )}
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="px-6">
            {isEditing ? 'Update Activity' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export { ActivityForm };
export default ActivityForm;
