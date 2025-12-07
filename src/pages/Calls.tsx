
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  Star,
  UserPlus,
  MoreVertical,
  Info
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useCommunication } from '@/context/communications/CommunicationContext';

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
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 dark:from-primary/10 dark:via-primary/15 dark:to-primary/10">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <Avatar className="h-28 w-28 ring-4 ring-primary/20">
                  <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-3xl">
                    {getInitials(callState.recipient.name)}
                  </AvatarFallback>
                </Avatar>
                {(isOutgoing || isIncoming) && (
                  <>
                    <div className="absolute inset-0 rounded-full border-4 border-primary animate-ping opacity-20" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary animate-pulse opacity-40" />
                  </>
                )}
                {isConnected && (
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center ring-4 ring-background">
                    <Phone className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <h3 className="text-2xl font-semibold">{callState.recipient.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isIncoming && (
                    <span className="flex items-center justify-center gap-2">
                      <PhoneIncoming className="h-4 w-4 text-blue-500 animate-bounce" />
                      Incoming call...
                    </span>
                  )}
                  {isOutgoing && (
                    <span className="flex items-center justify-center gap-2">
                      <span className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      Calling
                    </span>
                  )}
                  {isConnected && (
                    <span className="text-green-600 dark:text-green-400 font-medium text-lg">
                      {formatDuration(callDuration)}
                    </span>
                  )}
                </p>
              </div>
              
              <div className="flex items-center justify-center gap-3">
                {isIncoming && (
                  <>
                    <Button 
                      variant="destructive" 
                      size="icon"
                      className="h-14 w-14 rounded-full shadow-lg"
                      onClick={rejectCall}
                      data-testid="button-reject-call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    <Button 
                      size="icon"
                      className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 shadow-lg"
                      onClick={acceptCall}
                      data-testid="button-accept-call"
                    >
                      <Phone className="h-6 w-6" />
                    </Button>
                  </>
                )}
                
                {isOutgoing && (
                  <Button 
                    variant="destructive" 
                    size="icon"
                    className="h-14 w-14 rounded-full shadow-lg"
                    onClick={endCall}
                    data-testid="button-cancel-call"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                )}
                
                {isConnected && (
                  <>
                    <Button 
                      variant={isMuted ? "destructive" : "secondary"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsMuted(!isMuted)}
                      data-testid="button-toggle-mute"
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    
                    <Button 
                      variant={isVideoEnabled ? "default" : "secondary"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                      data-testid="button-toggle-video"
                    >
                      {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                    
                    <Button 
                      variant="destructive" 
                      size="icon"
                      className="h-14 w-14 rounded-full shadow-lg"
                      onClick={endCall}
                      data-testid="button-end-call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    
                    <Button 
                      variant={isSpeakerOn ? "default" : "secondary"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      data-testid="button-toggle-speaker"
                    >
                      <Volume2 className="h-5 w-5" />
                    </Button>
                    
                    <Button 
                      variant="secondary"
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      data-testid="button-more-options"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
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
    </div>
  );
};

export default Calls;
