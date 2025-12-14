import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Wallet,
  Bell,
  Calendar,
  Clock,
  ChevronRight,
  Plus,
  CheckCircle,
  AlertCircle,
  Activity,
  Users,
  TrendingUp,
  Target,
  Navigation,
  Zap,
  MessageSquare,
  Phone,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileHeader, SearchHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { PullToRefresh } from './PullToRefresh';
import { MobileStatsCard } from './MobileStatsCard';
import { SyncStatusBar } from './SyncStatusBar';
import { GeofenceStatusBadge } from './MobileGeofenceMonitor';
import { BatteryIndicator } from './MobileBatteryStatus';
import { FPSMonitor } from './MobilePerformancePanel';
import { useRealtimeTeamLocations } from '@/hooks/use-realtime-team-locations';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';

interface DashboardStats {
  totalVisits: number;
  completedToday: number;
  pendingApprovals: number;
  walletBalance: number;
}

interface UpcomingVisit {
  id: string;
  siteName: string;
  scheduledTime: Date;
  status: 'scheduled' | 'in_progress' | 'completed';
  distance?: number;
}

interface MobileDashboardScreenProps {
  userName?: string;
  userRole?: string;
  stats?: DashboardStats;
  upcomingVisits?: UpcomingVisit[];
  notificationCount?: number;
  onRefresh?: () => Promise<void>;
  className?: string;
}

