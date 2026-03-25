import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  Clock, 
  MapPin, 
  FileText, 
  User, 
  Calendar,
  Smartphone,
  Monitor,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

interface ReportPhoto {
  id: string;
  photo_url: string;
  storage_path: string;
  created_at: string;
}

interface VisitReport {
  id: string;
  site_visit_id: string;
  notes: string | null;
  activities: string | null;
  duration_minutes: number | null;
  coordinates: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  } | null;
  submitted_by: string;
  submitted_at: string;
  is_synced: boolean;
  created_at: string;
  submitted_via?: 'mobile' | 'web';
}

interface CompletedVisitReportCardProps {
  siteVisitId: string;
  siteCode?: string;
  className?: string;
}

export const CompletedVisitReportCard: React.FC<CompletedVisitReportCardProps> = ({
  siteVisitId,
  siteCode,
  className = ''
}) => {
  const [report, setReport] = useState<VisitReport | null>(null);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [submitterName, setSubmitterName] = useState<string>('Unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: reportData, error: reportError } = await supabase
          .from('reports')
          .select('*')
          .eq('site_visit_id', siteVisitId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reportError) {
          console.error('Error fetching report:', reportError);
          setError('Failed to load visit report');
          return;
        }

        if (!reportData) {
          setReport(null);
          return;
        }

        setReport(reportData as VisitReport);

        const { data: photosData, error: photosError } = await supabase
          .from('report_photos')
          .select('*')
          .eq('report_id', reportData.id)
          .order('created_at', { ascending: true });

        if (photosError) {
          console.error('Error fetching photos:', photosError);
        } else {
          setPhotos(photosData || []);
        }

        if (reportData.submitted_by) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, username, email')
            .eq('id', reportData.submitted_by)
            .single();

          if (profileData) {
            setSubmitterName(
              profileData.full_name || 
              profileData.username || 
              profileData.email || 
              'Unknown'
            );
          }
        }
      } catch (err) {
        console.error('Error fetching report data:', err);
        setError('An error occurred while loading the report');
      } finally {
        setLoading(false);
      }
    };

    if (siteVisitId) {
      fetchReportData();
    }
  }, [siteVisitId]);

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getSubmissionSource = () => {
    if (report?.submitted_via === 'mobile') return 'mobile';
    if (report?.submitted_via === 'web') return 'web';
    
    const coords = report?.coordinates;
    if (coords && typeof coords === 'object') {
      if ('locked' in coords || coords.accuracy && coords.accuracy < 50) {
        return 'mobile';
      }
    }
    return 'unknown';
  };

  const handlePrevPhoto = () => {
    if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
      setSelectedPhotoIndex(selectedPhotoIndex - 1);
    }
  };

  const handleNextPhoto = () => {
    if (selectedPhotoIndex !== null && selectedPhotoIndex < photos.length - 1) {
      setSelectedPhotoIndex(selectedPhotoIndex + 1);
    }
  };

  if (loading) {
    return (
      <Card className={className} data-testid="card-completed-visit-report-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className} data-testid="card-completed-visit-report-error">
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card className={className} data-testid="card-completed-visit-report-empty">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">No visit report found for this site.</p>
        </CardContent>
      </Card>
    );
  }

  const submissionSource = getSubmissionSource();

  return (
    <>
      <Card className={className} data-testid="card-completed-visit-report">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Visit Report
            </CardTitle>
            <div className="flex items-center gap-2">
              {submissionSource !== 'unknown' && (
                <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-submission-source">
                  {submissionSource === 'mobile' ? (
                    <>
                      <Smartphone className="h-3 w-3" />
                      Mobile
                    </>
                  ) : (
                    <>
                      <Monitor className="h-3 w-3" />
                      Web
                    </>
                  )}
                </Badge>
              )}
              {photos.length > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-photo-count">
                  <Camera className="h-3 w-3" />
                  {photos.length} Photo{photos.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50" data-testid="stat-duration">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-medium text-sm">{formatDuration(report.duration_minutes)}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50" data-testid="stat-submitted-by">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Submitted By</p>
                <p className="font-medium text-sm truncate">{submitterName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50" data-testid="stat-submitted-at">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium text-sm">
                  {report.submitted_at ? format(new Date(report.submitted_at), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>

            {report.coordinates && (report.coordinates.latitude || report.coordinates.longitude) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50" data-testid="stat-coordinates">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Location</p>
                  <a
                    href={`https://www.google.com/maps?q=${report.coordinates.latitude},${report.coordinates.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm text-primary hover:underline flex items-center gap-1"
                    data-testid="link-map"
                  >
                    View Map
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {report.activities && (
            <div data-testid="section-activities">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Activities Performed</p>
              <p className="text-sm bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">{report.activities}</p>
            </div>
          )}

          {report.notes && (
            <div data-testid="section-notes">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">{report.notes}</p>
            </div>
          )}

          {photos.length > 0 && (
            <div data-testid="section-photos">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Visit Photos</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhotoIndex(index)}
                    className="relative aspect-square rounded-lg overflow-hidden hover-elevate cursor-pointer group"
                    data-testid={`photo-thumbnail-${index}`}
                  >
                    <img
                      src={photo.photo_url}
                      alt={`Visit photo ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {report.coordinates && report.coordinates.accuracy && (
            <p className="text-xs text-muted-foreground">
              GPS Accuracy: ±{report.coordinates.accuracy.toFixed(1)}m
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedPhotoIndex !== null} onOpenChange={() => setSelectedPhotoIndex(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden" data-testid="dialog-photo-viewer">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Photo {selectedPhotoIndex !== null ? selectedPhotoIndex + 1 : 0} of {photos.length}</span>
              <div className="flex items-center gap-2">
                {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    data-testid="button-download-photo"
                  >
                    <a
                      href={photos[selectedPhotoIndex].photo_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedPhotoIndex(null)}
                  data-testid="button-close-photo"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center bg-black/90 min-h-[60vh]">
            {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
              <img
                src={photos[selectedPhotoIndex].photo_url}
                alt={`Visit photo ${selectedPhotoIndex + 1}`}
                className="max-h-[70vh] max-w-full object-contain"
                data-testid="image-full-size"
              />
            )}
            
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-2"
              onClick={handlePrevPhoto}
              disabled={selectedPhotoIndex === null || selectedPhotoIndex <= 0}
              data-testid="button-prev-photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2"
              onClick={handleNextPhoto}
              disabled={selectedPhotoIndex === null || selectedPhotoIndex >= photos.length - 1}
              data-testid="button-next-photo"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompletedVisitReportCard;
