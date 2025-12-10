import { useEffect, useRef, useCallback } from 'react';
import notificationSoundService from '@/services/NotificationSoundService';

export function useCallSounds(callStatus: string) {
  const previousStatus = useRef<string>('idle');

  useEffect(() => {
    if (callStatus === previousStatus.current) return;
    
    const prevStatus = previousStatus.current;
    previousStatus.current = callStatus;

    switch (callStatus) {
      case 'outgoing':
        notificationSoundService.play('ringback');
        break;
      case 'incoming':
        notificationSoundService.play('ringtone');
        break;
      case 'connected':
        notificationSoundService.play('call-connected');
        break;
      case 'ended':
      case 'idle':
        if (prevStatus === 'connected') {
          notificationSoundService.play('call-ended');
        } else {
          notificationSoundService.stopAll();
        }
        break;
      default:
        notificationSoundService.stopAll();
    }

    return () => {
      notificationSoundService.stopAll();
    };
  }, [callStatus]);

  const stopSounds = useCallback(() => {
    notificationSoundService.stopAll();
  }, []);

  return { stopSounds };
}

export default useCallSounds;
