import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClassification } from '@/context/classification/ClassificationContext';
import type { ClassificationFeeStructure } from '@/types/classification';
import { Loader2, DollarSign } from 'lucide-react';

const feeStructureEditSchema = z.object({
  siteVisitBaseFeeCents: z.coerce
    .number()
    .min(0, 'Base fee must be positive')
    .max(100000000, 'Base fee too large'),
  complexityMultiplier: z.coerce
    .number()
    .min(1, 'Multiplier must be at least 1.0')
    .max(5, 'Multiplier cannot exceed 5.0'),
  changeNotes: z.string().min(5, 'Please explain the reason for this change').max(500),
});

type FeeStructureEditFormData = z.infer<typeof feeStructureEditSchema>;

interface FeeStructureEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeStructure: ClassificationFeeStructure;
}

export default function FeeStructureEditDialog({
  open,
  onOpenChange,
  feeStructure,
}: FeeStructureEditDialogProps) {
  const { updateFeeStructure } = useClassification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FeeStructureEditFormData>({
    resolver: zodResolver(feeStructureEditSchema),
    defaultValues: {
      siteVisitBaseFeeCents: feeStructure.siteVisitBaseFeeCents / 100, // Convert cents to SDG
      complexityMultiplier: feeStructure.complexityMultiplier,
      changeNotes: '',
    },
  });

  const handleSubmit = async (data: FeeStructureEditFormData) => {
    try {
      setIsSubmitting(true);

      await updateFeeStructure(feeStructure.id, {
        siteVisitBaseFeeCents: Math.round(data.siteVisitBaseFeeCents * 100), // Convert SDG to cents
        complexityMultiplier: data.complexityMultiplier,
        changeNotes: data.changeNotes,
      });

      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating fee structure:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLevelColor = (level: 'A' | 'B' | 'C') => {
    switch (level) {
      case 'A':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'B':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'C':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      coordinator: 'Coordinator',
      dataCollector: 'Data Collector',
      supervisor: 'Supervisor',
    };
    return labels[role] || role;
  };

  // Get base fee for display
  const baseFee = form.watch('siteVisitBaseFeeCents') || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Edit Fee Structure
          </DialogTitle>
          <DialogDescription>
            Update base fee for{' '}
            <Badge className={getLevelColor(feeStructure.classificationLevel as 'A' | 'B' | 'C')}>
              Level {feeStructure.classificationLevel}
            </Badge>{' '}
            <Badge variant="outline">{getRoleLabel(feeStructure.roleScope || '')}</Badge>.
            Transport fees come from approved site visits only.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="siteVisitBaseFeeCents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Fee (SDG)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1500.00"
                      {...field}
                      data-testid="input-base-fee"
                    />
                  </FormControl>
                  <FormDescription>
                    Site visit base compensation per classification level. Transport fees are paid separately from approved site visits.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted/50 p-4 rounded-md">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Base Fee:</span>
                <span className="text-lg font-bold text-primary">
                  SDG {baseFee.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Note: Transport fees are not part of fee structures and come only from approved site visits
              </p>
            </div>

            <FormField
              control={form.control}
              name="complexityMultiplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complexity Multiplier</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      placeholder="1.0"
                      {...field}
                      data-testid="input-multiplier"
                    />
                  </FormControl>
                  <FormDescription>
                    Applied to base fee for complex assignments (1.0 - 5.0x)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="changeNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Change Notes *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain the reason for updating this fee structure..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="input-change-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Required: Provide justification for audit trail
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-save">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