export function MobileDashboardScreen({
  userName = 'User',
  userRole = 'Field Agent',
  stats,
  upcomingVisits = [],
  notificationCount = 0,
  onRefresh,
  className,
}: MobileDashboardScreenProps) {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [greeting, setGreeting] = useState('');
  const { users } = useUser();
  const { currentUser } = useAppContext();
  const { onlineUserIds } = useRealtimeTeamLocations({ enabled: true });
  
  const onlineUsers = users.filter(user => {
    if (user.id === currentUser?.id) return false;
    return onlineUserIds.includes(user.id);
  });

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    hapticPresets.selection();
    try {
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  const defaultStats: DashboardStats = stats || {
    totalVisits: 0,
    completedToday: 0,
    pendingApprovals: 0,
    walletBalance: 0,
  };

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-neutral-950", className)} data-testid="mobile-dashboard">
      <div className="sticky top-0 z-40 bg-white dark:bg-black border-b border-black/5 dark:border-white/5 safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-black/60 dark:text-white/60">{greeting}</p>
            <h1 className="text-lg font-semibold text-black dark:text-white">{userName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <BatteryIndicator size="sm" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                navigate('/notifications');
              }}
              className="relative"
              data-testid="button-notifications"
              aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" data-testid="indicator-notifications" />
              )}
            </Button>
          </div>
        </div>
        <SyncStatusBar compact />
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        <div className="px-4 pb-24 space-y-6 pt-4">
          <GeofenceStatusBadge className="w-full justify-center" />

          <QuickActions
            onNewVisit={() => {
              hapticPresets.buttonPress();
              navigate('/site-visits/new');
            }}
            onViewWallet={() => {
              hapticPresets.buttonPress();
              navigate('/wallet');
            }}
            onViewCalendar={() => {
              hapticPresets.buttonPress();
              navigate('/calendar');
            }}
            onSOS={() => {
              hapticPresets.impact();
              navigate('/sos');
            }}
            onChat={() => {
              hapticPresets.buttonPress();
              navigate('/chat');
            }}
            onCall={() => {
              hapticPresets.buttonPress();
              navigate('/calls');
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<CheckCircle className="w-5 h-5" />}
              label="Completed Today"
              value={defaultStats.completedToday}
              variant="primary"
            />
            <StatCard
              icon={<Target className="w-5 h-5" />}
              label="Total Visits"
              value={defaultStats.totalVisits}
              variant="default"
            />
            <StatCard
              icon={<AlertCircle className="w-5 h-5" />}
              label="Pending Approvals"
              value={defaultStats.pendingApprovals}
              variant="secondary"
              onClick={() => navigate('/approvals')}
            />
            <StatCard
              icon={<Wallet className="w-5 h-5" />}
              label="Wallet Balance"
              value={`$${defaultStats.walletBalance.toFixed(0)}`}
              variant="default"
              onClick={() => navigate('/wallet')}
            />
          </div>

          <OnlineNowSection 
            onlineUsers={onlineUsers}
            onChatUser={(userId) => {
              hapticPresets.buttonPress();
              navigate(`/chat?userId=${userId}`);
            }}
            onCallUser={(userId) => {
              hapticPresets.buttonPress();
              navigate(`/calls?userId=${userId}`);
            }}
          />

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-black dark:text-white">
                Upcoming Visits
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  hapticPresets.buttonPress();
                  navigate('/site-visits');
                }}
                className="text-xs"
                data-testid="button-view-all-visits"
                aria-label="View all upcoming visits"
              >
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {upcomingVisits.length > 0 ? (
              <div className="space-y-3">
                {upcomingVisits.slice(0, 3).map((visit) => (
                  <VisitCard
                    key={visit.id}
                    visit={visit}
                    onClick={() => {
                      hapticPresets.buttonPress();
                      navigate(`/site-visits/${visit.id}`);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center">
                <Calendar className="w-10 h-10 text-black/20 dark:text-white/20 mx-auto mb-3" />
                <p className="text-sm text-black/60 dark:text-white/60">
                  No upcoming visits scheduled
                </p>
                <Button
                  onClick={() => {
                    hapticPresets.buttonPress();
                    navigate('/site-visits/new');
                  }}
                  className="mt-4"
                  data-testid="button-schedule-visit"
                  aria-label="Schedule a new site visit"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule Visit
                </Button>
              </Card>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-black dark:text-white mb-3">
              Quick Status
            </h2>
            <Card className="p-4" data-testid="card-quick-status">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black/10 dark:bg-white/10 rounded-full flex items-center justify-center">
                    <Activity className="w-5 h-5 text-black dark:text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black dark:text-white" data-testid="text-system-status-title">
                      System Status
                    </p>
                    <p className="text-xs text-black/60 dark:text-white/60" data-testid="text-system-status-value">
                      All systems operational
                    </p>
                  </div>
                </div>
                <FPSMonitor size="sm" showLabel />
              </div>
            </Card>
          </section>
        </div>
      </PullToRefresh>

      <MobileBottomNav notificationCount={notificationCount} />
    </div>
  );
}

interface QuickActionsProps {
  onNewVisit: () => void;
  onViewWallet: () => void;
  onViewCalendar: () => void;
  onSOS: () => void;
  onChat: () => void;
  onCall: () => void;
}

function QuickActions({ onNewVisit, onViewWallet, onViewCalendar, onSOS, onChat, onCall }: QuickActionsProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onNewVisit}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-black dark:bg-white rounded-2xl active:bg-black/90 dark:active:bg-white/90"
          data-testid="quick-action-new-visit"
          aria-label="Start a new site visit"
        >
          <Plus className="w-6 h-6 text-white dark:text-black" />
          <span className="text-xs font-semibold text-white dark:text-black">New Visit</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onViewWallet}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-black/5 dark:bg-white/5 rounded-2xl active:bg-black/10 dark:active:bg-white/10"
          data-testid="quick-action-wallet"
          aria-label="View wallet balance"
        >
          <Wallet className="w-6 h-6 text-black dark:text-white" />
          <span className="text-xs font-semibold text-black dark:text-white">Wallet</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onViewCalendar}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-black/5 dark:bg-white/5 rounded-2xl active:bg-black/10 dark:active:bg-white/10"
          data-testid="quick-action-calendar"
          aria-label="Open calendar"
        >
          <Calendar className="w-6 h-6 text-black dark:text-white" />
          <span className="text-xs font-semibold text-black dark:text-white">Calendar</span>
        </motion.button>
      </div>
      <div className="flex gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onSOS}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-destructive rounded-2xl active:bg-destructive/90"
          data-testid="quick-action-sos"
          aria-label="Emergency SOS"
        >
          <AlertTriangle className="w-6 h-6 text-destructive-foreground" />
          <span className="text-xs font-semibold text-destructive-foreground">SOS</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onChat}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-black/5 dark:bg-white/5 rounded-2xl active:bg-black/10 dark:active:bg-white/10"
          data-testid="quick-action-chat"
          aria-label="Open chat"
        >
          <MessageSquare className="w-6 h-6 text-black dark:text-white" />
          <span className="text-xs font-semibold text-black dark:text-white">Chat</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onCall}
          className="flex-1 flex flex-col items-center gap-2 p-4 min-h-[72px] bg-black/5 dark:bg-white/5 rounded-2xl active:bg-black/10 dark:active:bg-white/10"
          data-testid="quick-action-call"
          aria-label="Make a call"
        >
          <Phone className="w-6 h-6 text-black dark:text-white" />
          <span className="text-xs font-semibold text-black dark:text-white">Call</span>
        </motion.button>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  variant?: 'default' | 'primary' | 'secondary' | 'muted';
  onClick?: () => void;
}

