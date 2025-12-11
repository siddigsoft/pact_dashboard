import { useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import { JitsiIncomingCall } from '@/context/communications/CallContext';
import { notificationSoundService } from '@/services/NotificationSoundService';

interface IncomingJitsiCallProps {
  call: JitsiIncomingCall;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingJitsiCall({ call, onAccept, onReject }: IncomingJitsiCallProps) {
  useEffect(() => {
    // Play ringtone
    notificationSoundService.play('ringtone');
    
    // Set up continuous ringing
    const ringInterval = setInterval(() => {
      notificationSoundService.play('ringtone');
    }, 3000);

    return () => {
      clearInterval(ringInterval);
    };
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={true} onOpenChange={() => onReject()}>
      <DialogContent className="sm:max-w-md bg-gradient-to-b from-gray-900 to-gray-950 border-gray-800">
        <div className="flex flex-col items-center py-8 space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <Avatar className="h-24 w-24 border-4 border-green-500/50">
              <AvatarImage src={call.callerAvatar} alt={call.callerName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl">
                {getInitials(call.callerName)}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-white">{call.callerName}</h2>
            <p className="text-gray-400 flex items-center justify-center gap-2">
              {call.isAudioOnly ? (
                <>
                  <Mic className="h-4 w-4" />
                  Incoming voice call...
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" />
                  Incoming video call...
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-8 pt-4">
            <Button
              onClick={onReject}
              variant="destructive"
              size="lg"
              className="h-16 w-16 rounded-full p-0"
              data-testid="button-reject-jitsi-call"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>

            <Button
              onClick={onAccept}
              size="lg"
              className="h-16 w-16 rounded-full p-0 bg-green-500 hover:bg-green-600"
              data-testid="button-accept-jitsi-call"
            >
              <Phone className="h-7 w-7" />
            </Button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Tap to accept or reject the call
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
