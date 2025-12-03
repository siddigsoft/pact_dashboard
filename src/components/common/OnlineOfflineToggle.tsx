import React, { useState, useEffect, useRef } from 'react';
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface OnlineOfflineToggleProps {
  variant?: 'floating' | 'inline' | 'compact' | 'drawer';
  className?: string;
  showLabel?: boolean;
  mobileBottomOffset?: boolean;
}

export function OnlineOfflineToggle({ 
  variant = 'floating', 
  className = '',
  showLabel = true,
  mobileBottomOffset = true
}: OnlineOfflineToggleProps) {
  const { currentUser, updateUserAvailability } = useUser();
  const [isOnline, setIsOnline] = useState<boolean>(currentUser?.availability === 'online');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerPosition, setDrawerPosition] = useState<{ x: number; y: number } | null>(null);
  const drawerDraggingRef = useRef(false);
  const drawerMovedRef = useRef(false);
  const drawerStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const drawerStartElRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startElRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (currentUser) {
      setIsOnline(currentUser.availability === 'online');
    }
  }, [currentUser]);

  const handleToggle = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    const newStatus = isOnline ? 'offline' : 'online';
    
    try {
      if (currentUser) {
        const { error } = await supabase
          .from('profiles')
          .update({ 
            availability: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser.id);
          
        if (error) throw error;
        
        await updateUserAvailability(newStatus);
        setIsOnline(!isOnline);
        
        toast({
          title: newStatus === 'online' ? 'You are now Online' : 'You are now Offline',
          description: newStatus === 'online' 
            ? 'You can now receive and claim site visits' 
            : 'You will not receive new assignments while offline',
          variant: newStatus === 'online' ? 'default' : 'default',
        });
      }
    } catch (error) {
      console.error("Error updating availability:", error);
      toast({
        title: "Failed to update status",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) return null;

  const isDataCollectorOrCoordinator = ['datacollector', 'dataCollector', 'coordinator', 'enumerator'].includes(
    (currentUser.role || '').toLowerCase()
  );

  if (!isDataCollectorOrCoordinator) return null;

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('onlineTogglePos') : null;
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPosition(p);
        return;
      } catch {}
    }
    const init = () => {
      const el = containerRef.current;
      if (!el) return;
      const margin = 16;
      const isMd = window.matchMedia('(min-width: 768px)').matches;
      const bottom = isMd ? 24 : (mobileBottomOffset ? 96 : 24);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = Math.max(margin, window.innerWidth - w - margin);
      const y = Math.max(margin, window.innerHeight - h - bottom);
      setPosition({ x, y });
    };
    requestAnimationFrame(init);
  }, [mobileBottomOffset]);

  useEffect(() => {
    const onResize = () => {
      if (!position || !containerRef.current) return;
      const margin = 8;
      const el = containerRef.current;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxX = Math.max(margin, window.innerWidth - w - margin);
      const maxY = Math.max(margin, window.innerHeight - h - margin);
      setPosition({ x: Math.min(position.x, maxX), y: Math.min(position.y, maxY) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  // Drawer position initialization
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('onlineDrawerPos') : null;
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setDrawerPosition(p);
        return;
      } catch {}
    }
    // Default position: right edge, vertically centered
    const margin = 16;
    const x = window.innerWidth - 60 - margin; // 60px is tab width
    const y = Math.max(margin, window.innerHeight / 2 - 30); // 30px is half tab height
    setDrawerPosition({ x, y });
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (!drawerPosition) return;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - 60 - margin); // 60px tab width
      const maxY = Math.max(margin, window.innerHeight - 60 - margin); // 60px tab height
      setDrawerPosition({ 
        x: Math.min(drawerPosition.x, maxX), 
        y: Math.min(drawerPosition.y, maxY) 
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawerPosition]);

  // Prevent default touch behaviors during drag
  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (drawerDraggingRef.current) {
        e.preventDefault();
      }
    };

    const preventScroll = (e: WheelEvent) => {
      if (drawerDraggingRef.current) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('wheel', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', preventScroll);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isLoading) return;
    draggingRef.current = true;
    movedRef.current = false;
    startPointerRef.current = { x: e.clientX, y: e.clientY };
    const rect = containerRef.current?.getBoundingClientRect();
    startElRef.current = { x: rect?.left || 0, y: rect?.top || 0 };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startPointerRef.current.x;
    const dy = e.clientY - startPointerRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    const el = containerRef.current;
    if (!el) return;
    const margin = 8;
    let newX = startElRef.current.x + dx;
    let newY = startElRef.current.y + dy;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const maxX = window.innerWidth - w - margin;
    const maxY = window.innerHeight - h - margin;
    newX = Math.max(margin, Math.min(maxX, newX));
    newY = Math.max(margin, Math.min(maxY, newY));
    setPosition({ x: newX, y: newY });
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (movedRef.current && position) {
      try {
        localStorage.setItem('onlineTogglePos', JSON.stringify(position));
      } catch {}
    }
  };

  // Drawer drag handlers - More responsive
  const onDrawerPointerDown = (e: React.PointerEvent) => {
    if (isLoading) return;
    drawerDraggingRef.current = true;
    drawerMovedRef.current = false;
    setIsDragging(true);
    drawerStartPointerRef.current = { x: e.clientX, y: e.clientY };
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    drawerStartElRef.current = { x: rect.left, y: rect.top };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
    // Prevent any default touch behaviors
    e.preventDefault();
  };

  const onDrawerPointerMove = (e: React.PointerEvent) => {
    if (!drawerDraggingRef.current) return;
    e.preventDefault(); // Prevent scrolling while dragging

    const dx = e.clientX - drawerStartPointerRef.current.x;
    const dy = e.clientY - drawerStartPointerRef.current.y;

    // More sensitive movement detection - reduce threshold for immediate response
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drawerMovedRef.current = true;

    const margin = 8;
    let newX = drawerStartElRef.current.x + dx;
    let newY = drawerStartElRef.current.y + dy;
    const tabWidth = 60;
    const tabHeight = 60;
    const maxX = Math.max(margin, window.innerWidth - tabWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - tabHeight - margin);
    newX = Math.max(margin, Math.min(maxX, newX));
    newY = Math.max(margin, Math.min(maxY, newY));

    // Update position immediately without any throttling
    setDrawerPosition({ x: newX, y: newY });
  };

  const onDrawerPointerUp = (e: React.PointerEvent) => {
    if (!drawerDraggingRef.current) return;
    drawerDraggingRef.current = false;
    setIsDragging(false);

    // Save position immediately when drag ends
    if (drawerMovedRef.current && drawerPosition) {
      try {
        localStorage.setItem('onlineDrawerPos', JSON.stringify(drawerPosition));
      } catch {}
    }

    // Reset moved flag
    drawerMovedRef.current = false;
  };

  if (variant === 'floating') {
    return (
      <div 
        className={cn(
          "fixed z-50",
          !position ? (mobileBottomOffset ? "right-4 bottom-24 md:bottom-6" : "right-4 bottom-6") : "",
          "bg-background/95 backdrop-blur-md shadow-xl rounded-full",
          "border-2 transition-all duration-300 cursor-pointer",
          isOnline ? "border-green-500 shadow-green-500/20" : "border-gray-300 dark:border-gray-600",
          isLoading ? "opacity-70" : "",
          className
        )}
        ref={containerRef}
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => {
          if (movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            movedRef.current = false;
            return;
          }
          handleToggle();
        }}
        data-testid="toggle-online-offline-floating"
      >
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 min-h-[44px] md:gap-3 md:px-4 md:py-3 md:min-h-[56px]",
            "touch-manipulation select-none",
            "transition-transform active:scale-95"
          )}
        >
          <div className={cn(
            "flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full transition-colors",
            isOnline ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-100 dark:bg-gray-800"
          )}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-gray-500" />
            ) : isOnline ? (
              <Wifi className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400" />
            ) : (
              <WifiOff className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
            )}
          </div>
          
          {showLabel && (
            <div className="flex flex-col items-start">
              <span className={cn(
                "text-xs md:text-sm font-semibold",
                isOnline ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
              )}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
              <span className="hidden md:block text-xs text-muted-foreground">
                {isOnline ? 'Receiving tasks' : 'Tap to go online'}
              </span>
            </div>
          )}
          
          <Switch
            checked={isOnline}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            className={cn(
              "ml-2 scale-90 md:scale-100",
              isOnline ? "data-[state=checked]:bg-green-500" : ""
            )}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  if (variant === 'drawer') {
    return (
      <>
        {/* Full Drawer */}
        <div
          className={cn(
            "fixed z-40 transition-all duration-300 ease-in-out",
            "bg-background/95 backdrop-blur-md shadow-xl rounded-lg border",
            isOnline ? "border-green-500 shadow-green-500/20" : "border-gray-300 dark:border-gray-600",
            isDrawerOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          )}
          style={{
            left: drawerPosition ? `${drawerPosition.x - 280 + 60}px` : 'auto',
            top: drawerPosition ? `${drawerPosition.y - 100}px` : 'auto',
            width: '280px',
            minHeight: '200px'
          }}
        >
          <div className="p-4 space-y-4">
            {/* Header with close button */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Availability Status</h3>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-md hover:bg-muted transition-colors"
                aria-label="Close drawer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Status Display */}
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg border",
              isOnline 
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
            )}>
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full",
                isOnline ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-100 dark:bg-gray-800"
              )}>
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                ) : isOnline ? (
                  <Wifi className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <WifiOff className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-semibold",
                    isOnline ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-300"
                  )}>
                    {isOnline ? 'You are Online' : 'You are Offline'}
                  </span>
                  <Badge 
                    variant={isOnline ? "default" : "secondary"}
                    className={isOnline ? "bg-green-500" : ""}
                  >
                    {isOnline ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isOnline 
                    ? 'Receiving new site visit assignments' 
                    : 'Tap to go online and receive assignments'}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Switch
                checked={isOnline}
                onCheckedChange={handleToggle}
                disabled={isLoading}
                className={cn(
                  "scale-110",
                  isOnline ? "data-[state=checked]:bg-green-500" : ""
                )}
              />
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <button
                onClick={handleToggle}
                disabled={isLoading}
                className={cn(
                  "w-full px-3 py-2 text-sm rounded-md transition-all",
                  isOnline 
                    ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800" 
                    : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800",
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                )}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </div>
                ) : (
                  isOnline ? 'Go Offline' : 'Go Online'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Draggable Drawer Tab */}
        <div
          className={cn(
            "fixed z-50 transition-all duration-200 ease-out cursor-move select-none touch-none",
            "bg-background/95 backdrop-blur-md shadow-xl rounded-lg border",
            isOnline ? "border-green-500 shadow-green-500/20" : "border-gray-300 dark:border-gray-600",
            "hover:shadow-lg active:scale-95",
            isDragging ? "transition-none shadow-2xl scale-105 border-blue-500 shadow-blue-500/30" : ""
          )}
          style={{
            left: drawerPosition ? `${drawerPosition.x}px` : 'auto',
            top: drawerPosition ? `${drawerPosition.y}px` : 'auto',
            width: '60px',
            height: '60px',
            // Disable text selection and touch behaviors during drag
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            // Add will-change for better performance during drag
            willChange: isDragging ? 'transform' : 'auto'
          }}
          onPointerDown={onDrawerPointerDown}
          onPointerMove={onDrawerPointerMove}
          onPointerUp={onDrawerPointerUp}
          onClick={(e) => {
            if (drawerMovedRef.current) {
              e.preventDefault();
              e.stopPropagation();
              drawerMovedRef.current = false;
              return;
            }
            setIsDrawerOpen(!isDrawerOpen);
          }}
          data-testid="toggle-online-offline-drawer-tab"
        >
          <div className="flex flex-col items-center justify-center h-full space-y-1">
            {/* Status Icon */}
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full transition-colors",
              isOnline ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-100 dark:bg-gray-800"
            )}>
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
              ) : isOnline ? (
                <Wifi className="h-3 w-3 text-green-600 dark:text-green-400" />
              ) : (
                <WifiOff className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              )}
            </div>

            {/* Chevron */}
            <ChevronLeft className={cn(
              "h-3 w-3 transition-transform duration-300",
              isDrawerOpen ? "rotate-180" : ""
            )} />

            {/* Status Text */}
            <span className={cn(
              "text-[10px] font-medium leading-none",
              isOnline ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
            )}>
              {isOnline ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Backdrop */}
        {isDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            onClick={() => setIsDrawerOpen(false)}
          />
        )}
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-full transition-all",
          "border-2",
          isOnline 
            ? "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700" 
            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
          isLoading ? "opacity-70" : "",
          className
        )}
        data-testid="toggle-online-offline-compact"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isOnline ? (
          <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-gray-500" />
        )}
        <span className={cn(
          "text-sm font-medium",
          isOnline ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
        )}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </button>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-center gap-3 p-4 rounded-lg border",
        isOnline 
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
          : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700",
        className
      )}
      data-testid="toggle-online-offline-inline"
    >
      <div className={cn(
        "flex items-center justify-center w-12 h-12 rounded-full",
        isOnline ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-100 dark:bg-gray-800"
      )}>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        ) : isOnline ? (
          <Wifi className="h-6 w-6 text-green-600 dark:text-green-400" />
        ) : (
          <WifiOff className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        )}
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-semibold",
            isOnline ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-300"
          )}>
            {isOnline ? 'You are Online' : 'You are Offline'}
          </span>
          <Badge 
            variant={isOnline ? "default" : "secondary"}
            className={isOnline ? "bg-green-500" : ""}
          >
            {isOnline ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {isOnline 
            ? 'You can receive and claim new site visits' 
            : 'Toggle on to start receiving assignments'}
        </p>
      </div>
      
      <Switch
        checked={isOnline}
        onCheckedChange={handleToggle}
        disabled={isLoading}
        className={cn(
          "scale-125",
          isOnline ? "data-[state=checked]:bg-green-500" : ""
        )}
      />
    </div>
  );
}

export default OnlineOfflineToggle;
