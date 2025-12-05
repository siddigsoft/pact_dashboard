import { useState, useRef, useEffect } from 'react';
import { useActiveVisit } from '@/context/ActiveVisitContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { 
  MapPin, 
  Clock, 
  Camera, 
  Navigation, 
  ChevronUp, 
  ChevronDown,
  CheckCircle2,
  Wifi,
  WifiOff,
  Signal,
  Battery,
  Compass,
  Target,
  FileText,
  AlertCircle,
  Pause,
  Play,
  Phone,
  Loader2,
  Satellite
} from 'lucide-react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ActiveVisitOverlayProps {
  onCompleteVisit?: () => void;
  onTakePhoto?: () => void;
  onOpenNavigation?: () => void;
}

export function ActiveVisitOverlay({ 
  onCompleteVisit, 
  onTakePhoto,
  onOpenNavigation 
}: ActiveVisitOverlayProps) {
  const {
    activeVisit,
    isMinimized,
    elapsedTime,
    gpsAccuracy,
    isGpsActive,
    toggleMinimize,
    completeVisit,
    addPhoto,
    updateNotes,
    pauseVisit,
    resumeVisit,
  } = useActiveVisit();

  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'technical'>('overview');
  const [isCompleting, setIsCompleting] = useState(false);
  const [localNotes, setLocalNotes] = useState('');
  const dragConstraintsRef = useRef(null);

  useEffect(() => {
    if (activeVisit?.notes) {
      setLocalNotes(activeVisit.notes);
    }
  }, [activeVisit?.notes]);

  if (!activeVisit) return null;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getGpsStatusColor = () => {
    if (!isGpsActive || gpsAccuracy === null) return 'text-red-500';
    if (gpsAccuracy <= 10) return 'text-green-500';
    if (gpsAccuracy <= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getGpsStatusText = () => {
    if (!isGpsActive) return 'GPS Off';
    if (gpsAccuracy === null) return 'Acquiring...';
    return `±${gpsAccuracy.toFixed(0)}m`;
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.velocity.y > 500 || info.offset.y > 100) {
      toggleMinimize();
    } else if (info.velocity.y < -500 || info.offset.y < -100) {
      if (isMinimized) toggleMinimize();
    }
  };

  const handleComplete = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const success = await completeVisit();
      if (success && onCompleteVisit) {
        onCompleteVisit();
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
    updateNotes(value);
  };

  const handleTakePhoto = () => {
    addPhoto();
    if (onTakePhoto) onTakePhoto();
  };

  const handleNavigation = () => {
    if (activeVisit.targetCoordinates) {
      const { latitude, longitude } = activeVisit.targetCoordinates;
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
    }
    if (onOpenNavigation) onOpenNavigation();
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={dragConstraintsRef}
        className={cn(
          "fixed left-0 right-0 z-[9999] bg-background border-t shadow-2xl",
          "rounded-t-3xl overflow-hidden",
          "bottom-0"
        )}
        initial={{ y: "100%" }}
        animate={{ 
          y: 0,
          height: isMinimized ? "auto" : "70vh"
        }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: -200, bottom: 200 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        data-testid="active-visit-overlay"
      >
        {/* Drag Handle */}
        <div 
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
          onClick={toggleMinimize}
        >
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Minimized View */}
        {isMinimized ? (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              {/* Site Info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{activeVisit.siteName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="font-mono">{formatTime(elapsedTime)}</span>
                    <span className={cn("flex items-center gap-1", getGpsStatusColor())}>
                      <Satellite className="h-3 w-3" />
                      {getGpsStatusText()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <Button 
                  size="icon" 
                  variant="outline"
                  onClick={handleTakePhoto}
                  data-testid="button-quick-photo"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon"
                  onClick={toggleMinimize}
                  data-testid="button-expand-overlay"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded View */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header with Map Background */}
            <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 text-white p-4">
              {/* Grid Overlay Pattern */}
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: '20px 20px'
                }}
              />
              
              {/* Status Bar */}
              <div className="flex items-center justify-between mb-4 relative">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "border-0 text-xs",
                      isGpsActive 
                        ? "bg-green-500/20 text-green-300" 
                        : "bg-red-500/20 text-red-300"
                    )}
                  >
                    {isGpsActive ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                    {isGpsActive ? 'Online' : 'Offline'}
                  </Badge>
                  <Badge variant="outline" className="border-0 bg-white/10 text-white text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Badge>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="text-white h-8 w-8"
                  onClick={toggleMinimize}
                  data-testid="button-minimize-overlay"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>

              {/* Mission Banner */}
              <div className="flex items-start justify-between relative">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-blue-500 text-white text-xs">
                      #{activeVisit.siteCode}
                    </Badge>
                    <Badge 
                      className={cn(
                        "text-xs",
                        activeVisit.status === 'active' 
                          ? "bg-green-500 text-white" 
                          : "bg-yellow-500 text-black"
                      )}
                    >
                      {activeVisit.status === 'active' ? 'In Progress' : 'Paused'}
                    </Badge>
                  </div>
                  <h2 className="text-lg font-bold mb-1">{activeVisit.siteName}</h2>
                  <p className="text-sm text-white/70">
                    {activeVisit.locality}, {activeVisit.state}
                  </p>
                </div>

                {/* Live Timer */}
                <div className="text-right">
                  <div className="text-3xl font-mono font-bold text-green-400">
                    {formatTime(elapsedTime)}
                  </div>
                  <p className="text-xs text-white/60">Duration</p>
                </div>
              </div>

              {/* Pulsing Target Pin Indicator */}
              <div className="absolute right-4 bottom-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-25" />
                  <div className="w-3 h-3 bg-red-500 rounded-full relative z-10" />
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b bg-muted/30">
              {[
                { id: 'overview', label: 'Overview', icon: Target },
                { id: 'notes', label: 'Notes', icon: FileText },
                { id: 'technical', label: 'Technical', icon: Compass },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                    activeTab === tab.id 
                      ? "text-primary border-b-2 border-primary bg-primary/5" 
                      : "text-muted-foreground"
                  )}
                  data-testid={`tab-${tab.id}`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'overview' && (
                <>
                  {/* GPS Status Card */}
                  <Card className={cn(
                    "border-2",
                    !isGpsActive ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                    gpsAccuracy !== null && gpsAccuracy <= 10 ? "border-green-200 bg-green-50 dark:bg-green-950/20" :
                    "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            !isGpsActive ? "bg-red-500" :
                            gpsAccuracy !== null && gpsAccuracy <= 10 ? "bg-green-500" :
                            "bg-yellow-500"
                          )}>
                            <Satellite className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold">GPS Status</p>
                            <p className="text-sm text-muted-foreground">
                              {!isGpsActive ? 'Signal lost' : 
                               gpsAccuracy !== null && gpsAccuracy <= 10 ? 'Excellent accuracy' :
                               'Acquiring better signal...'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-2xl font-bold", getGpsStatusColor())}>
                            {getGpsStatusText()}
                          </p>
                          {activeVisit.coordinates && (
                            <p className="text-xs text-muted-foreground">
                              {activeVisit.coordinates.latitude.toFixed(5)}, {activeVisit.coordinates.longitude.toFixed(5)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Camera className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                        <p className="text-2xl font-bold">{activeVisit.photoCount}</p>
                        <p className="text-xs text-muted-foreground">Photos</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <FileText className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                        <p className="text-2xl font-bold">{localNotes.length > 0 ? 'Yes' : 'No'}</p>
                        <p className="text-xs text-muted-foreground">Notes Added</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Activity Info */}
                  {activeVisit.activity && (
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground mb-1">Activity Type</p>
                        <p className="font-medium">{activeVisit.activity}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Alerts */}
                  {!isGpsActive && (
                    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                      <CardContent className="p-4 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-amber-900 dark:text-amber-100">GPS Signal Lost</p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            Move to an open area for better signal
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Visit Notes</label>
                    <Textarea
                      value={localNotes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Add observations, issues, or important details about this visit..."
                      className="min-h-[200px] text-base"
                      data-testid="textarea-visit-notes"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Notes are automatically saved as you type
                  </p>
                </div>
              )}

              {activeTab === 'technical' && (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Compass className="h-4 w-4" />
                        Device Diagnostics
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">GPS Accuracy</span>
                          <span className={cn("font-mono text-sm", getGpsStatusColor())}>
                            {gpsAccuracy !== null ? `±${gpsAccuracy.toFixed(1)}m` : 'N/A'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Latitude</span>
                          <span className="font-mono text-sm">
                            {activeVisit.coordinates?.latitude.toFixed(6) || 'N/A'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Longitude</span>
                          <span className="font-mono text-sm">
                            {activeVisit.coordinates?.longitude.toFixed(6) || 'N/A'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Started At</span>
                          <span className="font-mono text-sm">
                            {new Date(activeVisit.startedAt).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Visit ID</span>
                          <span className="font-mono text-sm text-muted-foreground">
                            {activeVisit.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Signal className="h-4 w-4" />
                        Connection Status
                      </h3>
                      
                      <div className="flex items-center gap-3">
                        {isGpsActive ? (
                          <Badge className="bg-green-500">Connected</Badge>
                        ) : (
                          <Badge variant="destructive">Disconnected</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {isGpsActive ? 'Real-time sync active' : 'Working offline'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="border-t bg-background p-4 space-y-3">
              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={handleTakePhoto}
                  data-testid="button-take-photo"
                >
                  <Camera className="h-4 w-4" />
                  Photo ({activeVisit.photoCount})
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={handleNavigation}
                  disabled={!activeVisit.targetCoordinates}
                  data-testid="button-navigate"
                >
                  <Navigation className="h-4 w-4" />
                  Navigate
                </Button>

                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={activeVisit.status === 'active' ? pauseVisit : resumeVisit}
                  data-testid="button-pause-resume"
                >
                  {activeVisit.status === 'active' ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Complete Visit Button */}
              <Button 
                className="w-full h-12 text-base gap-2 bg-green-600 hover:bg-green-700"
                onClick={handleComplete}
                disabled={isCompleting || activeVisit.photoCount === 0}
                data-testid="button-complete-visit"
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Complete Visit
                  </>
                )}
              </Button>
              
              {activeVisit.photoCount === 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  At least 1 photo is required to complete the visit
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
