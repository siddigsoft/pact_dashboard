
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { CallType } from '@/context/communications/CommunicationContext';

interface CallInterfaceProps {
  recipient: {
    id: string;
    name: string;
    avatar?: string;
  };
  callType: string;
  duration?: number;
  onAccept?: () => void;
  onDecline?: () => void;
  onEnd: () => void;
  minimized?: boolean;
}

const CallInterface: React.FC<CallInterfaceProps> = ({
  recipient,
  callType,
  duration = 0,
  onAccept,
  onDecline,
  onEnd,
  minimized = false
}) => {
  const [callDuration, setCallDuration] = useState(duration);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  
  // Format duration in minutes:seconds
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // Increment call duration timer when connected
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callType === 'connected') {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callType]);
  
  // Reset duration when call ends
  useEffect(() => {
    if (callType !== 'connected') {
      setCallDuration(duration);
    }
  }, [callType, duration]);

  if (minimized) {
    return (
      <div className="fixed bottom-20 right-4 bg-primary text-white p-2 rounded-lg flex items-center gap-2 shadow-lg">
        <Avatar className="h-8 w-8">
          {recipient.avatar ? (
            <img src={recipient.avatar} alt={recipient.name} />
          ) : (
            <div className="bg-primary-foreground text-primary w-full h-full flex items-center justify-center font-medium">
              {recipient.name.charAt(0).toUpperCase()}
            </div>
          )}
        </Avatar>
        <div className="flex flex-col">
          <span className="text-xs font-medium">{recipient.name}</span>
          <span className="text-xs">{formatDuration(callDuration)}</span>
        </div>
        <Button onClick={onEnd} size="icon" variant="destructive" className="h-6 w-6 ml-2">
          <PhoneOff className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 max-w-md w-full mx-auto">
      <div className="flex flex-col items-center space-y-4">
        {/* Recipient Info */}
        <div className="text-center">
          <Avatar className="h-20 w-20 mx-auto mb-4">
            {recipient.avatar ? (
              <img src={recipient.avatar} alt={recipient.name} className="rounded-full" />
            ) : (
              <div className="bg-primary-foreground text-primary w-full h-full rounded-full flex items-center justify-center text-xl font-medium">
                {recipient.name.charAt(0).toUpperCase()}
              </div>
            )}
          </Avatar>
          <h3 className="text-lg font-medium">{recipient.name}</h3>
          <p className="text-sm text-muted-foreground">
            {callType === 'incoming' && 'Incoming call...'}
            {callType === 'outgoing' && 'Calling...'}
            {callType === 'connected' && formatDuration(callDuration)}
          </p>
        </div>
        
        {/* Call Controls */}
        <div className="flex justify-center space-x-4 mt-4 w-full">
          {callType === 'incoming' && (
            <>
              <Button 
                variant="destructive" 
                size="lg" 
                className="rounded-full h-14 w-14"
                onClick={onDecline}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              
              <Button 
                variant="default" 
                size="lg" 
                className="rounded-full h-14 w-14 bg-green-500 hover:bg-green-600"
                onClick={onAccept}
              >
                <Phone className="h-6 w-6" />
              </Button>
            </>
          )}
          
          {callType === 'outgoing' && (
            <Button 
              variant="destructive" 
              size="lg" 
              className="rounded-full h-14 w-14"
              onClick={onEnd}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          )}
          
          {callType === 'connected' && (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                className={`rounded-full h-12 w-12 ${isMuted ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : ''}`}
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              
              <Button 
                variant="destructive" 
                size="lg" 
                className="rounded-full h-14 w-14"
                onClick={onEnd}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              
              <Button 
                variant="outline" 
                size="icon" 
                className={`rounded-full h-12 w-12 ${isVideoOff ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : ''}`}
                onClick={() => setIsVideoOff(!isVideoOff)}
              >
                {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
