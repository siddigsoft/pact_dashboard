
import React, { useState } from 'react';
import { Edit, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/use-toast';
import MMPOverallInformation from '@/components/MMPOverallInformation';
import { MMPFile } from '@/types';

interface MMPBasicInfoProps {
  mmpFile: MMPFile;
  onUpdateMMP: (id: string, updatedData: Partial<MMPFile>) => void;
}

interface SiteEditFormValues {
  name: string;
  description: string;
  mmpId: string;
  entries: number;
}

const MMPBasicInfo: React.FC<MMPBasicInfoProps> = ({ mmpFile, onUpdateMMP }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  // Set up form with default values
  const form = useForm<SiteEditFormValues>({
    defaultValues: {
      name: mmpFile?.name || '',
      description: mmpFile?.description || '',
      mmpId: mmpFile?.mmpId || '',
      entries: mmpFile?.entries || 0
    }
  });

  const handleToggleEdit = () => {
    if (isEditing) {
      // If we're exiting edit mode without saving, reset the form
      form.reset({
        name: mmpFile?.name || '',
        description: mmpFile?.description || '',
        mmpId: mmpFile?.mmpId || '',
        entries: mmpFile?.entries || 0
      });
    }
    setIsEditing(!isEditing);
  };

  const onSubmit = (data: SiteEditFormValues) => {
    if (mmpFile.id) {
      const updatedMMP = {
        ...mmpFile,
        name: data.name,
        description: data.description,
        mmpId: data.mmpId,
        entries: data.entries
      };
      
      onUpdateMMP(mmpFile.id, updatedMMP);
      setIsEditing(false);
      
      toast({
        title: "MMP Updated",
        description: "The MMP information has been successfully updated."
      });
    }
  };

  return (
    <>
      {isEditing ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border p-4 rounded-md">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MMP Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="mmpId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MMP ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="entries"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Entries</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" type="button" onClick={handleToggleEdit}>Cancel</Button>
              <Button type="submit" className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <>
          {mmpFile && <MMPOverallInformation mmpFile={mmpFile} editable={false} />}
          
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={handleToggleEdit}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Quick Edit
            </Button>
          </div>
        </>
      )}
    </>
  );
};

export default MMPBasicInfo;
