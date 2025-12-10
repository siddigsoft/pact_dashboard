
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  WifiOff,
  RotateCcw,
  Clapperboard
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useCallSounds } from '@/hooks/useCallSounds';
import { useRealtimeTeamLocations } from '@/hooks/use-realtime-team-locations';
import { JitsiCallModal } from '@/components/calls/JitsiCallModal';

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
  const { callState, initiateCall, endCall, acceptCall, rejectCall, toggleVideo, isVideoEnabled, toggleMute, isMuted } = useCommunication();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showMissedCallDialog, setShowMissedCallDialog] = useState(false);
  const [missedCallUser, setMissedCallUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [activeFollowupTab, setActiveFollowupTab] = useState<'message' | 'notification'>('message');
  const [activeTab, setActiveTab] = useState<'contacts' | 'history'>('contacts');
  const [showJitsiCall, setShowJitsiCall] = useState(false);
  const [jitsiIsAudioOnly, setJitsiIsAudioOnly] = useState(false);
  const [jitsiCallUser, setJitsiCallUser] = useState<{ id: string; name: string } | null>(null);
  
  const { stopSounds } = useCallSounds(callState.status);
  
  const { 
    teamLocations, 
    onlineUserIds, 
    isConnected: isRealtimeConnected,
    connectionStatus 
  } = useRealtimeTeamLocations({ enabled: true });
  
  // Generate sample call history from actual users (excluding current user)
  const otherUsers = users.filter(u => u.id !== currentUser?.id);
  const callHistory = otherUsers.length > 0 ? [
    { id: 'c1', recipientId: otherUsers[0]?.id, direction: 'outgoing' as const, duration: 124, timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), status: 'completed' },
    { id: 'c2', recipientId: otherUsers[1]?.id || otherUsers[0]?.id, direction: 'incoming' as const, duration: 0, timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), status: 'missed' },
    { id: 'c3', recipientId: otherUsers[2]?.id || otherUsers[0]?.id, direction: 'outgoing' as const, duration: 245, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'completed' },
    { id: 'c4', recipientId: otherUsers[3]?.id || otherUsers[0]?.id, direction: 'incoming' as const, duration: 31, timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed' },
  ].filter(call => call.recipientId) : [];
  
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
  ).sort((a, b) => {
    const aOnline = onlineUserIds.includes(a.id);
    const bOnline = onlineUserIds.includes(b.id);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

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

  const handleVideoCall = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      initiateCall(user);
      // Video will be enabled via toggle after call connects
    }
  };

  const handleJitsiCall = (userId: string, audioOnly: boolean = false) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setJitsiCallUser({ id: user.id, name: user.name });
      setJitsiIsAudioOnly(audioOnly);
      setShowJitsiCall(true);
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
    <div className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-black ${
      status === 'online' ? 'bg-green-500' : 
      status === 'away' ? 'bg-amber-500' : 
      'bg-gray-400'
    }`} />
  );

  return (
    <div
      className="min-h-screen w-full max-w-full flex flex-col bg-white dark:bg-black overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      data-testid="calls-page"
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Compact Header with safe area for notch */}
        <div 
          className="shrink-0 bg-black px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(-1)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                data-testid="button-go-back"
              >
                <ArrowLeft className="h-4 w-4 text-white" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Calls</h1>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/60">Voice & Video</span>
                  {isRealtimeConnected ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-semibold">Live</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold flex items-center gap-0.5">
                      <WifiOff className="h-2.5 w-2.5" />
                      Connecting
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => window.location.reload()}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                data-testid="button-refresh"
              >
                <RotateCcw className="h-4 w-4 text-white" />
              </button>
              <button 
                onClick={() => navigate('/chat')}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                data-testid="button-go-chat"
              >
                <MessageSquare className="h-4 w-4 text-white" />
              </button>
              <button 
                onClick={() => navigate('/notifications')}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors relative"
                data-testid="button-go-notifications"
              >
                <Bell className="h-4 w-4 text-white" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">3</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* Online Users - Compact */}
          {onlineUsers.length > 0 && !isCallActive && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-black dark:text-white uppercase tracking-wide">Online Now</h3>
                <span className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-semibold">{onlineUsers.length} active</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {onlineUsers.slice(0, 8).map((user) => {
                  const location = getUserLocation(user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleStartCall(user.id)}
                      className="flex flex-col items-center gap-1 min-w-[56px] group"
                      data-testid={`online-user-${user.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10 ring-2 ring-green-500 transition-transform group-hover:scale-105">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-xs font-bold">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0">
                          <UberStatusDot status="online" />
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[56px] group-hover:text-black dark:group-hover:text-white transition-colors">
                        {user.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Active Call UI - Compact */}
          {isCallActive && callState.recipient && (
            <div className="rounded-xl overflow-hidden">
              <div className={`relative ${
                isConnected ? 'bg-black dark:bg-white' : isIncoming ? 'bg-green-600' : 'bg-black dark:bg-white'
              }`}>
                <div className="relative py-8 px-4">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                      <Avatar className="h-20 w-20 ring-4 ring-white/20">
                        <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                        <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
                          {getInitials(callState.recipient.name)}
                        </AvatarFallback>
                      </Avatar>
                      {(isOutgoing || isIncoming) && (
                        <div className="absolute -inset-3 rounded-full border-2 border-white/30 animate-ping" />
                      )}
                    </div>
                    
                    <div className="text-center text-white dark:text-black">
                      <h3 className="text-xl font-bold">{callState.recipient.name}</h3>
                      {isIncoming && <p className="text-white/80 dark:text-black/80 text-sm mt-1">Incoming call...</p>}
                      {isOutgoing && <p className="text-white/80 dark:text-black/80 text-sm mt-1">Calling...</p>}
                      {isConnected && (
                        <div className="mt-2">
                          <span className="px-3 py-1 rounded-full bg-white/20 text-white dark:bg-black/20 dark:text-black text-base font-bold">
                            {formatDuration(callDuration)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 pt-2">
                      {isIncoming && (
                        <>
                          <button 
                            className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                            onClick={rejectCall}
                            data-testid="button-reject-call"
                          >
                            <PhoneOff className="h-5 w-5 text-white" />
                          </button>
                          <button 
                            className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 animate-pulse"
                            onClick={acceptCall}
                            data-testid="button-accept-call"
                          >
                            <Phone className="h-5 w-5 text-white" />
                          </button>
                        </>
                      )}
                      
                      {isOutgoing && (
                        <button 
                          className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                          onClick={endCall}
                          data-testid="button-cancel-call"
                        >
                          <PhoneOff className="h-5 w-5 text-white" />
                        </button>
                      )}
                      
                      {isConnected && (
                        <>
                          <button 
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500' : 'bg-white/20'}`}
                            onClick={toggleMute}
                            data-testid="button-toggle-mute"
                          >
                            {isMuted ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-white dark:text-black" />}
                          </button>
                          <button 
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isVideoEnabled ? 'bg-white text-black' : 'bg-white/20'}`}
                            onClick={toggleVideo}
                            data-testid="button-toggle-video"
                          >
                            {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-white dark:text-black" />}
                          </button>
                          <button 
                            className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                            onClick={endCall}
                            data-testid="button-end-call"
                          >
                            <PhoneOff className="h-5 w-5 text-white" />
                          </button>
                          <button 
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isSpeakerOn ? 'bg-white text-black' : 'bg-white/20'}`}
                            onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                            data-testid="button-toggle-speaker"
                          >
                            {isSpeakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-white dark:text-black" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Search and Tabs - Compact */}
          {!isCallActive && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-sm font-medium focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>

              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-0.5">
                <button 
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'contacts' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveTab('contacts')}
                  data-testid="tab-contacts"
                >
                  <Users className="h-3.5 w-3.5" />
                  Contacts
                </button>
                <button 
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'history' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveTab('history')}
                  data-testid="tab-history"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Recent
                </button>
              </div>
              
              <ScrollArea className="flex-1">
                {activeTab === 'contacts' && (
                  <div className="space-y-0.5">
                    {filteredUsers.map((user) => {
                      const status = getUserOnlineStatus(user.id);
                      const isFavorite = favorites.includes(user.id);
                      const location = getUserLocation(user.id);
                      
                      return (
                        <div 
                          key={user.id} 
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                          data-testid={`contact-${user.id}`}
                        >
                          <div className="relative">
                            <Avatar className={`h-9 w-9 ${status === 'online' ? 'ring-2 ring-green-500' : ''}`}>
                              <AvatarImage src={user.avatar} alt={user.name} />
                              <AvatarFallback className="bg-gray-200 dark:bg-gray-800 text-black dark:text-white text-xs font-bold">
                                {getInitials(user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute bottom-0 right-0">
                              <UberStatusDot status={status} />
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-black dark:text-white truncate">{user.name}</span>
                              {isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">{user.role}</span>
                              {location && (
                                <span className="px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[9px] font-medium flex items-center gap-0.5">
                                  <MapPin className="h-2 w-2" />
                                  On site
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleFavorite(user.id)}
                              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              data-testid={`favorite-${user.id}`}
                              title="Toggle favorite"
                            >
                              <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
                            </button>
                            <button
                              onClick={() => navigate(`/chat?userId=${user.id}`)}
                              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              data-testid={`message-${user.id}`}
                              title="Send message"
                            >
                              <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleStartCall(user.id)}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              data-testid={`voice-call-${user.id}`}
                              title="Voice call"
                            >
                              <Phone className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                            </button>
                            <button
                              onClick={() => handleVideoCall(user.id)}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              data-testid={`video-call-${user.id}`}
                              title="Video call"
                            >
                              <Video className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                            </button>
                            <button
                              onClick={() => handleJitsiCall(user.id, false)}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 transition-colors"
                              data-testid={`jitsi-call-${user.id}`}
                              title="Jitsi video call (reliable)"
                            >
                              <Clapperboard className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-0.5">
                    {callHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-call-history">
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                          <Phone className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No recent calls</h3>
                        <p className="text-xs text-gray-500 max-w-[200px]">Your call history will appear here after you make or receive calls</p>
                      </div>
                    ) : (
                      callHistory.map((call) => {
                        const user = users.find(u => u.id === call.recipientId);
                        if (!user) return null;
                        
                        const isMissed = call.status === 'missed';
                        const status = getUserOnlineStatus(user.id);
                        
                        return (
                          <div 
                            key={call.id} 
                            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                            data-testid={`call-history-${call.id}`}
                          >
                            <div className="relative">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={user.avatar} alt={user.name} />
                                <AvatarFallback className="bg-gray-200 dark:bg-gray-800 text-black dark:text-white text-xs font-bold">
                                  {getInitials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute bottom-0 right-0">
                                <UberStatusDot status={status} />
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-semibold text-sm ${isMissed ? 'text-red-500' : 'text-black dark:text-white'}`}>
                                  {user.name}
                                </span>
                                {isMissed && (
                                  <span className="px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-medium">Missed</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                {call.direction === 'outgoing' ? (
                                  <PhoneOutgoing className="h-3 w-3" />
                                ) : (
                                  <PhoneIncoming className="h-3 w-3" />
                                )}
                                <span>{formatTime(call.timestamp)}</span>
                                {!isMissed && <span>{formatDuration(call.duration)}</span>}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              {isMissed && (
                                <>
                                  <button
                                    onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    data-testid={`missed-message-${call.id}`}
                                  >
                                    <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                  </button>
                                  <button
                                    onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    data-testid={`missed-notify-${call.id}`}
                                  >
                                    <Bell className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleStartCall(user.id)}
                                className="h-8 px-3 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-semibold flex items-center gap-1"
                                data-testid={`callback-${call.id}`}
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>

        {/* Dialog */}
        <Dialog open={showMissedCallDialog} onOpenChange={setShowMissedCallDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-bold flex items-center gap-2 text-base">
                {missedCallUser && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={missedCallUser.avatar} />
                    <AvatarFallback className="bg-gray-200 dark:bg-gray-800 text-xs font-bold">
                      {missedCallUser.name ? getInitials(missedCallUser.name) : '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                Follow up with {missedCallUser?.name}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Choose how you'd like to reach out
              </DialogDescription>
            </DialogHeader>

            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-0.5 mt-3">
              <button 
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                  activeFollowupTab === 'message' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                }`}
                onClick={() => setActiveFollowupTab('message')}
              >
                <MessageSquare className="h-3 w-3" />
                Message
              </button>
              <button 
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                  activeFollowupTab === 'notification' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                }`}
                onClick={() => setActiveFollowupTab('notification')}
              >
                <Bell className="h-3 w-3" />
                Notify
              </button>
            </div>

            {activeFollowupTab === 'message' && (
              <div className="space-y-2 mt-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Quick Messages</div>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      className={`px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                        selectedTemplate === template.text 
                          ? 'bg-black dark:bg-white text-white dark:text-black' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                
                <div className="border-t border-gray-100 dark:border-gray-800 my-2" />
                
                <textarea
                  placeholder="Or type a custom message..."
                  className="w-full min-h-[60px] p-2 rounded-xl bg-gray-100 dark:bg-gray-900 border-0 text-xs resize-none focus:outline-none"
                  value={customMessage}
                  onChange={(e) => {
                    setCustomMessage(e.target.value);
                    setSelectedTemplate('');
                  }}
                />
                
                <button
                  onClick={handleSendMessage}
                  disabled={!selectedTemplate && !customMessage}
                  className="w-full h-9 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Message
                </button>
              </div>
            )}

            {activeFollowupTab === 'notification' && (
              <div className="space-y-2 mt-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notification Templates</div>
                <div className="space-y-1.5">
                  {NOTIFICATION_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      className={`w-full text-left p-2 rounded-xl transition-all ${
                        selectedTemplate === template.title 
                          ? 'bg-black dark:bg-white text-white dark:text-black' 
                          : 'bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => {
                        setSelectedTemplate(template.title);
                        setCustomMessage('');
                      }}
                    >
                      <div className="font-semibold text-xs">{template.title}</div>
                      <div className={`text-[10px] mt-0.5 ${selectedTemplate === template.title ? 'text-white/70 dark:text-black/70' : 'text-gray-500'}`}>
                        {template.message}
                      </div>
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={handleSendNotification}
                  disabled={!selectedTemplate}
                  className="w-full h-9 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Send Notification
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* FAB */}
        {!isCallActive && onlineUsers.length > 0 && (
          <button 
            className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-black dark:bg-white text-white dark:text-black shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            onClick={() => {
              const firstOnlineUser = onlineUsers[0];
              if (firstOnlineUser) {
                handleStartCall(firstOnlineUser.id);
              }
            }}
            data-testid="fab-new-call"
            title="Quick call to available contact"
          >
            <Phone className="h-5 w-5" />
          </button>
        )}

        {/* Jitsi Call Modal */}
        {currentUser && (
          <JitsiCallModal
            isOpen={showJitsiCall}
            onClose={() => {
              setShowJitsiCall(false);
              setJitsiCallUser(null);
            }}
            targetUser={jitsiCallUser ? { id: jitsiCallUser.id, name: jitsiCallUser.name } : undefined}
            currentUser={{
              id: currentUser.id,
              name: currentUser.fullName || currentUser.name || 'User',
              email: currentUser.email,
            }}
            isAudioOnly={jitsiIsAudioOnly}
          />
        )}
      </div>
    </div>
  );
};

export default Calls;