function StatCard({ icon, label, value, variant = 'default', onClick }: StatCardProps) {
  const variantClasses = {
    default: 'bg-black/10 dark:bg-white/10 text-black dark:text-white',
    primary: 'bg-black dark:bg-white text-white dark:text-black',
    secondary: 'bg-black/5 dark:bg-white/5 text-black/80 dark:text-white/80',
    muted: 'bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        if (onClick) {
          hapticPresets.buttonPress();
          onClick();
        }
      }}
      className="text-left"
      disabled={!onClick}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}
      aria-label={`${label}: ${value}`}
    >
      <Card className={cn("p-4", onClick && "active:bg-black/5 dark:active:bg-white/5")}>
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-3", variantClasses[variant])}>
          {icon}
        </div>
        <p className="text-2xl font-bold text-black dark:text-white" data-testid={`text-stat-value-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
        <p className="text-xs text-black/60 dark:text-white/60">{label}</p>
      </Card>
    </motion.button>
  );
}

interface VisitCardProps {
  visit: UpcomingVisit;
  onClick: () => void;
}

function VisitCard({ visit, onClick }: VisitCardProps) {
  const getStatusColor = () => {
    switch (visit.status) {
      case 'completed':
        return 'bg-black dark:bg-white text-white dark:text-black';
      case 'in_progress':
        return 'bg-black/20 dark:bg-white/20 text-black dark:text-white';
      default:
        return 'bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      className="w-full text-left"
      data-testid={`visit-card-${visit.id}`}
      aria-label={`Visit ${visit.siteName}, ${visit.status.replace('_', ' ')}, scheduled for ${formatTime(visit.scheduledTime)}`}
    >
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-black dark:text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-black dark:text-white truncate">
                {visit.siteName}
              </p>
              <Badge className={cn("text-xs", getStatusColor())}>
                {visit.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-black/60 dark:text-white/60">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(visit.scheduledTime)}
              </span>
              {visit.distance !== undefined && (
                <span className="flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {visit.distance < 1000 
                    ? `${visit.distance}m` 
                    : `${(visit.distance / 1000).toFixed(1)}km`}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-black/20 dark:text-white/20 flex-shrink-0" />
        </div>
      </Card>
    </motion.button>
  );
}

interface OnlineNowSectionProps {
  onlineUsers: Array<{
    id: string;
    name?: string;
    fullName?: string;
    username?: string;
    avatar?: string;
    role?: string;
    roles?: string[];
  }>;
  onChatUser: (userId: string) => void;
  onCallUser: (userId: string) => void;
}

function OnlineNowSection({ onlineUsers, onChatUser, onCallUser }: OnlineNowSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  const filteredUsers = onlineUsers.filter(user => {
    const userName = user.fullName || user.name || user.username || '';
    return userName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (onlineUsers.length === 0) {
    return null;
  }

  return (
    <section data-testid="online-now-section">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-black dark:text-white">
            Online Now
          </h2>
          <Badge className="bg-green-500 text-white text-xs px-2 py-0.5">
            {onlineUsers.length}
          </Badge>
        </div>
      </div>
      
      {onlineUsers.length > 3 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 dark:text-white/40" />
          <input
            type="text"
            placeholder="Search online users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-black/5 dark:bg-white/5 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 text-sm focus:outline-none"
            data-testid="input-search-online-users"
          />
        </div>
      )}
      
      <Card className="divide-y divide-black/5 dark:divide-white/5">
        {filteredUsers.slice(0, 5).map((user) => {
          const userName = user.fullName || user.name || user.username || 'User';
          const userRole = user.roles?.[0] || user.role || 'Team Member';
          
          return (
            <div 
              key={user.id} 
              className="flex items-center gap-3 p-3"
              data-testid={`online-user-${user.id}`}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar} alt={userName} />
                  <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-sm font-bold">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-black dark:text-white truncate">
                  {userName}
                </p>
                <p className="text-xs text-black/60 dark:text-white/60 truncate">
                  {userRole}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onChatUser(user.id)}
                  className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center"
                  data-testid={`button-chat-${user.id}`}
                  aria-label={`Chat with ${userName}`}
                >
                  <MessageSquare className="w-4 h-4 text-black dark:text-white" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onCallUser(user.id)}
                  className="w-9 h-9 rounded-full bg-black dark:bg-white flex items-center justify-center"
                  data-testid={`button-call-${user.id}`}
                  aria-label={`Call ${userName}`}
                >
                  <Phone className="w-4 h-4 text-white dark:text-black" />
                </motion.button>
              </div>
            </div>
          );
        })}
        
        {filteredUsers.length > 5 && (
          <div className="p-3 text-center">
            <span className="text-xs text-black/60 dark:text-white/60">
              +{filteredUsers.length - 5} more online
            </span>
          </div>
        )}
        
        {filteredUsers.length === 0 && searchQuery && (
          <div className="p-4 text-center">
            <p className="text-sm text-black/60 dark:text-white/60">
              No users found matching "{searchQuery}"
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
