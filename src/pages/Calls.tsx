
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { UberCommunicationNav, UberNavSpacer } from '@/components/mobile/UberCommunicationNav';
import { 
  Search, 
  Phone, 
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
  MoreVertical,
  MessageSquare,
  Bell,
  Send,
  X,
  MapPin,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useCallSounds } from '@/hooks/useCallSounds';
import { useRealtimeTeamLocations } from '@/hooks/use-realtime-team-locations';

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
  const [activeTab, setActiveTab] = useState<'contacts' | 'history'>('contacts');
  
  const { stopSounds } = useCallSounds(callState.status);
  
  const { 
    teamLocations, 
    onlineUserIds, 
    isConnected: isRealtimeConnected,
    connectionStatus 
  } = useRealtimeTeamLocations({ enabled: true });
  
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

  const getUserOnlineStatus = (userId: string) => {
    return onlineUserIds.includes(userId) ? 'online' : 'offline';
  };

  const getUserLocation = (userId: string) => {
    return teamLocations.find(loc => loc.id === userId);
  };
  
  const filteredUsers = users.filter(user => 
    user.id !== currentUser?.id &&
    (user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const favoriteUsers = filteredUsers.filter(user => favorites.includes(user.id));
  const onlineUsers = filteredUsers.filter(user => onlineUserIds.includes(user.id));
  
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

  const UberStatusDot = ({ status }: { status: string }) => (
    <div className={`${
      status === 'online' ? 'uber-status-online uber-animate-pulse' : 
      status === 'away' ? 'uber-status-away' : 
      'uber-status-offline'
    }`} />
  );

  return (
    <div className="uber-page uber-font" data-testid="calls-page">
      <div className="uber-page-content">
      <div className="uber-page-header uber-slide-in-down">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="uber-icon-btn"
            data-testid="button-go-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl uber-heading" data-testid="text-page-title">
              Calls
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground uber-text">Voice & Video</span>
              {isRealtimeConnected ? (
                <span className="uber-live-indicator">Live</span>
              ) : (
                <span className="uber-pill uber-pill-warning text-[10px]">
                  <WifiOff className="h-3 w-3" />
                  Connecting
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('/chat')}
            className="uber-icon-btn"
            data-testid="button-go-chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <button 
            onClick={() => navigate('/notifications')}
            className="uber-icon-btn relative"
            data-testid="button-go-notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="uber-notification-dot">3</span>
          </button>
        </div>
      </div>

      {onlineUsers.length > 0 && !isCallActive && (
        <div className="space-y-3 uber-slide-in-up uber-stagger-1">
          <div className="uber-section-header">
            <h3 className="uber-section-title">Online Now</h3>
            <span className="uber-pill uber-pill-success">{onlineUsers.length} active</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {onlineUsers.slice(0, 8).map((user) => {
              const location = getUserLocation(user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => handleStartCall(user.id)}
                  className="flex flex-col items-center gap-2 min-w-[72px] group"
                  data-testid={`online-user-${user.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-14 w-14 uber-avatar-ring uber-avatar-online transition-transform group-hover:scale-105">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="bg-foreground text-background uber-heading">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute bottom-0 right-0">
                      <UberStatusDot status="online" />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground uber-text truncate max-w-[72px] group-hover:text-foreground transition-colors">
                    {user.name.split(' ')[0]}
                  </span>
                  {location && (
                    <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      On site
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {isCallActive && callState.recipient && (
        <div className="uber-card-elevated overflow-hidden">
          <div className={`relative ${
            isConnected 
              ? 'bg-foreground' 
              : isIncoming 
                ? 'bg-green-600'
                : 'bg-foreground'
          }`}>
            <div className="relative py-12 px-6">
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <Avatar className="h-28 w-28 ring-4 ring-white/20">
                    <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                    <AvatarFallback className="bg-white/20 text-white text-3xl uber-heading">
                      {getInitials(callState.recipient.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {(isOutgoing || isIncoming) && (
                    <div className="absolute -inset-4 rounded-full border-2 border-white/30 animate-ping" />
                  )}
                </div>
                
                <div className="text-center text-white">
                  <h3 className="text-2xl uber-heading">{callState.recipient.name}</h3>
                  
                  {isIncoming && (
                    <p className="text-white/80 uber-text mt-1">Incoming call...</p>
                  )}
                  
                  {isOutgoing && (
                    <p className="text-white/80 uber-text mt-1">Calling...</p>
                  )}
                  
                  {isConnected && (
                    <div className="mt-3">
                      <span className="uber-pill bg-white/20 text-white text-lg uber-heading">
                        {formatDuration(callDuration)}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4 pt-4">
                  {isIncoming && (
                    <>
                      <button 
                        className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                        onClick={rejectCall}
                        data-testid="button-reject-call"
                      >
                        <PhoneOff className="h-7 w-7 text-white" />
                      </button>
                      <button 
                        className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 animate-pulse"
                        onClick={acceptCall}
                        data-testid="button-accept-call"
                      >
                        <Phone className="h-7 w-7 text-white" />
                      </button>
                    </>
                  )}
                  
                  {isOutgoing && (
                    <button 
                      className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                      onClick={endCall}
                      data-testid="button-cancel-call"
                    >
                      <PhoneOff className="h-7 w-7 text-white" />
                    </button>
                  )}
                  
                  {isConnected && (
                    <>
                      <button 
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          isMuted ? 'bg-red-500' : 'bg-white/20'
                        }`}
                        onClick={() => setIsMuted(!isMuted)}
                        data-testid="button-toggle-mute"
                      >
                        {isMuted ? <MicOff className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
                      </button>
                      
                      <button 
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          isVideoEnabled ? 'bg-white text-foreground' : 'bg-white/20'
                        }`}
                        onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                        data-testid="button-toggle-video"
                      >
                        {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-white" />}
                      </button>
                      
                      <button 
                        className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                        onClick={endCall}
                        data-testid="button-end-call"
                      >
                        <PhoneOff className="h-7 w-7 text-white" />
                      </button>
                      
                      <button 
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          isSpeakerOn ? 'bg-white text-foreground' : 'bg-white/20'
                        }`}
                        onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                        data-testid="button-toggle-speaker"
                      >
                        {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-white" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {!isCallActive && (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="uber-search pl-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>

          <div className="uber-tabs">
            <button 
              className={`uber-tab flex-1 ${activeTab === 'contacts' ? 'uber-tab-active' : ''}`}
              onClick={() => setActiveTab('contacts')}
              data-testid="tab-contacts"
            >
              <Users className="h-4 w-4 inline mr-2" />
              Contacts
            </button>
            <button 
              className={`uber-tab flex-1 ${activeTab === 'history' ? 'uber-tab-active' : ''}`}
              onClick={() => setActiveTab('history')}
              data-testid="tab-history"
            >
              <Clock className="h-4 w-4 inline mr-2" />
              Recent
            </button>
          </div>
          
          <ScrollArea className="h-[calc(100vh-400px)]">
            {activeTab === 'contacts' && (
              <div className="space-y-1 uber-slide-in-up">
                {filteredUsers.map((user) => {
                  const status = getUserOnlineStatus(user.id);
                  const isFavorite = favorites.includes(user.id);
                  const location = getUserLocation(user.id);
                  
                  return (
                    <div 
                      key={user.id} 
                      className="uber-list-item"
                      data-testid={`contact-${user.id}`}
                    >
                      <div className="relative">
                        <Avatar className={`h-12 w-12 ${status === 'online' ? 'uber-avatar-ring uber-avatar-online' : ''}`}>
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-muted uber-heading text-sm">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0">
                          <UberStatusDot status={status} />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="uber-heading text-sm truncate">{user.name}</span>
                          {isFavorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground uber-text">{user.role}</span>
                          {location && (
                            <span className="uber-pill uber-pill-success text-[10px]">
                              <MapPin className="h-2.5 w-2.5" />
                              On site
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleFavorite(user.id)}
                          className="uber-icon-btn p-2"
                          data-testid={`favorite-${user.id}`}
                        >
                          <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                        </button>
                        <button
                          onClick={() => navigate(`/chat?userId=${user.id}`)}
                          className="uber-icon-btn p-2"
                          data-testid={`message-${user.id}`}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleStartCall(user.id)}
                          className="uber-btn uber-btn-primary py-2 px-4 text-sm"
                          data-testid={`call-${user.id}`}
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-1 uber-slide-in-up">
                {callHistory.map((call) => {
                  const user = users.find(u => u.id === call.recipientId);
                  if (!user) return null;
                  
                  const isMissed = call.status === 'missed';
                  const status = getUserOnlineStatus(user.id);
                  
                  return (
                    <div 
                      key={call.id} 
                      className="uber-list-item"
                      data-testid={`call-history-${call.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-muted uber-heading text-sm">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0">
                          <UberStatusDot status={status} />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`uber-heading text-sm ${isMissed ? 'text-red-500' : ''}`}>
                            {user.name}
                          </span>
                          {isMissed && (
                            <span className="uber-pill uber-pill-danger text-[10px]">Missed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground uber-text">
                          {call.direction === 'outgoing' ? (
                            <PhoneOutgoing className="h-3 w-3" />
                          ) : (
                            <PhoneIncoming className="h-3 w-3" />
                          )}
                          <span>{formatTime(call.timestamp)}</span>
                          {!isMissed && <span>{formatDuration(call.duration)}</span>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isMissed && (
                          <>
                            <button
                              onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)}
                              className="uber-icon-btn p-2"
                              data-testid={`missed-message-${call.id}`}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)}
                              className="uber-icon-btn p-2"
                              data-testid={`missed-notify-${call.id}`}
                            >
                              <Bell className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleStartCall(user.id)}
                          className="uber-btn uber-btn-primary py-2 px-4 text-sm"
                          data-testid={`callback-${call.id}`}
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </>
      )}

      <Dialog open={showMissedCallDialog} onOpenChange={setShowMissedCallDialog}>
        <DialogContent className="max-w-md uber-font">
          <DialogHeader>
            <DialogTitle className="uber-heading flex items-center gap-3">
              {missedCallUser && (
                <Avatar className="h-10 w-10">
                  <AvatarImage src={missedCallUser.avatar} />
                  <AvatarFallback className="bg-muted uber-heading text-sm">
                    {missedCallUser.name ? getInitials(missedCallUser.name) : '?'}
                  </AvatarFallback>
                </Avatar>
              )}
              Follow up with {missedCallUser?.name}
            </DialogTitle>
            <DialogDescription className="uber-text">
              Choose how you'd like to reach out
            </DialogDescription>
          </DialogHeader>

          <div className="uber-tabs mt-4">
            <button 
              className={`uber-tab flex-1 ${activeFollowupTab === 'message' ? 'uber-tab-active' : ''}`}
              onClick={() => setActiveFollowupTab('message')}
            >
              <MessageSquare className="h-4 w-4 inline mr-2" />
              Message
            </button>
            <button 
              className={`uber-tab flex-1 ${activeFollowupTab === 'notification' ? 'uber-tab-active' : ''}`}
              onClick={() => setActiveFollowupTab('notification')}
            >
              <Bell className="h-4 w-4 inline mr-2" />
              Notify
            </button>
          </div>

          {activeFollowupTab === 'message' && (
            <div className="space-y-3 mt-4">
              <div className="text-xs uber-heading text-muted-foreground uppercase tracking-wide">Quick Messages</div>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`uber-pill transition-all ${
                      selectedTemplate === template.text 
                        ? 'uber-pill-dark' 
                        : 'uber-pill-light hover:bg-foreground hover:text-background'
                    }`}
                    onClick={() => {
                      setSelectedTemplate(template.text);
                      setCustomMessage('');
                    }}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              
              <div className="uber-divider" />
              
              <textarea
                placeholder="Or type a custom message..."
                className="w-full min-h-[80px] p-3 rounded-xl bg-muted border-0 text-sm uber-text resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
                value={customMessage}
                onChange={(e) => {
                  setCustomMessage(e.target.value);
                  setSelectedTemplate('');
                }}
              />
              
              <button
                onClick={handleSendMessage}
                disabled={!selectedTemplate && !customMessage}
                className="w-full uber-btn uber-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                Send Message
              </button>
            </div>
          )}

          {activeFollowupTab === 'notification' && (
            <div className="space-y-3 mt-4">
              <div className="text-xs uber-heading text-muted-foreground uppercase tracking-wide">Notification Templates</div>
              <div className="space-y-2">
                {NOTIFICATION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      selectedTemplate === template.title 
                        ? 'bg-foreground text-background' 
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                    onClick={() => {
                      setSelectedTemplate(template.title);
                      setCustomMessage('');
                    }}
                  >
                    <div className="uber-heading text-sm">{template.title}</div>
                    <div className={`text-xs uber-text mt-0.5 ${selectedTemplate === template.title ? 'text-background/70' : 'text-muted-foreground'}`}>
                      {template.message}
                    </div>
                  </button>
                ))}
              </div>
              
              <button
                onClick={handleSendNotification}
                disabled={!selectedTemplate}
                className="w-full uber-btn uber-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Bell className="h-4 w-4" />
                Send Notification
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!isCallActive && onlineUsers.length > 0 && (
        <button 
          className="uber-fab uber-scale-in"
          onClick={() => {
            const firstOnlineUser = onlineUsers[0];
            if (firstOnlineUser) {
              handleStartCall(firstOnlineUser.id);
            }
          }}
          data-testid="fab-new-call"
          title="Quick call to available contact"
          style={{ bottom: '5rem' }}
        >
          <Phone className="h-6 w-6" />
        </button>
      )}

        <UberNavSpacer />
      </div>
      <UberCommunicationNav callsMissed={2} notificationCount={3} />
    </div>
  );
};

export default Calls;
