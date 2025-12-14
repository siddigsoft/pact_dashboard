import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveVisit } from '@/context/ActiveVisitContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { calculateDistance } from '@/utils/collectorUtils';
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
  Compass,
  Target,
  FileText,
  AlertCircle,
  Pause,
  Play,
  Loader2,
  Satellite,
  Phone,
  MessageSquare,
  RefreshCw,
  CloudOff,
  Cloud
} from 'lucide-react';

const SITE_VISIT_COMPLETION_PROXIMITY_METERS = 25;
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { syncManager, type SyncProgress } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';
import PactLogo from '@/assets/logo.png';

interface ActiveVisitOverlayProps {
  onCompleteVisit?: () => void;
  onTakePhoto?: () => void;
  onOpenNavigation?: () => void;
  onCallSupervisor?: () => void;
  onMessageSupervisor?: () => void;
  supervisorName?: string;
  supervisorRole?: string;
}

export function ActiveVisitOverlay({ 
  onCompleteVisit, 
  onTakePhoto,
  onOpenNavigation,
  onCallSupervisor,
  onMessageSupervisor,
  supervisorName = 'Supervisor',
  supervisorRole = 'Field Coordinator'
}: ActiveVisitOverlayProps) {
  const { t } = useTranslation();
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

  const [activeTab, setActiveTab] = useState<'overview' | 'submissions' | 'technical'>('overview');
  const [isCompleting, setIsCompleting] = useState(false);
  const [localNotes, setLocalNotes] = useState('');
  const dragConstraintsRef = useRef(null);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    const refreshStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (e) {
        console.error('Failed to get stats:', e);
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const unsubProgress = syncManager.onProgress(setSyncProgress);
    const unsubComplete = syncManager.onComplete(() => refreshStats());
    
    refreshStats();
    const interval = setInterval(refreshStats, 10000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);
  
  const handleSync = async () => {
    if (!isOnline || syncProgress.isRunning) return;
    hapticPresets.buttonPress();
    await syncManager.forceSync();
  };
  
  const handleCall = () => {
    hapticPresets.buttonPress();
    onCallSupervisor?.();
  };
  
  const handleMessage = () => {
    hapticPresets.buttonPress();
    onMessageSupervisor?.();
  };

  useEffect(() => {
    if (activeVisit?.notes) {
      setLocalNotes(activeVisit.notes);
    }
  }, [activeVisit?.notes]);

  if (!activeVisit) return null;

  const distanceToSite = useMemo(() => {
    if (!activeVisit.coordinates || !activeVisit.targetCoordinates) return null;
    const distanceKm = calculateDistance(
      activeVisit.coordinates.latitude,
      activeVisit.coordinates.longitude,
      activeVisit.targetCoordinates.latitude,
      activeVisit.targetCoordinates.longitude
    );
    return distanceKm * 1000;
  }, [activeVisit.coordinates, activeVisit.targetCoordinates]);

  const isWithinProximity = distanceToSite !== null && distanceToSite <= SITE_VISIT_COMPLETION_PROXIMITY_METERS;
  const canComplete = activeVisit.photoCount > 0 && isWithinProximity;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getGpsStatusText = () => {
    if (!isGpsActive) return t('gps.off');
    if (gpsAccuracy === null) return t('gps.acquiring');
    return `±${gpsAccuracy.toFixed(0)}m`;
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Swipe down to minimize, swipe up to expand
    if (info.velocity.y > 500 || info.offset.y > 100) {
      hapticPresets.swipe();
      if (!isMinimized) toggleMinimize();
    } else if (info.velocity.y < -500 || info.offset.y < -100) {
      hapticPresets.swipe();
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
          "fixed left-0 right-0 z-[9999] bg-white dark:bg-black",
          "rounded-t-3xl overflow-hidden shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)]",
          "bottom-0"
        )}
        initial={{ y: "100%" }}
        animate={{ 
          y: 0,
          height: isMinimized ? "auto" : "75vh"
        }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: -200, bottom: 200 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        data-testid="active-visit-overlay"
      >
        {/* Drag Handle - Uber style */}
        <div 
          className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
          onClick={toggleMinimize}
        >
          <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
        </div>

        {/* Minimized View - Uber style compact bar */}
        {isMinimized ? (
          <div className="px-5 pb-6">
            <div className="flex items-center justify-between gap-4">
              {/* PACT Marker - Uber style black circle with logo */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
                  <img src={PactLogo} alt="PACT" className="h-7 w-7 object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg text-black dark:text-white truncate">
                    {activeVisit.siteName}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-black/60 dark:text-white/60">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="h-4 w-4" />
                      <span className="font-mono">{formatTime(elapsedTime)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Satellite className="h-4 w-4" />
                      {getGpsStatusText()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions - Pill buttons */}
              <div className="flex items-center gap-2">
                {/* Sync Button */}
                <Button 
                  size="icon" 
                  variant={!isOnline ? "destructive" : pendingCount > 0 ? "default" : "outline"}
                  className="rounded-full h-11 w-11"
                  onClick={handleSync}
                  disabled={!isOnline || syncProgress.isRunning}
                  data-testid="button-quick-sync"
                  aria-label={!isOnline ? 'Offline' : syncProgress.isRunning ? 'Syncing' : `Sync ${pendingCount} items`}
                >
                  {!isOnline ? (
                    <CloudOff className="h-5 w-5" />
                  ) : syncProgress.isRunning ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-5 w-5" />
                  )}
                </Button>
                {/* Call Button */}
                <Button 
                  size="icon" 
                  variant="outline"
                  className="rounded-full h-11 w-11 border-black/20 dark:border-white/20"
                  onClick={handleCall}
                  data-testid="button-quick-call"
                  aria-label={`Call ${supervisorName}`}
                >
                  <Phone className="h-5 w-5" />
                </Button>
                {/* Message Button */}
                <Button 
                  size="icon" 
                  variant="outline"
                  className="rounded-full h-11 w-11 border-black/20 dark:border-white/20"
                  onClick={handleMessage}
                  data-testid="button-quick-message"
                  aria-label={`Message ${supervisorName}`}
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
                <Button 
                  size="icon" 
                  variant="outline"
                  className="rounded-full h-11 w-11 border-black/20 dark:border-white/20"
                  onClick={handleTakePhoto}
                  data-testid="button-quick-photo"
                  aria-label="Take photo"
                >
                  <Camera className="h-5 w-5" />
                </Button>
                <Button 
                  size="icon"
                  className="rounded-full h-11 w-11 bg-black dark:bg-white text-white dark:text-black"
                  onClick={toggleMinimize}
                  data-testid="button-expand-overlay"
                  aria-label="Expand visit details"
                >
                  <ChevronUp className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {/* Pending Sync Indicator */}
            {pendingCount > 0 && (
              <div className="px-5 pb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/50 dark:text-white/50">
                    {!isOnline ? 'Working offline' : `${pendingCount} items pending sync`}
                  </span>
                  {isOnline && !syncProgress.isRunning && (
                    <button 
                      onClick={handleSync}
                      className="text-black dark:text-white font-medium"
                      data-testid="button-sync-link"
                      aria-label={`Sync ${pendingCount} pending items`}
                    >
                      Sync Now
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Expanded View - Uber style */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header - Stark black with white text */}
            <div className="relative bg-black dark:bg-white text-white dark:text-black px-5 py-5">
              {/* Grid Pattern - Subtle map texture */}
              <div 
                className="absolute inset-0 opacity-5"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
                  `,
                  backgroundSize: '24px 24px'
                }}
              />
              
              {/* Top Row - Status badges as pills */}
              <div className="flex items-center justify-between mb-5 relative">
                <div className="flex items-center gap-2">
                  {/* Active Mission Badge - Black pill white text (inverted in header) */}
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold",
                    "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                  )}>
                    {isGpsActive ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {isGpsActive ? 'Online' : 'Offline'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/80 dark:bg-black/10 dark:text-black/80">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="text-white dark:text-black h-9 w-9 rounded-full hover:bg-white/10 dark:hover:bg-black/10"
                  onClick={toggleMinimize}
                  data-testid="button-minimize-overlay"
                  aria-label="Minimize visit details"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>

              {/* Mission Info */}
              <div className="flex items-start justify-between relative">
                <div className="flex-1 pr-4">
                  {/* Mission Badge - Black pill with white text */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white text-black dark:bg-black dark:text-white">
                      #{activeVisit.siteCode}
                    </span>
                    <span className={cn(
                      "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                      activeVisit.status === 'active' 
                        ? "bg-white text-black dark:bg-black dark:text-white" 
                        : "bg-white/50 text-black dark:bg-black/50 dark:text-white"
                    )}>
                      {activeVisit.status === 'active' ? 'IN PROGRESS' : 'PAUSED'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold mb-1">{activeVisit.siteName}</h2>
                  <p className="text-base text-white/70 dark:text-black/70">
                    {activeVisit.locality}, {activeVisit.state}
                  </p>
                </div>

                {/* Live Timer - Large mono */}
                <div className="text-right">
                  <div className="text-4xl font-mono font-bold tracking-tight">
                    {formatTime(elapsedTime)}
                  </div>
                  <p className="text-sm text-white/50 dark:text-black/50 uppercase tracking-wider">Duration</p>
                </div>
              </div>

              {/* Pulsing Indicator */}
              <div className="absolute right-5 bottom-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-white dark:bg-black rounded-full animate-ping opacity-30" />
                  <div className="w-3 h-3 bg-white dark:bg-black rounded-full relative z-10" />
                </div>
              </div>
            </div>

            {/* Tab Navigation - Pill Selectors */}
            <div className="flex gap-2 p-4 bg-white dark:bg-black">
              {[
                { id: 'overview', label: 'Overview', icon: Target },
                { id: 'submissions', label: 'Submissions', icon: FileText },
                { id: 'technical', label: 'Technical', icon: Compass },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  aria-label={`View ${tab.label.toLowerCase()} tab`}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full text-sm font-semibold transition-all",
                    activeTab === tab.id 
                      ? "bg-black text-white dark:bg-white dark:text-black" 
                      : "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60"
                  )}
                  data-testid={`tab-${tab.id}`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content - Floating Cards with shadows, no borders */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50 dark:bg-neutral-950">
              {activeTab === 'overview' && (
                <>
                  {/* GPS Status - Floating Card */}
                  <div className={cn(
                    "rounded-2xl p-5 shadow-lg",
                    "bg-white dark:bg-neutral-900"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Car Marker - Black circle white icon */}
                        <div className={cn(
                          "w-14 h-14 rounded-full flex items-center justify-center shadow-md",
                          "bg-black dark:bg-white"
                        )}>
                          <Satellite className="h-7 w-7 text-white dark:text-black" />
                        </div>
                        <div>
                          <p className="font-bold text-lg text-black dark:text-white">GPS Status</p>
                          <p className="text-sm text-black/50 dark:text-white/50">
                            {!isGpsActive ? 'Signal lost' : 
                             gpsAccuracy !== null && gpsAccuracy <= 10 ? 'Excellent accuracy' :
                             'Acquiring signal...'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-3xl font-bold font-mono",
                          !isGpsActive ? "text-black/30 dark:text-white/30" : "text-black dark:text-white"
                        )}>
                          {getGpsStatusText()}
                        </p>
                        {activeVisit.coordinates && (
                          <p className="text-xs text-black/40 dark:text-white/40 font-mono">
                            {activeVisit.coordinates.latitude.toFixed(5)}, {activeVisit.coordinates.longitude.toFixed(5)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* KPI Grid - Floating Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900 text-center">
                      <div className="w-12 h-12 rounded-full bg-black dark:bg-white mx-auto mb-3 flex items-center justify-center">
                        <Camera className="h-6 w-6 text-white dark:text-black" />
                      </div>
                      <p className="text-3xl font-bold text-black dark:text-white">{activeVisit.photoCount}</p>
                      <p className="text-sm text-black/50 dark:text-white/50">Photos</p>
                    </div>
                    <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900 text-center">
                      <div className="w-12 h-12 rounded-full bg-black dark:bg-white mx-auto mb-3 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-white dark:text-black" />
                      </div>
                      <p className="text-3xl font-bold text-black dark:text-white">{localNotes.length > 0 ? 'Yes' : 'No'}</p>
                      <p className="text-sm text-black/50 dark:text-white/50">Notes Added</p>
                    </div>
                  </div>

                  {/* Activity Info - Floating Card */}
                  {activeVisit.activity && (
                    <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900">
                      <p className="text-sm text-black/50 dark:text-white/50 mb-1">Activity Type</p>
                      <p className="font-bold text-lg text-black dark:text-white">{activeVisit.activity}</p>
                    </div>
                  )}

                  {/* Alert - Floating Card */}
                  {!isGpsActive && (
                    <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="h-6 w-6 text-white dark:text-black" />
                      </div>
                      <div>
                        <p className="font-bold text-black dark:text-white">GPS Signal Lost</p>
                        <p className="text-sm text-black/50 dark:text-white/50">
                          Move to an open area for better signal
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'submissions' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900">
                    <label className="text-sm font-bold text-black dark:text-white mb-3 block uppercase tracking-wider">
                      Visit Notes
                    </label>
                    <Textarea
                      value={localNotes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Add observations, issues, or important details..."
                      className="min-h-[180px] text-base border-0 bg-gray-50 dark:bg-neutral-800 rounded-xl resize-none focus-visible:ring-1 focus-visible:ring-black dark:focus-visible:ring-white"
                      data-testid="textarea-visit-notes"
                    />
                    <p className="text-xs text-black/40 dark:text-white/40 mt-3">
                      Auto-saved as you type
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'technical' && (
                <div className="space-y-4">
                  {/* Device Diagnostics - Floating Card */}
                  <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900">
                    <h3 className="font-bold text-black dark:text-white flex items-center gap-2 mb-4">
                      <Compass className="h-5 w-5" />
                      Device Diagnostics
                    </h3>
                    
                    <div className="space-y-4">
                      {[
                        { label: 'GPS Accuracy', value: gpsAccuracy !== null ? `±${gpsAccuracy.toFixed(1)}m` : 'N/A' },
                        { label: 'Latitude', value: activeVisit.coordinates?.latitude.toFixed(6) || 'N/A' },
                        { label: 'Longitude', value: activeVisit.coordinates?.longitude.toFixed(6) || 'N/A' },
                        { label: 'Started At', value: new Date(activeVisit.startedAt).toLocaleTimeString() },
                        { label: 'Visit ID', value: activeVisit.id.slice(0, 8) + '...' },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-black/5 dark:border-white/5 last:border-0">
                          <span className="text-sm text-black/50 dark:text-white/50">{item.label}</span>
                          <span className="font-mono text-sm font-medium text-black dark:text-white">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Connection Status - Floating Card */}
                  <div className="rounded-2xl p-5 shadow-lg bg-white dark:bg-neutral-900">
                    <h3 className="font-bold text-black dark:text-white flex items-center gap-2 mb-3">
                      <Wifi className="h-5 w-5" />
                      Connection Status
                    </h3>
                    
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold",
                        isGpsActive 
                          ? "bg-black text-white dark:bg-white dark:text-black" 
                          : "bg-black/10 text-black dark:bg-white/10 dark:text-white"
                      )}>
                        {isGpsActive ? 'CONNECTED' : 'OFFLINE'}
                      </span>
                      <span className="text-sm text-black/50 dark:text-white/50">
                        {isGpsActive ? 'Real-time sync active' : 'Working offline'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar - Pill Buttons */}
            <div className="bg-white dark:bg-black p-5 space-y-4 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
              {/* Communication & Sync Row */}
              <div className="flex gap-3">
                {/* Sync Status/Button */}
                <Button 
                  variant={!isOnline ? "destructive" : pendingCount > 0 ? "default" : "outline"}
                  className="flex-1 gap-2 rounded-full h-12 font-semibold"
                  onClick={handleSync}
                  disabled={!isOnline || syncProgress.isRunning}
                  data-testid="button-sync-expanded"
                  aria-label={!isOnline ? 'Offline' : syncProgress.isRunning ? 'Syncing' : `Sync ${pendingCount} items`}
                >
                  {!isOnline ? (
                    <>
                      <CloudOff className="h-5 w-5" />
                      Offline
                    </>
                  ) : syncProgress.isRunning ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      {pendingCount > 0 ? <Cloud className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
                      {pendingCount > 0 ? `${pendingCount} pending` : 'Synced'}
                    </>
                  )}
                </Button>

                {/* Call Supervisor */}
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 rounded-full h-12 border-black/20 dark:border-white/20 font-semibold"
                  onClick={handleCall}
                  data-testid="button-call-expanded"
                  aria-label={`Call ${supervisorName}`}
                >
                  <Phone className="h-5 w-5" />
                  Call
                </Button>
                
                {/* Message Supervisor */}
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 rounded-full h-12 border-black/20 dark:border-white/20 font-semibold"
                  onClick={handleMessage}
                  data-testid="button-message-expanded"
                  aria-label={`Message ${supervisorName}`}
                >
                  <MessageSquare className="h-5 w-5" />
                  Message
                </Button>
              </div>

              {/* Quick Actions Row - Pill buttons */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 rounded-full h-12 border-black/20 dark:border-white/20 font-semibold"
                  onClick={handleTakePhoto}
                  data-testid="button-take-photo"
                  aria-label={`Take photo (${activeVisit.photoCount} captured)`}
                >
                  <Camera className="h-5 w-5" />
                  Photo ({activeVisit.photoCount})
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 rounded-full h-12 border-black/20 dark:border-white/20 font-semibold"
                  onClick={handleNavigation}
                  disabled={!activeVisit.targetCoordinates}
                  data-testid="button-navigate"
                  aria-label="Open navigation to site"
                >
                  <Navigation className="h-5 w-5" />
                  Navigate
                </Button>

                <Button 
                  variant="outline" 
                  size="icon"
                  className="rounded-full h-12 w-12 border-black/20 dark:border-white/20"
                  onClick={activeVisit.status === 'active' ? pauseVisit : resumeVisit}
                  data-testid="button-pause-resume"
                  aria-label={activeVisit.status === 'active' ? 'Pause visit' : 'Resume visit'}
                >
                  {activeVisit.status === 'active' ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
              </div>

              {/* Complete Button - Primary black pill */}
              <Button 
                className="w-full h-14 text-base gap-2 rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black font-bold"
                onClick={handleComplete}
                disabled={isCompleting || !canComplete}
                data-testid="button-complete-visit"
                aria-label={isCompleting ? 'Completing visit' : 'Complete site visit'}
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
              
              {!isWithinProximity && (
                <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                  You must be within {SITE_VISIT_COMPLETION_PROXIMITY_METERS}m of the site to complete.
                  {distanceToSite !== null && ` Current distance: ${distanceToSite.toFixed(0)}m`}
                </p>
              )}
              
              {isWithinProximity && activeVisit.photoCount === 0 && (
                <p className="text-xs text-center text-black/40 dark:text-white/40">
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
