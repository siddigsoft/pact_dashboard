import React, { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface OnlineOfflineToggleProps {
  variant?: 'floating' | 'inline' | 'compact';
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
  const { toast } = useToast();

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

  if (variant === 'floating') {
    return (
      <div 
        className={cn(
          "fixed right-4 z-50",
          mobileBottomOffset ? "bottom-24 md:bottom-6" : "bottom-6",
          "bg-background/95 backdrop-blur-md shadow-xl rounded-full",
          "border-2 transition-all duration-300 cursor-pointer",
          isOnline ? "border-green-500 shadow-green-500/20" : "border-gray-300 dark:border-gray-600",
          isLoading ? "opacity-70" : "",
          className
        )}
        onClick={handleToggle}
        data-testid="toggle-online-offline-floating"
      >
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 min-h-[56px]",
            "touch-manipulation select-none",
            "transition-transform active:scale-95"
          )}
        >
          <div className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
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
          
          {showLabel && (
            <div className="flex flex-col items-start">
              <span className={cn(
                "text-sm font-semibold",
                isOnline ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
              )}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isOnline ? 'Receiving tasks' : 'Tap to go online'}
              </span>
            </div>
          )}
          
          <Switch
            checked={isOnline}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            className={cn(
              "ml-2",
              isOnline ? "data-[state=checked]:bg-green-500" : ""
            )}
          />
        </div>
      </div>
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
