
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MMPStage } from "@/types";
import { useAppContext } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MMPStageChangeDialogProps {
  currentStage: MMPStage;
  mmpId: string;
  onStageChange: (newStage: MMPStage) => void;
}

const STAGE_ORDER: MMPStage[] = ['notStarted', 'draft', 'verified', 'implementation', 'completed'];

export function MMPStageChangeDialog({ currentStage, mmpId, onStageChange }: MMPStageChangeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<MMPStage>(currentStage);
  const [isUpdating, setIsUpdating] = useState(false);
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const canChangeStage = currentUser?.role === 'admin' || currentUser?.role === 'ict';
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage);
  const availableStages = STAGE_ORDER.slice(currentStageIndex);

  const handleStageChange = async () => {
    if (selectedStage === currentStage) {
      setOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      // Update the MMP stage in Supabase
      const result = await supabase
        .from('mmp_files')
        .update({
          workflow: {
            currentStage: selectedStage,
            lastUpdated: new Date().toISOString(),
            assignedTo: currentUser?.id || null,
            comments: `Stage changed from ${currentStage} to ${selectedStage}`
          }
        })
        .eq('id', mmpId);

      if (result.error) throw result.error;

      onStageChange(selectedStage);
      toast({
        description: `MMP stage updated to ${selectedStage}`,
      });
      setOpen(false);
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({
        title: "Error",
        description: "Failed to update MMP stage",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!canChangeStage) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-2">
          Change Stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change MMP Stage</DialogTitle>
          <DialogDescription>
            Select the new stage for this MMP. You can only move forward in the workflow.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <Select value={selectedStage} onValueChange={(value: MMPStage) => setSelectedStage(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select new stage" />
            </SelectTrigger>
            <SelectContent>
              {availableStages.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleStageChange} 
            disabled={isUpdating || selectedStage === currentStage}
          >
            {isUpdating ? 'Updating...' : 'Update Stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
