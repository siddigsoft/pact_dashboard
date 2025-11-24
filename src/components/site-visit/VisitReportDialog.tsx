import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, FileText, MapPin, Clock, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MMPSiteEntry } from '@/types/mmp';

interface VisitReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MMPSiteEntry | null;
  onSubmit: (reportData: VisitReportData) => Promise<void>;
  isSubmitting?: boolean;
}

export interface VisitReportData {
  notes: string;
  activities: string;
  photos: File[];
  visitDuration: number;
  locationData: any[];
}

export const VisitReportDialog: React.FC<VisitReportDialogProps> = ({
  open,
  onOpenChange,
  site,
  onSubmit,
  isSubmitting = false
}) => {
  const [notes, setNotes] = useState('');
  const [activities, setActivities] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [visitDuration, setVisitDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newPhotos = Array.from(files);
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!site) return;

    try {
      // Get location data from site_locations table
      const { data: locationData, error: locationError } = await supabase
        .from('site_locations')
        .select('*')
        .eq('site_entry_id', site.id)
        .order('timestamp', { ascending: true });

      if (locationError) {
        console.error('Error fetching location data:', locationError);
        toast({
          title: "Warning",
          description: "Could not fetch location data, but report will still be submitted.",
          variant: "default",
        });
      }

      const reportData: VisitReportData = {
        notes,
        activities,
        photos,
        visitDuration,
        locationData: locationData || []
      };

      await onSubmit(reportData);

      // Reset form
      setNotes('');
      setActivities('');
      setPhotos([]);
      setVisitDuration(0);

      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: "Error",
        description: "Failed to submit visit report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (!site) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Complete Site Visit Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Site Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Site Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Location:</span>
                  <span className="text-sm">{site.locality || site.state || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Site ID:</span>
                  <span className="text-sm">{site.siteCode || site.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant="secondary">{site.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Visit Duration:</span>
                  <Input
                    type="number"
                    placeholder="Minutes"
                    value={visitDuration}
                    onChange={(e) => setVisitDuration(parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    {formatDuration(visitDuration)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities Performed */}
          <div className="space-y-2">
            <Label htmlFor="activities">Activities Performed</Label>
            <Textarea
              id="activities"
              placeholder="Describe the activities performed during the site visit..."
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              rows={4}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional observations, issues encountered, or recommendations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Photo Upload */}
          <div className="space-y-3">
            <Label>Site Photos</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Camera className="h-4 w-4" />
                Add Photos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`Site photo ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !activities.trim()}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};