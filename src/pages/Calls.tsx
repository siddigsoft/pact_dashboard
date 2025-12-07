
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
  UserPlus
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

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-4xl">
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
          <h1 className="text-xl font-bold" data-testid="text-page-title">Calls</h1>
          <p className="text-xs text-muted-foreground">Voice and video calls</p>
        </div>
      </div>
      
      {isCallActive && callState.recipient && (
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                  <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {getInitials(callState.recipient.name)}
                  </AvatarFallback>
                </Avatar>
                {(isOutgoing || isIncoming) && (
                  <div className="absolute inset-0 rounded-full border-4 border-primary animate-ping opacity-30" />
                )}
                {isConnected && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Phone className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-semibold">{callState.recipient.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isIncoming && 'Incoming call...'}
                  {isOutgoing && 'Calling...'}
                  {isConnected && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {formatDuration(callDuration)}
                    </span>
                  )}
                </p>
              </div>
              
              <div className="flex items-center justify-center gap-4">
                {isIncoming && (
                  <>
                    <Button 
                      variant="destructive" 
                      size="icon"
                      className="h-14 w-14 rounded-full"
                      onClick={rejectCall}
                      data-testid="button-reject-call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    <Button 
                      size="icon"
                      className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600"
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
                    className="h-14 w-14 rounded-full"
                    onClick={endCall}
                    data-testid="button-cancel-call"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                )}
                
                {isConnected && (
                  <>
                    <Button 
                      variant={isMuted ? "destructive" : "outline"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsMuted(!isMuted)}
                      data-testid="button-toggle-mute"
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    
                    <Button 
                      variant="destructive" 
                      size="icon"
                      className="h-14 w-14 rounded-full"
                      onClick={endCall}
                      data-testid="button-end-call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    
                    <Button 
                      variant={isVideoEnabled ? "default" : "outline"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                      data-testid="button-toggle-video"
                    >
                      {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                    
                    <Button 
                      variant={isSpeakerOn ? "default" : "outline"}
                      size="icon"
                      className="h-12 w-12 rounded-full"
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      data-testid="button-toggle-speaker"
                    >
                      <Volume2 className="h-5 w-5" />
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
              <h3 className="text-sm font-medium text-muted-foreground px-1">Quick Dial</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {favoriteUsers.slice(0, 5).map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleStartCall(user.id)}
                    className="flex flex-col items-center gap-1 min-w-[60px] group"
                    data-testid={`quickdial-${user.id}`}
                  >
                    <div className="relative">
                      <Avatar className="h-12 w-12 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback className="bg-primary/10 text-sm">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Phone className="h-2 w-2 text-white" />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-[60px]">
                      {user.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
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
                History
              </TabsTrigger>
            </TabsList>
            
            <div className="my-3 relative">
              <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            
            <TabsContent value="contacts" className="mt-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-1">
                  {filteredUsers.map((user) => (
                    <div 
                      key={user.id} 
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                      data-testid={`contact-${user.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-primary/10 text-sm">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate" data-testid={`text-name-${user.id}`}>
                            {user.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{user.role}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${favorites.includes(user.id) ? 'text-amber-500' : 'opacity-0 group-hover:opacity-100'}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(user.id); }}
                          data-testid={`button-favorite-${user.id}`}
                        >
                          <Star className={`h-4 w-4 ${favorites.includes(user.id) ? 'fill-current' : ''}`} />
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
                  ))}
                  
                  {filteredUsers.length === 0 && (
                    <div className="py-12 text-center">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No contacts found</p>
                      <p className="text-xs text-muted-foreground mt-1">Try a different search</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="history" className="mt-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-1">
                  {callHistory.map((call) => {
                    const recipient = users.find(u => u.id === call.recipientId);
                    if (!recipient) return null;
                    
                    const isMissed = call.status === 'missed';
                    const isIncoming = call.direction === 'incoming';
                    
                    return (
                      <div 
                        key={call.id} 
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`history-${call.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={recipient.avatar} alt={recipient.name} />
                              <AvatarFallback className="bg-primary/10 text-sm">
                                {getInitials(recipient.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                              isMissed ? 'bg-red-500' : isIncoming ? 'bg-blue-500' : 'bg-green-500'
                            }`}>
                              {isMissed ? (
                                <PhoneMissed className="h-2 w-2 text-white" />
                              ) : isIncoming ? (
                                <PhoneIncoming className="h-2 w-2 text-white" />
                              ) : (
                                <PhoneOutgoing className="h-2 w-2 text-white" />
                              )}
                            </div>
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium text-sm truncate ${isMissed ? 'text-red-600 dark:text-red-400' : ''}`}>
                              {recipient.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatTime(call.timestamp)}</span>
                              {!isMissed && (
                                <>
                                  <span>-</span>
                                  <span>{formatDuration(call.duration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
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
                    );
                  })}
                  
                  {callHistory.length === 0 && (
                    <div className="py-12 text-center">
                      <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No call history</p>
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
