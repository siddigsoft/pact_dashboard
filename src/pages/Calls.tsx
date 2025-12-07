
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Search, 
  Phone, 
  PhoneCall, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed, 
  PhoneOff,
  Clock, 
  Users, 
  ArrowLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Star,
  UserPlus,
  MoreVertical,
  Info,
  MessageSquare,
  Bell,
  Send,
  X,
  Calendar,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useCallSounds } from '@/hooks/useCallSounds';

const MESSAGE_TEMPLATES = [
  { id: 1, label: "I'll call back", text: "Sorry I missed your call. I'll call you back shortly." },
  { id: 2, label: "In a meeting", text: "I'm currently in a meeting. Can I call you back in an hour?" },
  { id: 3, label: "Can you text?", text: "Can't talk right now. Please send me a message instead." },
  { id: 4, label: "Urgent?", text: "Is this urgent? I'll be available in 30 minutes." },
  { id: 5, label: "Call tomorrow", text: "Let's schedule a call for tomorrow. What time works for you?" },
];

const NOTIFICATION_TEMPLATES = [
  { id: 1, label: "Call reminder", title: "Missed Call Follow-up", message: "Please call back when available" },
  { id: 2, label: "Meeting request", title: "Meeting Request", message: "Would like to schedule a call to discuss" },
  { id: 3, label: "Urgent callback", title: "Urgent: Please Call Back", message: "Important matter requires your attention" },
  { id: 4, label: "Check-in", title: "Quick Check-in", message: "Just wanted to touch base with you" },
];

