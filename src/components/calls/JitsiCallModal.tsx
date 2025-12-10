import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Monitor,
  MessageSquare,
  Maximize,
  Minimize,
  Users,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { jitsiMeetService, type JitsiMeetApi } from '@/services/JitsiMeetService';
import { useToast } from '@/hooks/use-toast';

interface JitsiCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
  };
  currentUser: {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
  };
  isAudioOnly?: boolean;
  groupCall?: {
    roomName: string;
    subject?: string;
  };
}

export function JitsiCallModal({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  isAudioOnly = false,
  groupCall
}: JitsiCallModalProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<JitsiMeetApi | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(isAudioOnly);
  const [participantCount, setParticipantCount] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startMeeting = useCallback(async () => {
    if (!containerRef.current) return;

    setIsLoading(true);

    try {
      let roomName: string;
      let subject: string | undefined;

      if (groupCall) {
        roomName = groupCall.roomName;
        subject = groupCall.subject;
      } else if (targetUser) {
        roomName = jitsiMeetService.generateRoomName(currentUser.id, targetUser.id);
        subject = `Call with ${targetUser.name}`;
      } else {
        roomName = jitsiMeetService.generateGroupRoomName(currentUser.id);
        subject = 'PACT Meeting';
      }

      setRoomUrl(jitsiMeetService.getMeetingUrl(roomName));

      const jitsiApi = await jitsiMeetService.startMeeting(
        'jitsi-container',
        {
          roomName,
          displayName: currentUser.name,
          email: currentUser.email,
          avatarURL: currentUser.avatar,
          subject,
          isAudioOnly
        },
        {
          onReadyToClose: () => {
            onClose();
          },
          onVideoConferenceJoined: () => {
            setIsConnected(true);
            setIsLoading(false);
            durationTimerRef.current = setInterval(() => {
              setCallDuration(prev => prev + 1);
            }, 1000);
          },
          onVideoConferenceLeft: () => {
            setIsConnected(false);
            onClose();
          },
          onParticipantJoined: () => {
            setParticipantCount(prev => prev + 1);
          },
          onParticipantLeft: () => {
            setParticipantCount(prev => Math.max(1, prev - 1));
          },
          onAudioMuteStatusChanged: (data: any) => {
            setIsMuted(data?.muted ?? false);
          },
          onVideoMuteStatusChanged: (data: any) => {
            setIsVideoOff(data?.muted ?? false);
          }
        }
      );

      setApi(jitsiApi);
    } catch (error) {
      console.error('[Jitsi] Failed to start meeting:', error);
      toast({
        title: 'Call Failed',
        description: 'Failed to start video call. Please try again.',
        variant: 'destructive'
      });
      setIsLoading(false);
    }
  }, [currentUser, targetUser, groupCall, isAudioOnly, onClose, toast]);

  useEffect(() => {
    if (isOpen) {
      startMeeting();
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      jitsiMeetService.dispose();
      setApi(null);
      setIsConnected(false);
      setCallDuration(0);
      setParticipantCount(1);
    };
  }, [isOpen, startMeeting]);

  const handleEndCall = () => {
    jitsiMeetService.hangup();
    onClose();
  };

  const handleToggleMute = () => {
    jitsiMeetService.toggleAudio();
  };

  const handleToggleVideo = () => {
    jitsiMeetService.toggleVideo();
  };

  const handleToggleScreenShare = () => {
    jitsiMeetService.toggleShareScreen();
  };

  const handleToggleChat = () => {
    jitsiMeetService.toggleChat();
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setIsCopied(true);
      toast({
        title: 'Link Copied',
        description: 'Meeting link copied to clipboard'
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy link',
        variant: 'destructive'
      });
    }
  };

  const handleOpenExternal = () => {
    window.open(roomUrl, '_blank');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 bg-gray-900 border-gray-800" data-testid="jitsi-call-modal">
        <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-white font-semibold">
                {groupCall?.subject || (targetUser ? `Call with ${targetUser.name}` : 'PACT Meeting')}
              </DialogTitle>
              {isConnected && (
                <Badge variant="outline" className="border-green-500 text-green-400">
                  {formatDuration(callDuration)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {participantCount > 1 && (
                <Badge variant="secondary" className="bg-white/10 text-white">
                  <Users className="h-3 w-3 mr-1" />
                  {participantCount}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyLink}
                className="text-white hover:bg-white/10"
                title="Copy meeting link"
                data-testid="button-copy-link"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenExternal}
                className="text-white hover:bg-white/10"
                title="Open in new tab"
                data-testid="button-open-external"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFullscreen}
                className="text-white hover:bg-white/10"
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div 
          id="jitsi-container" 
          ref={containerRef}
          className="w-full h-full bg-gray-900 rounded-lg overflow-hidden"
          data-testid="jitsi-container"
        >
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-white">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-lg font-medium">Connecting...</p>
              <p className="text-sm text-gray-400 mt-1">Setting up video call</p>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center justify-center gap-3">
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              onClick={handleToggleMute}
              className="h-12 w-12 rounded-full"
              data-testid="button-toggle-mute"
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="icon"
              onClick={handleToggleVideo}
              className="h-12 w-12 rounded-full"
              data-testid="button-toggle-video"
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={handleToggleScreenShare}
              className="h-12 w-12 rounded-full"
              data-testid="button-screen-share"
            >
              <Monitor className="h-5 w-5" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={handleToggleChat}
              className="h-12 w-12 rounded-full"
              data-testid="button-toggle-chat"
            >
              <MessageSquare className="h-5 w-5" />
            </Button>

            <Button
              variant="destructive"
              size="icon"
              onClick={handleEndCall}
              className="h-14 w-14 rounded-full"
              data-testid="button-end-call"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default JitsiCallModal;
