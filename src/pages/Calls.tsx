
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  Clapperboard,
  BarChart3
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useCallSounds } from '@/hooks/useCallSounds';
import { useRealtimeTeamLocations } from '@/hooks/use-realtime-team-locations';
import { CallMethodDialog, CallType } from '@/components/calls/CallMethodDialog';
import { CallLogService, CallLog } from '@/services/call-log.service';

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
  const [showCallMethodDialog, setShowCallMethodDialog] = useState(false);
  const [pendingCallUser, setPendingCallUser] = useState<{ id: string; name: string } | null>(null);
  const [pendingVideoCall, setPendingVideoCall] = useState(false);
  
  const { stopSounds } = useCallSounds(callState.status);
  
  const { 
    teamLocations, 
    onlineUserIds, 
    isConnected: isRealtimeConnected,
    connectionStatus 
  } = useRealtimeTeamLocations({ enabled: true });
  
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchCallHistory = async () => {
      setLoadingHistory(true);
      const logs = await CallLogService.getCallHistory(currentUser.id);
      setCallLogs(logs);
      setLoadingHistory(false);
    };
    fetchCallHistory();
  }, [currentUser?.id, activeTab]);

  const callHistory = callLogs.map(log => {
    const isOutgoing = log.caller_id === currentUser?.id;
    const recipientId = isOutgoing ? log.callee_id : log.caller_id;
    return {
      id: log.id,
      recipientId,
      direction: isOutgoing ? 'outgoing' as const : 'incoming' as const,
      duration: log.duration,
      timestamp: log.started_at,
      status: log.status,
    };
  });
  
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
  
  // Opens the call method selection dialog
  const handleInitiateCall = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setPendingCallUser({ id: user.id, name: user.name });
      setShowCallMethodDialog(true);
    }
  };

  // Direct WebRTC call (legacy, still available)
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

  const handleCallMethodSelect = (callType: CallType) => {
    if (!pendingCallUser) return;

    const user = users.find(u => u.id === pendingCallUser.id);
    if (user) {
      setPendingVideoCall(callType === 'video');
      initiateCall(user);
    }

    setPendingCallUser(null);
  };

  // Auto-enable video when a video call connects
  useEffect(() => {
    if (pendingVideoCall && callState.status === 'connected' && !isVideoEnabled) {
      // Enable video after connection is established
      toggleVideo().then(() => {
        setPendingVideoCall(false);
      }).catch(() => {
        setPendingVideoCall(false);
      });
    }
  }, [pendingVideoCall, callState.status, isVideoEnabled, toggleVideo]);

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
    <div className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 ${
      status === 'online' ? 'bg-green-500' :
      status === 'away' ? 'bg-amber-500' :
      'bg-gray-400'
    }`} />
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-hidden" data-testid="calls-page">

      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">Calls</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-gray-500">Voice &amp; Video</span>
              {isRealtimeConnected ? (
                <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  Live
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  Connecting
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/call-analytics')}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              data-testid="button-call-analytics"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </button>
            <button
              onClick={() => navigate('/chat')}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              data-testid="button-go-chat"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messages
            </button>
            <button
              onClick={() => window.location.reload()}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              data-testid="button-refresh"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Online now strip */}
        {onlineUsers.length > 0 && !isCallActive && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">{onlineUsers.length} online</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {onlineUsers.slice(0, 10).map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleInitiateCall(user.id)}
                  className="flex flex-col items-center gap-1 min-w-[52px] group"
                  data-testid={`online-user-${user.id}`}
                  title={user.name}
                >
                  <div className="relative">
                    <Avatar className="h-9 w-9 ring-2 ring-green-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 transition-transform group-hover:scale-110">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[52px] group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                    {user.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active Call Banner */}
      {isCallActive && callState.recipient && (
        <div className={`mx-4 mt-4 rounded-2xl overflow-hidden shadow-lg ${
          isIncoming ? 'bg-green-600' : 'bg-blue-600'
        }`}>
          <div className="py-8 px-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20 ring-4 ring-white/30">
                  <AvatarImage src={callState.recipient.avatar} alt={callState.recipient.name} />
                  <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
                    {getInitials(callState.recipient.name)}
                  </AvatarFallback>
                </Avatar>
                {(isOutgoing || isIncoming) && (
                  <div className="absolute -inset-3 rounded-full border-2 border-white/30 animate-ping" />
                )}
              </div>
              <div className="text-center text-white">
                <h3 className="text-xl font-bold">{callState.recipient.name}</h3>
                {isIncoming && <p className="text-white/80 text-sm mt-1">Incoming call...</p>}
                {isOutgoing && <p className="text-white/80 text-sm mt-1">Calling...</p>}
                {isConnected && (
                  <span className="inline-block mt-2 px-3 py-1 rounded-full bg-white/20 text-white text-base font-bold">
                    {formatDuration(callDuration)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isIncoming && (
                  <>
                    <button className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-105" onClick={rejectCall} data-testid="button-reject-call">
                      <PhoneOff className="h-5 w-5 text-white" />
                    </button>
                    <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg transition-all hover:scale-105 animate-pulse" onClick={acceptCall} data-testid="button-accept-call">
                      <Phone className="h-5 w-5 text-green-600" />
                    </button>
                  </>
                )}
                {isOutgoing && (
                  <button className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-105" onClick={endCall} data-testid="button-cancel-call">
                    <PhoneOff className="h-5 w-5 text-white" />
                  </button>
                )}
                {isConnected && (
                  <>
                    <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} onClick={toggleMute} data-testid="button-toggle-mute">
                      {isMuted ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-white" />}
                    </button>
                    <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isVideoEnabled ? 'bg-white' : 'bg-white/20 hover:bg-white/30'}`} onClick={toggleVideo} data-testid="button-toggle-video">
                      {isVideoEnabled ? <Video className="h-4 w-4 text-blue-600" /> : <VideoOff className="h-4 w-4 text-white" />}
                    </button>
                    <button className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-105" onClick={endCall} data-testid="button-end-call">
                      <PhoneOff className="h-5 w-5 text-white" />
                    </button>
                    <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isSpeakerOn ? 'bg-white' : 'bg-white/20 hover:bg-white/30'}`} onClick={() => setIsSpeakerOn(!isSpeakerOn)} data-testid="button-toggle-speaker">
                      {isSpeakerOn ? <Volume2 className="h-4 w-4 text-blue-600" /> : <VolumeX className="h-4 w-4 text-white" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search + Tabs toolbar */}
      {!isCallActive && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'contacts' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setActiveTab('contacts')}
              data-testid="tab-contacts"
            >
              <Users className="h-3.5 w-3.5" />
              Contacts
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setActiveTab('history')}
              data-testid="tab-history"
            >
              <Clock className="h-3.5 w-3.5" />
              Recent
            </button>
          </div>
        </div>
      )}

      {/* List content */}
      {!isCallActive && (
        <div className="flex-1 overflow-auto px-4 py-3">
          {activeTab === 'contacts' && (
            <div className="max-w-3xl space-y-1">
              {filteredUsers.map((user) => {
                const status = getUserOnlineStatus(user.id);
                const isFavorite = favorites.includes(user.id);
                const location = getUserLocation(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all group"
                    data-testid={`contact-${user.id}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className={`h-10 w-10 ${status === 'online' ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}>
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-bold">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <StatusDot status={status} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{user.name}</span>
                        {isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{user.role}</span>
                        {location && (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            On site
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleFavorite(user.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        data-testid={`favorite-${user.id}`}
                      >
                        <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
                      </button>
                      <button
                        onClick={() => navigate(`/chat?userId=${user.id}`)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        data-testid={`message-${user.id}`}
                      >
                        <MessageSquare className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleInitiateCall(user.id)}
                      className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                      data-testid={`call-${user.id}`}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Call
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-3xl space-y-1">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-500">Loading call history...</p>
                </div>
              ) : callHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-call-history">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <Phone className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="font-semibold text-gray-700 dark:text-gray-300">No recent calls</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-xs">Your call history will appear here after you make or receive calls</p>
                </div>
              ) : (
                callHistory.map((call) => {
                  const user = users.find(u => u.id === call.recipientId);
                  if (!user) return null;
                  const isMissed = call.status === 'missed' || call.status === 'no_answer';
                  const status = getUserOnlineStatus(user.id);
                  return (
                    <div
                      key={call.id}
                      className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                      data-testid={`call-history-${call.id}`}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <StatusDot status={status} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm truncate ${isMissed ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{user.name}</span>
                          {isMissed && <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-semibold shrink-0">Missed</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                          {call.direction === 'outgoing' ? <PhoneOutgoing className="h-3 w-3" /> : <PhoneIncoming className="h-3 w-3" />}
                          <span>{formatTime(call.timestamp)}</span>
                          {!isMissed && <span>· {formatDuration(call.duration)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isMissed && (
                          <>
                            <button onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" data-testid={`missed-message-${call.id}`}>
                              <MessageSquare className="h-4 w-4 text-gray-500" />
                            </button>
                            <button onClick={() => handleMissedCallAction(user.id, user.name, user.avatar)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" data-testid={`missed-notify-${call.id}`}>
                              <Bell className="h-4 w-4 text-gray-500" />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleStartCall(user.id)} className="h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors" data-testid={`callback-${call.id}`}>
                          <Phone className="h-3.5 w-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Follow-up Dialog */}
      <Dialog open={showMissedCallDialog} onOpenChange={setShowMissedCallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold flex items-center gap-2 text-base">
              {missedCallUser && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={missedCallUser.avatar} />
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 text-xs font-bold">
                    {missedCallUser.name ? getInitials(missedCallUser.name) : '?'}
                  </AvatarFallback>
                </Avatar>
              )}
              Follow up with {missedCallUser?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">Choose how you'd like to reach out</DialogDescription>
          </DialogHeader>

          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mt-3">
            <button
              className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeFollowupTab === 'message' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              onClick={() => setActiveFollowupTab('message')}
            >
              <MessageSquare className="h-3 w-3" />Message
            </button>
            <button
              className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeFollowupTab === 'notification' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              onClick={() => setActiveFollowupTab('notification')}
            >
              <Bell className="h-3 w-3" />Notify
            </button>
          </div>

          {activeFollowupTab === 'message' && (
            <div className="space-y-2 mt-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Quick Messages</p>
              <div className="flex flex-wrap gap-1.5">
                {MESSAGE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${selectedTemplate === template.text ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    onClick={() => { setSelectedTemplate(template.text); setCustomMessage(''); }}
                  >{template.label}</button>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 my-2" />
              <textarea
                placeholder="Or type a custom message..."
                className="w-full min-h-[60px] p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={customMessage}
                onChange={(e) => { setCustomMessage(e.target.value); setSelectedTemplate(''); }}
              />
              <button onClick={handleSendMessage} disabled={!selectedTemplate && !customMessage} className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                <Send className="h-3.5 w-3.5" />Send Message
              </button>
            </div>
          )}

          {activeFollowupTab === 'notification' && (
            <div className="space-y-2 mt-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notification Templates</p>
              <div className="space-y-1.5">
                {NOTIFICATION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all ${selectedTemplate === template.title ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'}`}
                    onClick={() => { setSelectedTemplate(template.title); setCustomMessage(''); }}
                  >
                    <div className={`font-semibold text-xs ${selectedTemplate === template.title ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{template.title}</div>
                    <div className="text-[10px] mt-0.5 text-gray-500">{template.message}</div>
                  </button>
                ))}
              </div>
              <button onClick={handleSendNotification} disabled={!selectedTemplate} className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                <Bell className="h-3.5 w-3.5" />Send Notification
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call Method Dialog */}
      <CallMethodDialog
        isOpen={showCallMethodDialog}
        onClose={() => { setShowCallMethodDialog(false); setPendingCallUser(null); }}
        onSelect={handleCallMethodSelect}
        recipientName={pendingCallUser?.name || ''}
      />

    </div>
  );
};

export default Calls;