const Calls = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { users } = useUser();
  const { callState, initiateCall, endCall, acceptCall, rejectCall } = useCommunication();
  const [searchQuery, setSearchQuery] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showMissedCallDialog, setShowMissedCallDialog] = useState(false);
  const [missedCallUser, setMissedCallUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [activeFollowupTab, setActiveFollowupTab] = useState<'message' | 'notification'>('message');
  
  const { stopSounds } = useCallSounds(callState.status);
  
  const callHistory = [
    { id: 'c1', recipientId: 'usr2', direction: 'outgoing', duration: 124, timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), status: 'completed' },
    { id: 'c2', recipientId: 'usr3', direction: 'incoming', duration: 67, timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), status: 'missed' },
    { id: 'c3', recipientId: 'usr4', direction: 'outgoing', duration: 245, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'completed' },
    { id: 'c4', recipientId: 'usr5', direction: 'incoming', duration: 31, timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed' },
  ];
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getOnlineStatus = (userId: string) => {
    const rand = userId.charCodeAt(0) % 3;
    if (rand === 0) return 'online';
    if (rand === 1) return 'away';
    return 'offline';
  };
  
  const filteredUsers = users.filter(user => 
    user.id !== currentUser?.id &&
    (user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const favoriteUsers = filteredUsers.filter(user => favorites.includes(user.id));
  
  const isCallActive = callState.status !== 'idle';
  const isConnected = callState.status === 'connected';
  const isIncoming = callState.status === 'incoming';
  const isOutgoing = callState.status === 'outgoing';
  
  const handleStartCall = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      initiateCall(user);
    }
  };

  const handleMissedCallAction = (userId: string, userName: string, avatar?: string) => {
    setMissedCallUser({ id: userId, name: userName, avatar });
    setShowMissedCallDialog(true);
    setSelectedTemplate('');
    setCustomMessage('');
  };

  const handleSendMessage = () => {
    const messageToSend = customMessage || selectedTemplate;
    if (messageToSend && missedCallUser) {
      navigate(`/chat?userId=${missedCallUser.id}&message=${encodeURIComponent(messageToSend)}`);
    }
    setShowMissedCallDialog(false);
  };

  const handleSendNotification = () => {
    const template = NOTIFICATION_TEMPLATES.find(t => t.title === selectedTemplate);
    if (template && missedCallUser) {
      console.log('Sending notification:', { userId: missedCallUser.id, ...template, customMessage });
      navigate('/notifications');
    }
    setShowMissedCallDialog(false);
  };

  const toggleFavorite = (userId: string) => {
    setFavorites(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isConnected) {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [isConnected]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const StatusDot = ({ status }: { status: string }) => (
    <div className={`w-3 h-3 rounded-full border-2 border-background ${
      status === 'online' ? 'bg-green-500' : 
      status === 'away' ? 'bg-amber-500' : 
      'bg-gray-400'
    }`} />
  );

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-4xl" data-testid="calls-page">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          data-testid="button-go-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Phone className="h-5 w-5 text-primary" />
            Calls
          </h1>
          <p className="text-xs text-muted-foreground">Voice and video calls</p>
        </div>
      </div>
      
      {isCallActive && callState.recipient && (
        <Card className="overflow-hidden border-0 shadow-2xl">
          <div className={`relative ${
            isConnected 
              ? 'bg-gradient-to-br from-green-600 via-green-700 to-emerald-800' 
              : isIncoming 
                ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800'
                : 'bg-gradient-to-br from-primary via-primary/90 to-primary/80'
          }`}>
            <div className="absolute inset-0 bg-black/20" />
            
            {(isOutgoing || isIncoming) && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full border border-white/15 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-white/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
              </div>
            )}
            
            <CardContent className="relative py-10 px-6">
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <div className={`absolute -inset-3 rounded-full ${
                    isConnected 
                      ? 'bg-green-400/30' 
                      : isIncoming 
                        ? 'bg-blue-400/30 animate-pulse' 
                        : 'bg-white/20 animate-pulse'
                  }`} />
                  <div className={`absolute -inset-6 rounded-full ${
                    isConnected 
                      ? 'bg-green-400/10' 
                      : isIncoming 
                        ? 'bg-blue-400/10' 
                        : 'bg-white/10'
                  }`} />
                  <Avatar className="h-32 w-32 ring-4 ring-white/30 relative z-10">
                    <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                    <AvatarFallback className="bg-white/20 text-white text-4xl font-medium">
                      {getInitials(callState.recipient.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {isConnected && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 z-20">
                      {[...Array(5)].map((_, i) => (
                        <div 
                          key={i}
                          className="w-1 bg-white rounded-full animate-pulse"
                          style={{ 
                            height: `${8 + Math.random() * 16}px`,
                            animationDelay: `${i * 100}ms`,
                            animationDuration: '0.5s'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="text-center text-white z-10">
                  <h3 className="text-2xl font-semibold drop-shadow-lg">{callState.recipient.name}</h3>
                  
                  {isIncoming && (
                    <div className="mt-2">
                      <div className="flex items-center justify-center gap-2 text-blue-100">
                        <PhoneIncoming className="h-4 w-4 animate-bounce" />
                        <span className="text-sm font-medium">Incoming Call</span>
                      </div>
                      <p className="text-xs text-white/70 mt-1">Tap to answer</p>
                    </div>
                  )}
                  
                  {isOutgoing && (
                    <div className="mt-2">
                      <div className="flex items-center justify-center gap-2 text-white/90">
                        <span className="text-sm">Ringing</span>
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                      <p className="text-xs text-white/60 mt-1">Waiting for answer</p>
                    </div>
                  )}
                  
                  {isConnected && (
                    <div className="mt-2">
                      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-xl font-mono font-semibold tracking-wider">
                          {formatDuration(callDuration)}
                        </span>
                      </div>
                      <p className="text-xs text-white/70 mt-2">Call in progress</p>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-center gap-4 pt-4 z-10">
                  {isIncoming && (
                    <>
                      <div className="flex flex-col items-center gap-2">
                        <Button 
                          variant="destructive" 
                          size="icon"
                          className="h-16 w-16 rounded-full shadow-xl bg-red-500 hover:bg-red-600 border-2 border-red-400/50"
                          onClick={rejectCall}
                          data-testid="button-reject-call"
                        >
                          <PhoneOff className="h-7 w-7" />
                        </Button>
                        <span className="text-xs text-white/80">Decline</span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <Button 
                          size="icon"
                          className="h-16 w-16 rounded-full shadow-xl bg-green-500 hover:bg-green-600 border-2 border-green-400/50 animate-pulse"
                          onClick={acceptCall}
                          data-testid="button-accept-call"
                        >
                          <Phone className="h-7 w-7" />
                        </Button>
                        <span className="text-xs text-white/80">Accept</span>
                      </div>
                    </>
                  )}
                  
                  {isOutgoing && (
                    <div className="flex flex-col items-center gap-2">
                      <Button 
                        variant="destructive" 
                        size="icon"
                        className="h-16 w-16 rounded-full shadow-xl bg-red-500 hover:bg-red-600 border-2 border-red-400/50"
                        onClick={endCall}
                        data-testid="button-cancel-call"
                      >
                        <PhoneOff className="h-7 w-7" />
                      </Button>
                      <span className="text-xs text-white/80">Cancel</span>
                    </div>
                  )}
                  
                  {isConnected && (
                    <>
                      <div className="flex flex-col items-center gap-1.5">
                        <Button 
                          size="icon"
                          className={`h-12 w-12 rounded-full shadow-lg transition-all ${
                            isMuted 
                              ? 'bg-red-500 hover:bg-red-600 text-white' 
                              : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm'
                          }`}
                          onClick={() => setIsMuted(!isMuted)}
                          data-testid="button-toggle-mute"
                        >
                          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        <span className="text-[10px] text-white/70">{isMuted ? 'Unmute' : 'Mute'}</span>
                      </div>
                      
                      <div className="flex flex-col items-center gap-1.5">
                        <Button 
                          size="icon"
                          className={`h-12 w-12 rounded-full shadow-lg transition-all ${
                            isVideoEnabled 
                              ? 'bg-white text-green-700' 
                              : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm'
                          }`}
                          onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                          data-testid="button-toggle-video"
                        >
                          {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                        </Button>
                        <span className="text-[10px] text-white/70">Video</span>
                      </div>
                      
                      <div className="flex flex-col items-center gap-1.5">
                        <Button 
                          size="icon"
                          className="h-16 w-16 rounded-full shadow-xl bg-red-500 hover:bg-red-600 border-2 border-red-400/50"
                          onClick={endCall}
                          data-testid="button-end-call"
                        >
                          <PhoneOff className="h-7 w-7 text-white" />
                        </Button>
                        <span className="text-[10px] text-white/70">End</span>
                      </div>
                      
                      <div className="flex flex-col items-center gap-1.5">
                        <Button 
                          size="icon"
                          className={`h-12 w-12 rounded-full shadow-lg transition-all ${
                            isSpeakerOn 
                              ? 'bg-white text-green-700' 
                              : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm'
                          }`}
                          onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                          data-testid="button-toggle-speaker"
                        >
                          {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                        </Button>
                        <span className="text-[10px] text-white/70">Speaker</span>
                      </div>
                      
                      <div className="flex flex-col items-center gap-1.5">
                        <Button 
                          size="icon"
                          className="h-12 w-12 rounded-full shadow-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
                          data-testid="button-more-options"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                        <span className="text-[10px] text-white/70">More</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      )}
      
      {!isCallActive && (
        <>
          {favoriteUsers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Quick Dial</h3>
              <div className="flex gap-4 overflow-x-auto pb-2 px-1">
                {favoriteUsers.slice(0, 6).map((user) => {
                  const status = getOnlineStatus(user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleStartCall(user.id)}
                      className="flex flex-col items-center gap-1.5 min-w-[64px] group"
                      data-testid={`quickdial-${user.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-14 w-14 ring-2 ring-transparent group-hover:ring-primary/50 transition-all">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0">
                          <StatusDot status={status} />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-primary/0 group-hover:bg-primary/20 transition-colors">
                          <Phone className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground truncate max-w-[64px] group-hover:text-foreground transition-colors">
                        {user.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Tabs defaultValue="contacts" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="contacts" className="text-xs gap-1.5" data-testid="tab-contacts">
                <Users className="h-3.5 w-3.5" />
                Contacts
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5" data-testid="tab-history">
                <Clock className="h-3.5 w-3.5" />
                Recent
              </TabsTrigger>
            </TabsList>
            
            <div className="my-3 relative">
              <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9 h-8 text-sm bg-muted/50 dark:bg-gray-800 border-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            
            <TabsContent value="contacts" className="mt-0">
              <ScrollArea className="h-[calc(100vh-340px)]">
                <div className="space-y-0.5">
                  {filteredUsers.map((user) => {
                    const status = getOnlineStatus(user.id);
                    const isFavorite = favorites.includes(user.id);
                    
                    return (
                      <div 
                        key={user.id} 
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-muted/50 dark:hover:bg-gray-800 transition-colors group"
                        data-testid={`contact-${user.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative">
                            <Avatar className="h-11 w-11">
                              <AvatarImage src={user.avatar} alt={user.name} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm">
                                {getInitials(user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute bottom-0 right-0">
                              <StatusDot status={status} />
                            </div>
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate" data-testid={`text-name-${user.id}`}>
                                {user.name}
                              </span>
                              {status === 'online' && (
                                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 bg-green-500/10 text-green-600 dark:text-green-400">
                                  Online
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{user.role}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${isFavorite ? 'text-amber-500' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(user.id); }}
                            data-testid={`button-favorite-${user.id}`}
                          >
                            <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleStartCall(user.id)}
                            data-testid={`button-video-call-${user.id}`}
                          >
                            <Video className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleStartCall(user.id)}
                            size="sm"
                            className="gap-1.5 h-8"
                            data-testid={`button-call-${user.id}`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Call
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredUsers.length === 0 && (
                    <div className="py-12 text-center">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No contacts found</p>
                      <p className="text-xs text-muted-foreground mt-1">Try a different search</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="history" className="mt-0">
              <ScrollArea className="h-[calc(100vh-340px)]">
                <div className="space-y-0.5">
                  {callHistory.map((call) => {
                    const recipient = users.find(u => u.id === call.recipientId);
                    if (!recipient) return null;
                    
                    const isMissed = call.status === 'missed';
                    const isIncomingCall = call.direction === 'incoming';
                    
                    return (
                      <div 
                        key={call.id} 
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-muted/50 dark:hover:bg-gray-800 transition-colors group"
                        data-testid={`history-${call.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative">
                            <Avatar className="h-11 w-11">
                              <AvatarImage src={recipient.avatar} alt={recipient.name} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm">
                                {getInitials(recipient.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                              isMissed ? 'bg-red-500' : isIncomingCall ? 'bg-blue-500' : 'bg-green-500'
                            }`}>
                              {isMissed ? (
                                <PhoneMissed className="h-2.5 w-2.5 text-white" />
                              ) : isIncomingCall ? (
                                <PhoneIncoming className="h-2.5 w-2.5 text-white" />
                              ) : (
                                <PhoneOutgoing className="h-2.5 w-2.5 text-white" />
                              )}
                            </div>
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium text-sm truncate ${isMissed ? 'text-red-600 dark:text-red-400' : ''}`}>
                              {recipient.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{formatTime(call.timestamp)}</span>
                              {!isMissed && (
                                <>
                                  <span className="text-muted-foreground/50">-</span>
                                  <span>{formatDuration(call.duration)}</span>
                                </>
                              )}
                              {isMissed && (
                                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 bg-red-500/10 text-red-600 dark:text-red-400">
                                  Missed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {isMissed && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600"
                                onClick={() => handleMissedCallAction(call.recipientId, recipient.name, recipient.avatar)}
                                data-testid={`button-message-${call.id}`}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-amber-600"
                                onClick={() => handleMissedCallAction(call.recipientId, recipient.name, recipient.avatar)}
                                data-testid={`button-notify-${call.id}`}
                              >
                                <Bell className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-info-${call.id}`}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleStartCall(call.recipientId)}
                            data-testid={`button-callback-${call.id}`}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {callHistory.length === 0 && (
                    <div className="py-12 text-center">
                      <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No call history</p>
                      <p className="text-xs text-muted-foreground mt-1">Your calls will appear here</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showMissedCallDialog} onOpenChange={setShowMissedCallDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {missedCallUser && (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={missedCallUser.avatar} alt={missedCallUser.name} />
                    <AvatarFallback className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                      {getInitials(missedCallUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold">{missedCallUser.name}</div>
                    <div className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                      <PhoneMissed className="h-3 w-3 text-red-500" />
                      Missed call
                    </div>
                  </div>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Send a quick follow-up message or notification
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeFollowupTab} onValueChange={(v) => setActiveFollowupTab(v as 'message' | 'notification')}>
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="message" className="text-xs gap-1.5" data-testid="tab-message-followup">
                <MessageSquare className="h-3.5 w-3.5" />
                Send Message
              </TabsTrigger>
              <TabsTrigger value="notification" className="text-xs gap-1.5" data-testid="tab-notification-followup">
                <Bell className="h-3.5 w-3.5" />
                Send Notification
              </TabsTrigger>
            </TabsList>

            <TabsContent value="message" className="mt-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Replies</div>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TEMPLATES.map((template) => (
                  <Button
                    key={template.id}
                    variant={selectedTemplate === template.text ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setSelectedTemplate(template.text);
                      setCustomMessage('');
                    }}
                    data-testid={`template-message-${template.id}`}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
              
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Or type your message</div>
                <textarea
                  placeholder="Type a custom message..."
                  className="w-full min-h-[80px] p-3 rounded-lg border bg-muted/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={customMessage}
                  onChange={(e) => {
                    setCustomMessage(e.target.value);
                    setSelectedTemplate('');
                  }}
                  data-testid="input-custom-message"
                />
              </div>

              {(selectedTemplate || customMessage) && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="py-3 px-4">
                    <div className="text-xs text-muted-foreground mb-1">Preview:</div>
                    <div className="text-sm">{customMessage || selectedTemplate}</div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowMissedCallDialog(false)} data-testid="button-cancel-message">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendMessage}
                  disabled={!selectedTemplate && !customMessage}
                  className="gap-2"
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                  Send Message
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="notification" className="mt-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notification Templates</div>
              <div className="space-y-2">
                {NOTIFICATION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedTemplate === template.title 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedTemplate(template.title)}
                    data-testid={`template-notification-${template.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        template.id === 3 
                          ? 'bg-red-500/10 text-red-600' 
                          : template.id === 2 
                            ? 'bg-blue-500/10 text-blue-600' 
                            : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {template.id === 3 ? <AlertCircle className="h-4 w-4" /> : 
                         template.id === 2 ? <Calendar className="h-4 w-4" /> : 
                         <Bell className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{template.title}</div>
                        <div className="text-xs text-muted-foreground">{template.message}</div>
                      </div>
                      {selectedTemplate === template.title && (
                        <CheckCircle className="h-4 w-4 text-primary ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Note (optional)</div>
                <textarea
                  placeholder="Add a note..."
                  className="w-full min-h-[60px] p-3 rounded-lg border bg-muted/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  data-testid="input-notification-note"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowMissedCallDialog(false)} data-testid="button-cancel-notification">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendNotification}
                  disabled={!selectedTemplate}
                  className="gap-2"
                  data-testid="button-send-notification"
                >
                  <Bell className="h-4 w-4" />
                  Send Notification
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calls;
