import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Upload, FileText, MapPin, Clock, User, AlertCircle, Navigation, Compass, ImageIcon, Save, Car, CheckCircle, X } from 'lucide-react';
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
  const [visitDuration, setVisitDuration] = useState(0);
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

  useEffect(() => {
    if (open && site) {
      setCoordinates(null);
      setLocationEnabled(false);
      setIsGettingLocation(false);
      setShowLocationRequiredDialog(false);
      setAccuracyHistory([]);
      setFinishing(false);

      if (site.additionalData) {
        const draftData = site.additionalData;
        setNotes(draftData.draft_notes || '');
        setActivities(draftData.draft_activities || '');
        setVisitDuration(typeof draftData.draft_visit_duration === 'number' ? draftData.draft_visit_duration : 0);
        if (draftData.draft_coordinates && typeof draftData.draft_coordinates === 'object') {
          setCoordinates(draftData.draft_coordinates);
          setLocationEnabled(true);
        }
      } else {
        setNotes('');
        setActivities('');
        setPhotos([]);
        setVisitDuration(0);
      }

      setVisitStartTime(new Date());
      startLocationMonitoring();

      locationTimeoutRef.current = setTimeout(() => {
        if (!coordinates && !locationEnabled) {
          setShowLocationRequiredDialog(true);
        }
      }, 15000);
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
        const elapsed = Math.floor((now.getTime() - visitStartTime.getTime()) / 1000 / 60);
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
      if (!navigator.geolocation) {
        setLocationEnabled(false);
        setIsGettingLocation(false);
        setShowLocationRequiredDialog(true);
        return;
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };

          setAccuracyHistory(prev => {
            const newHistory = [...prev, position.coords.accuracy];
            return newHistory.slice(-10);
          });

          setCoordinates(prevCoords => {
            if (!prevCoords || position.coords.accuracy < prevCoords.accuracy) {
              if (prevCoords && position.coords.accuracy <= 10 && prevCoords.accuracy > 10) {
                toast({
                  title: 'Location Accuracy Improved!',
                  description: `Accuracy now ±${position.coords.accuracy.toFixed(1)} meters`,
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
          setShowLocationRequiredDialog(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000
        }
      );

      setLocationWatchId(watchId);

    } catch (error: any) {
      console.error('Location monitoring setup error:', error);
      setLocationEnabled(false);
      setIsGettingLocation(false);
      setShowLocationRequiredDialog(true);
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
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

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
      setFinishing(false);
      return;
    }

    if (!activities.trim()) {
      toast({
        title: 'Activities Required',
        description: 'Please describe the activities performed during the visit.',
        variant: 'destructive'
      });
      setFinishing(false);
      return;
    }

    if (photos.length === 0) {
      toast({
        title: 'Photo Required',
        description: 'At least one photo is required to complete the site visit.',
        variant: 'destructive'
      });
      setFinishing(false);
      return;
    }

    try {
      const coordinatesJsonb = coordinates ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        accuracy: coordinates.accuracy
      } : {};

      const photoUrls: string[] = [];
      const photoStoragePaths: string[] = [];
      
      for (const photo of photos) {
        const fileName = `reports/${site.id}/${Date.now()}-${Math.random().toString(36).substring(7)}-${photo.name}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-visit-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Error uploading photo:', uploadError);
          
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            toast({
              title: 'Storage Bucket Not Found',
              description: 'The site-visit-photos storage bucket has not been created.',
              variant: 'destructive'
            });
            setFinishing(false);
            return;
          }
          
          toast({
            title: 'Photo Upload Error',
            description: `Failed to upload ${photo.name}. Please try again.`,
            variant: 'destructive'
          });
          continue;
        }

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
          description: 'Failed to upload photos. Please try again.',
          variant: 'destructive'
        });
        setFinishing(false);
        return;
      }

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
        toast({
          title: 'Warning',
          description: 'Report created but some photos may not be linked properly.',
          variant: 'default'
        });
      }

      const visitReportData: VisitReportData = {
        notes,
        activities,
        photos,
        visitDuration,
        locationData: [],
        coordinates
      };

      await onSubmit(visitReportData);

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

    if (coordinates.accuracy > 10) {
      toast({
        title: 'Location Accuracy Too Low',
        description: `Current accuracy is ±${coordinates.accuracy.toFixed(1)} meters. Please wait for better accuracy.`,
        variant: 'destructive'
      });
      return;
    }

    try {
      const now = new Date().toISOString();

      const photoUrls: string[] = [];
      for (const photo of photos) {
        const fileName = `draft-photos/${site.id}/${Date.now()}-${photo.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-visit-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Error uploading draft photo:', uploadError);
          
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            toast({
              title: 'Storage Bucket Not Found',
              description: 'The storage bucket has not been created.',
              variant: 'destructive'
            });
            return;
          }
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('site-visit-photos')
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          photoUrls.push(urlData.publicUrl);
        }
      }

      const draftData = {
        draft_notes: notes,
        draft_activities: activities,
        draft_photo_urls: photoUrls,
        draft_visit_duration: visitDuration,
        draft_coordinates: coordinates,
        draft_saved_at: now,
        draft_location_accuracy: coordinates.accuracy,
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
        description: 'Your site visit progress has been saved as a draft.',
        variant: 'default'
      });

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-900 border-0 shadow-2xl rounded-3xl p-0">
        {/* Header - Uber style black */}
        <div className="bg-black dark:bg-white px-6 py-5 sticky top-0 z-10">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-white dark:text-black">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-black flex items-center justify-center">
                  <Car className="h-5 w-5 text-black dark:text-white" />
                </div>
                <div>
                  <span className="text-lg font-bold block">Complete Site Visit</span>
                  <span className="text-sm text-white/60 dark:text-black/60 font-normal">
                    {site.siteName}
                  </span>
                </div>
              </div>
              {site?.additionalData?.draft_saved_at && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white dark:bg-black/20 dark:text-black">
                  Draft Loaded
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Location Status - Floating Card */}
          <div className="rounded-2xl p-5 shadow-lg bg-gray-50 dark:bg-neutral-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  !coordinates ? 'bg-black/10 dark:bg-white/10' :
                  coordinates.accuracy <= 10 ? 'bg-black dark:bg-white' :
                  'bg-black/50 dark:bg-white/50'
                }`}>
                  <Navigation className={`h-6 w-6 ${
                    !coordinates ? 'text-black/40 dark:text-white/40' :
                    coordinates.accuracy <= 10 ? 'text-white dark:text-black' :
                    'text-white dark:text-black'
                  }`} />
                </div>
                <div>
                  <h3 className="font-bold text-black dark:text-white">Location Status</h3>
                  <p className="text-sm text-black/50 dark:text-white/50">
                    {!coordinates ? 'Acquiring location...' :
                     coordinates.accuracy <= 10 ? 'Excellent accuracy' :
                     'Improving accuracy...'}
                  </p>
                </div>
              </div>
              {coordinates && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={refreshLocation}
                  disabled={isGettingLocation}
                  className="rounded-full border-black/20 dark:border-white/20"
                >
                  <Compass className="h-4 w-4 mr-1" />
                  {isGettingLocation ? 'Refreshing...' : 'Refresh'}
                </Button>
              )}
            </div>
            
            {isGettingLocation && !coordinates ? (
              <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black dark:border-white"></div>
                Initializing location monitoring...
              </div>
            ) : coordinates ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/50 dark:text-white/50">Accuracy</span>
                  <span className="font-mono font-bold text-black dark:text-white">
                    ±{coordinates.accuracy.toFixed(1)}m
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/50 dark:text-white/50">Coordinates</span>
                  <span className="font-mono text-sm text-black/70 dark:text-white/70">
                    {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
                  <AlertCircle className="h-4 w-4" />
                  Location access required
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startLocationMonitoring}
                  disabled={isGettingLocation}
                  className="rounded-full border-black/20 dark:border-white/20"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Start Location Monitoring
                </Button>
              </div>
            )}
          </div>

          {/* Site Information - Floating Card */}
          <div className="rounded-2xl p-5 shadow-lg bg-gray-50 dark:bg-neutral-800">
            <h3 className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider mb-4">
              Site Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-black/40 dark:text-white/40 uppercase">Location</p>
                <p className="text-sm font-semibold text-black dark:text-white">{site.locality || site.state || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-black/40 dark:text-white/40 uppercase">Site ID</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-black text-white dark:bg-white dark:text-black">
                  {site.siteCode || site.id?.slice(0, 8)}
                </span>
              </div>
              <div>
                <p className="text-xs text-black/40 dark:text-white/40 uppercase">Activity</p>
                <p className="text-sm font-semibold text-black dark:text-white">{site.siteActivity || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-black/40 dark:text-white/40 uppercase">Duration</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-black/10 text-black dark:bg-white/10 dark:text-white">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDuration(visitDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* Activities Performed */}
          <div className="space-y-3">
            <Label htmlFor="activities" className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider">
              Activities Performed <span className="text-black dark:text-white">*</span>
            </Label>
            <Textarea
              id="activities"
              placeholder="Describe the activities performed during the site visit..."
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              rows={4}
              className="resize-none rounded-xl border-0 bg-gray-50 dark:bg-neutral-800 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
            />
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <Label htmlFor="notes" className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider">
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Any additional observations, issues, or recommendations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none rounded-xl border-0 bg-gray-50 dark:bg-neutral-800 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
            />
          </div>

          {/* Photo Upload - Floating Card */}
          <div className="rounded-2xl p-5 shadow-lg bg-gray-50 dark:bg-neutral-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider">
                  Site Photos <span className="text-black dark:text-white">*</span>
                </h3>
                <p className="text-xs text-black/40 dark:text-white/40 mt-1">
                  At least one photo required
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setShowPhotoOptions(true)}
                className="rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black font-semibold gap-2"
              >
                <Camera className="h-4 w-4" />
                Add Photos
              </Button>
            </div>
            
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

            {photos.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Site photo ${index + 1}`}
                        className="w-full h-20 object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-2 py-0.5 rounded-full bg-black text-white text-xs font-bold">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-black dark:text-white" />
                  <span className="text-sm font-medium text-black dark:text-white">
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} added
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Photo Options Modal - Uber style */}
        <Dialog open={showPhotoOptions} onOpenChange={setShowPhotoOptions}>
          <DialogContent className="max-w-sm bg-white dark:bg-neutral-900 border-0 shadow-2xl rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-black dark:text-white">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white dark:text-black" />
                </div>
                Add Photos
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={openCamera}
                className="w-full h-14 rounded-xl border-black/10 dark:border-white/10 justify-start gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-black dark:text-white" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-black dark:text-white">Open Camera</div>
                  <div className="text-xs text-black/50 dark:text-white/50">Take a new photo</div>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowPhotoOptions(false);
                }}
                className="w-full h-14 rounded-xl border-black/10 dark:border-white/10 justify-start gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-black dark:text-white" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-black dark:text-white">Upload from Gallery</div>
                  <div className="text-xs text-black/50 dark:text-white/50">Select existing photos</div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Camera Modal - Uber style */}
        <Dialog open={showCamera} onOpenChange={closeCamera}>
          <DialogContent className="max-w-md bg-black border-0 shadow-2xl rounded-3xl p-0 overflow-hidden">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-72 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="p-4 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeCamera}
                className="flex-1 h-12 rounded-full border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={capturePhoto}
                className="flex-1 h-12 rounded-full bg-white hover:bg-white/90 text-black font-bold gap-2"
              >
                <Camera className="h-5 w-5" />
                Capture
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Location Required Dialog - Uber style */}
        <Dialog open={showLocationRequiredDialog} onOpenChange={(open) => {
          if (!open) {
            setShowLocationRequiredDialog(false);
            onOpenChange(false);
          }
        }}>
          <DialogContent className="max-w-sm bg-white dark:bg-neutral-900 border-0 shadow-2xl rounded-3xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-black/10 dark:bg-white/10 mx-auto mb-4 flex items-center justify-center">
              <MapPin className="h-8 w-8 text-black dark:text-white" />
            </div>
            <h3 className="text-xl font-bold text-black dark:text-white mb-2">Location Required</h3>
            <p className="text-sm text-black/50 dark:text-white/50 mb-6">
              Location access is required for accurate site visit reporting and compliance.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLocationRequiredDialog(false);
                  onOpenChange(false);
                }}
                className="flex-1 h-12 rounded-full border-black/20 dark:border-white/20"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowLocationRequiredDialog(false);
                  startLocationMonitoring();
                }}
                className="flex-1 h-12 rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black font-bold gap-2"
              >
                <Navigation className="h-5 w-5" />
                Enable
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Footer - Action Buttons */}
        <DialogFooter className="p-6 pt-0 flex-col gap-4 bg-white dark:bg-neutral-900">
          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-black/40 dark:text-white/40">
            <AlertCircle className="h-3.5 w-3.5" />
            {!coordinates ? 'Waiting for location...' :
             coordinates.accuracy > 10 ? `Accuracy: ±${coordinates.accuracy.toFixed(0)}m (improving...)` :
             'Ready to submit'}
          </div>
          
          <div className="flex gap-3 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-full border-black/20 dark:border-white/20 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting || !locationEnabled || !coordinates || coordinates.accuracy > 10}
              className="h-12 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-black dark:text-white font-semibold gap-2 px-5"
            >
              <Save className="h-4 w-4" />
              Draft
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !locationEnabled || !coordinates || !activities.trim() || photos.length === 0}
              className="flex-1 h-12 rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black font-bold gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              {isSubmitting ? 'Submitting...' : 'Finish Visit'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
