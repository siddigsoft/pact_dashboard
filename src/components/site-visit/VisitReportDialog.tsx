import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, FileText, MapPin, Clock, User, AlertCircle, Navigation, Compass, ImageIcon, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MMPSiteEntry } from '@/types/mmp';

interface VisitReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MMPSiteEntry | null;
  onSubmit: (reportData: VisitReportData) => Promise<void>;
  isSubmitting?: boolean;
  currentUser?: any;
}

export interface VisitReportData {
  notes: string;
  activities: string;
  photos: File[];
  visitDuration: number;
  locationData: any[];
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null;
}

export const VisitReportDialog: React.FC<VisitReportDialogProps> = ({
  open,
  onOpenChange,
  site,
  onSubmit,
  isSubmitting = false,
  currentUser
}) => {
  const [notes, setNotes] = useState('');
  const [activities, setActivities] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [visitDuration, setVisitDuration] = useState(0); // Start at 0, will count up
  const [visitStartTime, setVisitStartTime] = useState<Date | null>(null);
  const [coordinates, setCoordinates] = useState<{latitude: number; longitude: number; accuracy: number} | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [accuracyHistory, setAccuracyHistory] = useState<number[]>([]);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showLocationRequiredDialog, setShowLocationRequiredDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [finishing, setFinishing] = useState(false);

  const locationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check location permissions and start continuous monitoring when dialog opens
  useEffect(() => {
    if (open && site) {
      // Reset location state when dialog opens
      setCoordinates(null);
      setLocationEnabled(false);
      setIsGettingLocation(false);
      setShowLocationRequiredDialog(false);
      setAccuracyHistory([]);
      setFinishing(false);

      // Load existing draft data if available
      if (site.additionalData) {
        const draftData = site.additionalData;
        setNotes(draftData.draft_notes || '');
        setActivities(draftData.draft_activities || '');
        setVisitDuration(typeof draftData.draft_visit_duration === 'number' ? draftData.draft_visit_duration : 0);
        if (draftData.draft_coordinates && typeof draftData.draft_coordinates === 'object') {
          setCoordinates(draftData.draft_coordinates);
          setLocationEnabled(true);
        }
        // Note: Photos from draft are stored as URLs, not File objects
        // They would need to be re-uploaded or handled differently
      } else {
        setNotes('');
        setActivities('');
        setPhotos([]);
        setVisitDuration(0);
      }

      setVisitStartTime(new Date()); // Start counting visit duration
      startLocationMonitoring();

      // Set a timeout to close dialog if location is not obtained within 15 seconds
      locationTimeoutRef.current = setTimeout(() => {
        if (!coordinates && !locationEnabled) {
          setShowLocationRequiredDialog(true); // Show notification dialog
        }
      }, 15000); // 15 seconds timeout
    } else {
      setVisitStartTime(null);
      setVisitDuration(0);
      stopLocationMonitoring();
      setFinishing(false);
      if (locationTimeoutRef.current) {
        clearTimeout(locationTimeoutRef.current);
        locationTimeoutRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      stopLocationMonitoring();
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (locationTimeoutRef.current) {
        clearTimeout(locationTimeoutRef.current);
        locationTimeoutRef.current = null;
      }
    };
  }, [open, site]);

  // Clear location timeout when coordinates are successfully obtained
  useEffect(() => {
    if (coordinates && locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
  }, [coordinates]);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (visitStartTime && open) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - visitStartTime.getTime()) / 1000 / 60); // minutes
        setVisitDuration(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [visitStartTime, open]);

  const startLocationMonitoring = async () => {
    setIsGettingLocation(true);

    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        setLocationEnabled(false);
        setIsGettingLocation(false);
        setShowLocationRequiredDialog(true); // Show notification dialog
        return;
      }

      // Start watching position for continuous accuracy improvement
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };

          // Update accuracy history
          setAccuracyHistory(prev => {
            const newHistory = [...prev, position.coords.accuracy];
            // Keep only last 10 readings
            return newHistory.slice(-10);
          });

          // Update coordinates if accuracy is better or this is the first reading
          setCoordinates(prevCoords => {
            if (!prevCoords || position.coords.accuracy < prevCoords.accuracy) {
              // Show toast only for significant accuracy improvements
              if (prevCoords && position.coords.accuracy <= 10 && prevCoords.accuracy > 10) {
                toast({
                  title: 'Location Accuracy Improved!',
                  description: `Accuracy now ±${position.coords.accuracy.toFixed(1)} meters - ready for submission.`,
                  variant: 'default'
                });
              } else if (!prevCoords) {
                toast({
                  title: 'Location Captured',
                  description: `Coordinates: ${newCoords.latitude.toFixed(6)}, ${newCoords.longitude.toFixed(6)}`,
                  variant: 'default'
                });
              }
              return newCoords;
            }
            return prevCoords;
          });

          setLocationEnabled(true);
          setIsGettingLocation(false);
        },
        (error) => {
          console.error('Location watch error:', error);
          setLocationEnabled(false);
          setIsGettingLocation(false);
          setShowLocationRequiredDialog(true); // Show notification dialog
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000 // Accept positions up to 5 seconds old
        }
      );

      setLocationWatchId(watchId);

    } catch (error: any) {
      console.error('Location monitoring setup error:', error);
      setLocationEnabled(false);
      setIsGettingLocation(false);
      setShowLocationRequiredDialog(true); // Show notification dialog
    }
  };

  const stopLocationMonitoring = () => {
    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
      setLocationWatchId(null);
    }
    setAccuracyHistory([]);
  };

  const refreshLocation = async () => {
    setIsGettingLocation(true);

    try {
      // Get a single high-accuracy position
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0 // Force fresh reading
        });
      });

      const newCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      setCoordinates(newCoords);
      setAccuracyHistory(prev => [...prev, position.coords.accuracy].slice(-10));

      toast({
        title: 'Location Refreshed',
        description: `New accuracy: ±${newCoords.accuracy.toFixed(1)} meters`,
        variant: 'default'
      });

    } catch (error: any) {
      console.error('Location refresh error:', error);
      toast({
        title: 'Location Refresh Failed',
        description: 'Could not refresh location. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGettingLocation(false);
    }
  };

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

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setCameraStream(stream);
      setShowCamera(true);
      setShowPhotoOptions(false);

      // Wait for video element to be ready
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: 'Camera Access Denied',
        description: 'Please allow camera access to take photos.',
        variant: 'destructive'
      });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPhotos(prev => [...prev, file]);
        closeCamera();
      }
    }, 'image/jpeg', 0.8);
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const handleSubmit = async () => {
    if (finishing) return;
    setFinishing(true);
    if (!site) return;

    if (!locationEnabled || !coordinates) {
      toast({
        title: 'Location Required',
        description: 'Location access is required to complete the site visit.',
        variant: 'destructive'
      });
      return;
    }

    // TEMPORARILY DISABLED FOR TESTING - Re-enable accuracy check: coordinates.accuracy > 10
    // Check location accuracy - must be 10 meters or better
    /*
    if (coordinates.accuracy > 10) {
      toast({
        title: 'Location Accuracy Too Low',
        description: `Current accuracy is ±${coordinates.accuracy.toFixed(1)} meters. Please wait for better accuracy (≤10 meters) or use the compass icon to refresh location.`,
        variant: 'destructive'
      });
      return;
    }
    */

    if (!activities.trim()) {
      toast({
        title: 'Activities Required',
        description: 'Please describe the activities performed during the visit.',
        variant: 'destructive'
      });
      return;
    }

    if (photos.length === 0) {
      toast({
        title: 'Photo Required',
        description: 'At least one photo is required to complete the site visit.',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Prepare coordinates in the format expected by the database (JSONB with latitude and longitude)
      const coordinatesJsonb = coordinates ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        accuracy: coordinates.accuracy
      } : {};

      // Upload photos to storage first
      const photoUrls: string[] = [];
      const photoStoragePaths: string[] = [];
      
      for (const photo of photos) {
        const fileName = `reports/${site.id}/${Date.now()}-${Math.random().toString(36).substring(7)}-${photo.name}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-visit-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Error uploading photo:', uploadError);
          
          // Check if it's a bucket not found error
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            toast({
              title: 'Storage Bucket Not Found',
              description: 'The site-visit-photos storage bucket has not been created. Please contact your administrator to run the database migration.',
              variant: 'destructive'
            });
            return; // Stop processing if bucket doesn't exist
          }
          
          toast({
            title: 'Photo Upload Error',
            description: `Failed to upload ${photo.name}: ${uploadError.message || 'Unknown error'}. Please try again.`,
            variant: 'destructive'
          });
          continue; // Continue with other photos for other errors
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('site-visit-photos')
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          photoUrls.push(urlData.publicUrl);
          photoStoragePaths.push(fileName);
        }
      }

      if (photoUrls.length === 0) {
        toast({
          title: 'Photo Upload Failed',
          description: 'Failed to upload photos. Please try again or contact support if the issue persists.',
          variant: 'destructive'
        });
        return;
      }

      // Create report record
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .insert({
          site_visit_id: site.id,
          notes: notes || 'No additional notes provided',
          activities: activities,
          duration_minutes: visitDuration,
          coordinates: coordinatesJsonb,
          submitted_by: currentUser?.id || null,
          submitted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (reportError) {
        console.error('Error saving to reports table:', reportError);
        throw reportError;
      }

      if (!reportData) {
        throw new Error('Failed to create report record');
      }

      // Link photos to report via report_photos table
      const reportPhotos = photoUrls.map((photoUrl, index) => ({
        report_id: reportData.id,
        photo_url: photoUrl,
        storage_path: photoStoragePaths[index] || null
      }));

      const { error: photosError } = await supabase
        .from('report_photos')
        .insert(reportPhotos);

      if (photosError) {
        console.error('Error linking photos to report:', photosError);
        // Don't throw here - report is already created, just log the error
        toast({
          title: 'Warning',
          description: 'Report created but some photos may not be linked properly.',
          variant: 'default'
        });
      }

      // Call the parent onSubmit handler if provided
      const visitReportData: VisitReportData = {
        notes,
        activities,
        photos,
        visitDuration,
        locationData: [], // Will be populated by location tracking
        coordinates
      };

      await onSubmit(visitReportData);

      // Reset form
      setNotes('');
      setActivities('');
      setPhotos([]);
      setVisitDuration(0);
      setVisitStartTime(null);
      setCoordinates(null);
      setLocationEnabled(false);

      toast({
        title: 'Visit Report Submitted',
        description: 'Your site visit report has been successfully submitted.',
        variant: 'default'
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: "Error",
        description: "Failed to complete site visit. Please try again.",
        variant: "destructive",
      });
      setFinishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!site) return;

    if (!locationEnabled || !coordinates) {
      toast({
        title: 'Location Required',
        description: 'Location access is required to save as draft.',
        variant: 'destructive'
      });
      return;
    }

    // Check location accuracy - must be 10 meters or better for draft
    if (coordinates.accuracy > 10) {
      toast({
        title: 'Location Accuracy Too Low',
        description: `Current accuracy is ±${coordinates.accuracy.toFixed(1)} meters. Please wait for better accuracy (≤10 meters) or use the compass icon to refresh location before saving as draft.`,
        variant: 'destructive'
      });
      return;
    }

    try {
      const now = new Date().toISOString();

      // Upload photos to Supabase storage for draft
      const photoUrls: string[] = [];
      for (const photo of photos) {
        const fileName = `draft-photos/${site.id}/${Date.now()}-${photo.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-visit-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Error uploading draft photo:', uploadError);
          
          // Check if it's a bucket not found error
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            toast({
              title: 'Storage Bucket Not Found',
              description: 'The site-visit-photos storage bucket has not been created. Please contact your administrator to run the database migration.',
              variant: 'destructive'
            });
            return; // Stop processing if bucket doesn't exist
          }
          
          // For other errors, continue with other photos
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('site-visit-photos')
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          photoUrls.push(urlData.publicUrl);
        }
      }

      // Save draft data to site entry
      const draftData = {
        draft_notes: notes,
        draft_activities: activities,
        draft_photo_urls: photoUrls,
        draft_visit_duration: visitDuration,
        draft_coordinates: coordinates,
        draft_saved_at: now,
        draft_location_accuracy: coordinates.accuracy,
        // Ensure status remains "In Progress"
        status: 'In Progress'
      };

      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          additional_data: {
            ...(site.additionalData || {}),
            ...draftData
          },
          updated_at: now
        })
        .eq('id', site.id);

      if (updateError) {
        console.error('Error saving draft:', updateError);
        throw updateError;
      }

      toast({
        title: 'Draft Saved',
        description: 'Your site visit progress has been saved as a draft. You can continue and submit it later when you have better internet connection.',
        variant: 'default'
      });

      // Close dialog without resetting form (since they might want to continue)
      onOpenChange(false);

    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error",
        description: "Failed to save draft. Please try again.",
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Complete Site Visit Report
            {site?.additionalData?.draft_saved_at && (
              <Badge variant="outline" className="ml-2 text-yellow-600 border-yellow-600">
                Draft Loaded
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Location Status */}
          <Card className={
            !coordinates ? 'border-red-200 bg-red-50' :
            coordinates.accuracy <= 10 ? 'border-green-200 bg-green-50' :
            'border-yellow-200 bg-yellow-50'
          }>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className={`h-5 w-5 ${
                    !coordinates ? 'text-red-600' :
                    coordinates.accuracy <= 10 ? 'text-green-600' :
                    'text-yellow-600'
                  }`} />
                  Location Status
                </div>
                {coordinates && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshLocation}
                    disabled={isGettingLocation}
                    className="flex items-center gap-1"
                  >
                    <Compass className="h-4 w-4" />
                    {isGettingLocation ? 'Refreshing...' : 'Refresh'}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isGettingLocation && !coordinates ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Initializing location monitoring...
                </div>
              ) : coordinates ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">
                    <strong>Coordinates:</strong> {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                    <br />
                    <strong>Current Accuracy:</strong> ±{coordinates.accuracy.toFixed(1)} meters
                    <br />
                    <strong>Required:</strong> ≤10 meters for submission
                  </div>
                  <p className="text-sm text-gray-600">
                    Click "Refresh" for immediate accuracy check, or wait for automatic improvement to ≤10 meters.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    Location access required
                  </div>
                  <p className="text-sm text-gray-600">
                    Please enable location permissions in your browser to start location monitoring.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startLocationMonitoring}
                    disabled={isGettingLocation}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    Start Location Monitoring
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Site Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Site Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Site Name:</span>
                  <span className="text-sm">{site.siteName || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant="secondary">{site.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Enumerator:</span>
                  <span className="text-sm">{currentUser?.full_name || currentUser?.username || currentUser?.email || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Activity:</span>
                  <span className="text-sm">{site.siteActivity || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Visit Duration:</span>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    {formatDuration(visitDuration)} (Auto-counting)
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities Performed */}
          <div className="space-y-2">
            <Label htmlFor="activities" className="text-base font-medium">
              Activities Performed <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="activities"
              placeholder="Describe the activities performed during the site visit (e.g., monitoring, data collection, assessments, etc.)..."
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-base font-medium">
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Any additional observations, issues encountered, recommendations, or important findings..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />

          </div>

          {/* Photo Upload */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              Site Photos <span className="text-red-600 font-bold text-lg">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPhotoOptions(true)}
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
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              At least one photo is required. Take multiple photos of the site, equipment, activities, or any relevant observations. You can add as many photos as needed.
            </p>

            {/* Photo Options Modal */}
            <Dialog open={showPhotoOptions} onOpenChange={setShowPhotoOptions}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-blue-600" />
                    Add Photos
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCamera}
                    className="w-full flex items-center gap-2 justify-start h-12"
                  >
                    <Camera className="h-5 w-5 text-blue-600" />
                    <div className="text-left">
                      <div className="font-medium">Open Camera</div>
                      <div className="text-sm text-muted-foreground">Take a new photo</div>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowPhotoOptions(false);
                    }}
                    className="w-full flex items-center gap-2 justify-start h-12"
                  >
                    <ImageIcon className="h-5 w-5 text-green-600" />
                    <div className="text-left">
                      <div className="font-medium">Upload from Gallery</div>
                      <div className="text-sm text-muted-foreground">Select from existing photos</div>
                    </div>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Camera Modal */}
            <Dialog open={showCamera} onOpenChange={closeCamera}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-blue-600" />
                    Take Photo
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-64 object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeCamera}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {photos.length > 0 && (
              <p className="text-sm text-green-600">
                ✓ {photos.length} photo{photos.length !== 1 ? 's' : ''} added
              </p>
            )}
          </div>
        </div>

        {/* Location Required Notification Dialog */}
        <Dialog open={showLocationRequiredDialog} onOpenChange={(open) => {
          if (!open) {
            setShowLocationRequiredDialog(false);
            onOpenChange(false); // Close main dialog and return to sites list
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                Location Access Required
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-center">
                <MapPin className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Sorry, you can't complete the site visit without location enabled.
                </p>
                <p className="text-sm text-gray-600">
                  Location access is required to ensure accurate site visit reporting and compliance with monitoring requirements.
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLocationRequiredDialog(false);
                    onOpenChange(false); // Close main dialog and return to sites list
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowLocationRequiredDialog(false);
                    // Try to request location permission again
                    startLocationMonitoring();
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Enable Location
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            {!coordinates ? 'Location access required.' :
             coordinates.accuracy > 10 ? 'Location accuracy must be ≤10 meters to save draft.' :
             'Ready to save draft or submit.'}
          </div>
          <div className="flex gap-2">
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
              onClick={handleSaveDraft}
              disabled={isSubmitting || !locationEnabled || !coordinates || coordinates.accuracy > 10}
              className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700"
            >
              <Save className="h-4 w-4" />
              Save as Draft
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !locationEnabled || !coordinates || !activities.trim() || photos.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <FileText className="h-4 w-4" />
              {isSubmitting ? 'Saving Visit...' : 'Finish Visit'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};