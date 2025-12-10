import React from 'react';
import { useCall } from '@/context/communications/CallContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, X } from 'lucide-react';

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const GlobalCallOverlay: React.FC = () => {
  const { callState, acceptCall, rejectCall, endCall, toggleMute, isCallActive } = useCall();

  if (!isCallActive) return null;

  const { status, participant, duration, isMuted } = callState;
  const initials = participant?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';

  if (status === 'incoming') {
    return (
      <div 
        className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
        data-testid="overlay-incoming-call"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl border border-gray-200 dark:border-gray-700">
          <div className="mb-6">
            <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-green-500">
              <AvatarImage src={participant?.avatar} alt={participant?.name} />
              <AvatarFallback className="text-2xl bg-green-500 text-white font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white" data-testid="text-caller-name">
              {participant?.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 animate-pulse mt-1">Incoming call...</p>
          </div>

          <div className="flex justify-center gap-6">
            <Button
              size="lg"
              variant="destructive"
              className="rounded-full h-16 w-16"
              onClick={rejectCall}
              data-testid="button-decline-call"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
            <Button
              size="lg"
              className="rounded-full h-16 w-16 bg-green-500 hover:bg-green-600 text-white"
              onClick={acceptCall}
              data-testid="button-accept-call"
            >
              <Phone className="h-7 w-7" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'outgoing') {
    return (
      <div 
        className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
        data-testid="overlay-outgoing-call"
      >
        <div className="bg-card rounded-lg p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
          <div className="mb-6">
            <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-primary/30">
              <AvatarImage src={participant?.avatar} alt={participant?.name} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold" data-testid="text-callee-name">
              {participant?.name}
            </h2>
            <p className="text-muted-foreground">Calling...</p>
            <div className="flex justify-center gap-1 mt-2">
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>

          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16"
            onClick={endCall}
            data-testid="button-cancel-call"
          >
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div 
        className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
        data-testid="overlay-connecting-call"
      >
        <div className="bg-card rounded-lg p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
          <div className="mb-6">
            <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-yellow-500/30">
              <AvatarImage src={participant?.avatar} alt={participant?.name} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold">{participant?.name}</h2>
            <p className="text-yellow-500">Connecting...</p>
          </div>

          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16"
            onClick={endCall}
            data-testid="button-end-connecting-call"
          >
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'connected') {
    return (
      <div 
        className="fixed bottom-4 right-4 z-[9999] bg-card rounded-lg shadow-2xl border p-4 min-w-[280px]"
        data-testid="overlay-active-call"
      >
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-12 w-12 ring-2 ring-green-500">
            <AvatarImage src={participant?.avatar} alt={participant?.name} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-medium" data-testid="text-connected-name">
              {participant?.name}
            </h3>
            <p className="text-sm text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {formatDuration(duration)}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={endCall}
            data-testid="button-minimize-call"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            size="icon"
            variant={isMuted ? 'destructive' : 'outline'}
            className="rounded-full h-12 w-12"
            onClick={toggleMute}
            data-testid="button-toggle-mute"
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="rounded-full h-12 w-12"
            onClick={endCall}
            data-testid="button-end-call"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default GlobalCallOverlay;
