import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface OnlineOfflineToggleProps {
  variant?: 'uber' | 'pill' | 'minimal' | 'floating';
  className?: string;
  mobileBottomOffset?: boolean;
}

export function OnlineOfflineToggle({ 
  variant = 'uber', 
  className = '',
  mobileBottomOffset = true
}: OnlineOfflineToggleProps) {
  const { currentUser, updateUserAvailability } = useUser();
  const [isOnline, setIsOnline] = useState<boolean>(currentUser?.availability === 'online');
  const [isLoading, setIsLoading] = useState(false);
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
    
    // Haptic feedback
    hapticPresets.buttonPress();
    
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
        
        // Success haptic
        hapticPresets.success();
        
        toast({
          title: newStatus === 'online' ? 'You are now Online' : 'You are now Offline',
          description: newStatus === 'online' 
            ? 'You can now receive and claim site visits' 
            : 'You will not receive new assignments while offline',
        });
      }
    } catch (error) {
      console.error("Error updating availability:", error);
      hapticPresets.error();
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

  // Floating position initialization
  useEffect(() => {
    if (variant !== 'floating') return;
    
    const saved = typeof window !== 'undefined' ? localStorage.getItem('uberTogglePos') : null;
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
  }, [mobileBottomOffset, variant]);

  useEffect(() => {
    if (variant !== 'floating') return;
    
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
  }, [position, variant]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isLoading || variant !== 'floating') return;
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
    if (!draggingRef.current || variant !== 'floating') return;
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
    requestAnimationFrame(() => {
      setPosition({ x: newX, y: newY });
    });
  };

  const onPointerUp = () => {
    if (!draggingRef.current || variant !== 'floating') return;
    draggingRef.current = false;
    if (movedRef.current && position) {
      try {
        localStorage.setItem('uberTogglePos', JSON.stringify(position));
      } catch {}
    }
  };

  // Uber-style large GO button (default)
  if (variant === 'uber') {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "relative flex flex-col items-center justify-center",
          "w-24 h-24 md:w-28 md:h-28",
          "rounded-full transition-all duration-300",
          "touch-manipulation select-none",
          "active:scale-95",
          isOnline 
            ? "bg-black dark:bg-white text-white dark:text-black shadow-lg shadow-black/20 dark:shadow-white/20" 
            : "bg-white dark:bg-black text-black dark:text-white border-4 border-black dark:border-white",
          isLoading ? "opacity-70" : "",
          className
        )}
        data-testid="button-go-online"
        aria-label={isOnline ? 'Go offline' : 'Go online'}
      >
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <>
            <span className="text-2xl md:text-3xl font-black tracking-tight">
              {isOnline ? 'END' : 'GO'}
            </span>
            <span className="text-[10px] md:text-xs font-medium mt-0.5 opacity-70">
              {isOnline ? 'Tap to stop' : 'Tap to start'}
            </span>
          </>
        )}
        
        {/* Pulsing ring when online */}
        {isOnline && !isLoading && (
          <span className="absolute inset-0 rounded-full animate-ping bg-black/20 dark:bg-white/20" style={{ animationDuration: '2s' }} />
        )}
      </button>
    );
  }

  // Pill-shaped toggle
  if (variant === 'pill') {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-3 px-6 py-3",
          "rounded-full transition-all duration-300",
          "touch-manipulation select-none",
          "active:scale-95",
          "min-h-[52px]",
          isOnline 
            ? "bg-black dark:bg-white text-white dark:text-black" 
            : "bg-white dark:bg-black text-black dark:text-white border-2 border-black dark:border-white",
          isLoading ? "opacity-70" : "",
          className
        )}
        data-testid="button-toggle-availability-pill"
        aria-label={isOnline ? 'Go offline' : 'Go online'}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            {/* Status indicator dot */}
            <span className={cn(
              "w-3 h-3 rounded-full",
              isOnline 
                ? "bg-white dark:bg-black animate-pulse" 
                : "bg-black/30 dark:bg-white/30"
            )} />
            
            <span className="text-base font-bold tracking-tight">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </>
        )}
      </button>
    );
  }

  // Minimal badge-style
  if (variant === 'minimal') {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-2 px-4 py-2",
          "rounded-full transition-all duration-200",
          "touch-manipulation select-none",
          "active:scale-95",
          "min-h-[40px]",
          isOnline 
            ? "bg-black dark:bg-white text-white dark:text-black" 
            : "bg-black/10 dark:bg-white/10 text-black dark:text-white",
          isLoading ? "opacity-70" : "",
          className
        )}
        data-testid="button-toggle-availability-minimal"
        aria-label={isOnline ? 'Go offline' : 'Go online'}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <span className={cn(
              "w-2 h-2 rounded-full",
              isOnline ? "bg-white dark:bg-black" : "bg-black/30 dark:bg-white/30"
            )} />
            <span className="text-sm font-semibold">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </>
        )}
      </button>
    );
  }

  // Floating draggable variant
  if (variant === 'floating') {
    return (
      <div 
        ref={containerRef}
        className={cn(
          "fixed z-50",
          !position ? (mobileBottomOffset ? "right-4 bottom-24 md:bottom-6" : "right-4 bottom-6") : "",
          className
        )}
        style={position ? { 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          willChange: draggingRef.current ? 'transform' : 'auto',
          transition: draggingRef.current ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out'
        } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <button
          onClick={(e) => {
            if (movedRef.current) {
              e.preventDefault();
              e.stopPropagation();
              movedRef.current = false;
              return;
            }
            handleToggle();
          }}
          disabled={isLoading}
          className={cn(
            "relative flex flex-col items-center justify-center",
            "w-16 h-16 md:w-20 md:h-20",
            "rounded-full transition-all duration-300",
            "shadow-xl",
            "touch-manipulation select-none",
            "active:scale-95",
            isOnline 
              ? "bg-black dark:bg-white text-white dark:text-black" 
              : "bg-white dark:bg-black text-black dark:text-white border-2 border-black dark:border-white",
            isLoading ? "opacity-70" : ""
          )}
          data-testid="button-go-online-floating"
          aria-label={isOnline ? 'Go offline' : 'Go online'}
        >
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <span className="text-lg md:text-xl font-black">
                {isOnline ? 'END' : 'GO'}
              </span>
              <span className="text-[8px] font-medium opacity-70">
                {isOnline ? 'online' : 'offline'}
              </span>
            </>
          )}
          
          {/* Pulsing indicator when online */}
          {isOnline && !isLoading && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-white dark:bg-black rounded-full border-2 border-black dark:border-white animate-pulse" />
          )}
        </button>
      </div>
    );
  }

  return null;
}

export default OnlineOfflineToggle;
