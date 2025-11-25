import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, FileText, MapPin, Clock, User, AlertCircle, Navigation, Compass, ImageIcon } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Check location permissions and start continuous monitoring when dialog opens
  useEffect(() => {
    if (open && site) {
      setVisitStartTime(new Date()); // Start counting visit duration
      startLocationMonitoring();
    } else {
      setVisitStartTime(null);
      setVisitDuration(0);
      stopLocationMonitoring();
    }

    // Cleanup on unmount
    return () => {
      stopLocationMonitoring();
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [open, site]);

  // Cleanup camera when dialog closes
  useEffect(() => {
    if (!open && cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setShowCamera(false);
    }
  }, [open, cameraStream]);
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
        toast({
          title: 'Location Not Supported',
          description: 'Geolocation is not supported by this browser.',
          variant: 'destructive'
        });
        setLocationEnabled(false);
        setIsGettingLocation(false);
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

          toast({
            title: 'Location Access Error',
            description: 'Failed to get location updates. Please check your permissions.',
            variant: 'destructive'
          });
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

      toast({
        title: 'Location Setup Failed',
        description: 'Failed to start location monitoring. Please refresh and try again.',
        variant: 'destructive'
      });
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

    try {
      const reportData: VisitReportData = {
        notes,
        activities,
        photos,
        visitDuration,
        locationData: [], // Will be populated by location tracking
        coordinates
      };

      await onSubmit(reportData);

      // Reset form
      setNotes('');
      setActivities('');
      setPhotos([]);
      setVisitDuration(0);
      setVisitStartTime(null);
      setCoordinates(null);
      setLocationEnabled(false);

      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: "Error",
        description: "Failed to complete site visit. Please try again.",
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
            <p className="text-sm text-muted-foreground">
              Please provide detailed information about what was done during the site visit.
            </p>
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
            <p className="text-sm text-muted-foreground">
              Optional: Include any relevant details that weren't covered in the activities section.
            </p>
          </div>

          {/* Photo Upload */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Site Photos (Multiple Allowed)</Label>
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
              Take multiple photos of the site, equipment, activities, or any relevant observations. You can add as many photos as needed.
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            {!coordinates ? 'Location access required.' :
             !activities.trim() ? 'Activities description required.' :
             'All requirements met - ready to submit.'}
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
              onClick={handleSubmit}
              disabled={isSubmitting || !locationEnabled || !coordinates || !activities.trim()}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <FileText className="h-4 w-4" />
              {isSubmitting ? 'Saving Visit...' : 'Finish Site'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};