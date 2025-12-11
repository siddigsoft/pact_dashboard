import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone,
  MessageSquare,
  MapPin,
  Navigation,
  Clock,
  User,
  Users,
  ChevronRight,
  X,
  Send,
  Mic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { QuickMessagesPanel } from './MobileQuickMessages';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  phone?: string;
  isOnline?: boolean;
}

interface SiteVisitCommPanelProps {
  visitId: string;
  siteName: string;
  siteLocation?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  teamMembers: TeamMember[];
  onCall: (member: TeamMember) => void;
  onMessage: (member: TeamMember, message: string) => void;
  onNavigate?: () => void;
  onShareLocation?: () => void;
  className?: string;
}

export function SiteVisitCommPanel({
  visitId,
  siteName,
  siteLocation,
  status = 'pending',
  teamMembers,
  onCall,
  onMessage,
  onNavigate,
  onShareLocation,
  className,
}: SiteVisitCommPanelProps) {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showQuickMessages, setShowQuickMessages] = useState(false);

  const handleCall = useCallback((member: TeamMember) => {
    hapticPresets.buttonPress();
    onCall(member);
  }, [onCall]);

  const handleQuickMessage = useCallback((message: string) => {
    if (selectedMember) {
      onMessage(selectedMember, message);
    }
  }, [selectedMember, onMessage]);

  const statusColors = {
    'pending': 'bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70',
    'in-progress': 'bg-black dark:bg-white text-white dark:text-black',
    'completed': 'bg-black/20 text-black/60 dark:bg-white/20 dark:text-white/60',
  };

  const statusLabels = {
    'pending': 'Pending',
    'in-progress': 'In Progress',
    'completed': 'Completed',
  };

  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden", className)} data-testid="site-visit-comm-panel">
      <div className="p-4 border-b border-black/5 dark:border-white/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-black/60 dark:text-white/60 flex-shrink-0" />
              <h3 className="text-base font-semibold text-black dark:text-white truncate">
                {siteName}
              </h3>
            </div>
            {siteLocation && (
              <p className="text-sm text-black/60 dark:text-white/60 truncate">
                {siteLocation}
              </p>
            )}
          </div>
          <Badge className={cn("flex-shrink-0", statusColors[status])} data-testid="badge-visit-status">
            {statusLabels[status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2 mt-4">
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onNavigate();
              }}
              className="flex-1 rounded-full"
              data-testid="button-navigate"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Navigate
            </Button>
          )}
          {onShareLocation && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onShareLocation();
              }}
              className="flex-1 rounded-full"
              data-testid="button-share-location"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Share Location
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-black/60 dark:text-white/60" />
          <h4 className="text-sm font-medium text-black/60 dark:text-white/60">
            Team ({teamMembers.length})
          </h4>
        </div>

        <div className="space-y-2">
          {teamMembers.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              onCall={() => handleCall(member)}
              onMessage={() => {
                setSelectedMember(member);
                setShowQuickMessages(true);
              }}
            />
          ))}
        </div>
      </div>

      <QuickMessagesPanel
        isOpen={showQuickMessages}
        onClose={() => {
          setShowQuickMessages(false);
          setSelectedMember(null);
        }}
        onSend={handleQuickMessage}
        recipientName={selectedMember?.name}
      />
    </div>
  );
}

interface TeamMemberRowProps {
  member: TeamMember;
  onCall: () => void;
  onMessage: () => void;
}

function TeamMemberRow({ member, onCall, onMessage }: TeamMemberRowProps) {
  return (
    <div 
      className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl"
      data-testid={`team-member-${member.id}`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
          {member.avatar ? (
            <img src={member.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-black/60 dark:text-white/60" />
          )}
        </div>
        {member.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-black dark:bg-white rounded-full border-2 border-white dark:border-neutral-900" data-testid={`indicator-online-${member.id}`} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black dark:text-white truncate">
          {member.name}
        </p>
        <p className="text-xs text-black/60 dark:text-white/60 truncate">
          {member.role}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            hapticPresets.buttonPress();
            onMessage();
          }}
          className="rounded-full min-w-[44px] min-h-[44px]"
          data-testid={`button-message-${member.id}`}
          aria-label={`Message ${member.name}`}
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            hapticPresets.buttonPress();
            onCall();
          }}
          className="rounded-full min-w-[44px] min-h-[44px]"
          data-testid={`button-call-${member.id}`}
          aria-label={`Call ${member.name}`}
        >
          <Phone className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

interface FloatingCommBarProps {
  visitId: string;
  siteName: string;
  supervisor?: TeamMember;
  onCall: (member: TeamMember) => void;
  onMessage: () => void;
  onExpand: () => void;
  isMinimized?: boolean;
  className?: string;
}

export function FloatingCommBar({
  visitId,
  siteName,
  supervisor,
  onCall,
  onMessage,
  onExpand,
  isMinimized = true,
  className,
}: FloatingCommBarProps) {
  if (!supervisor) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={cn(
        "fixed bottom-20 left-4 right-4 z-40",
        "bg-black dark:bg-white rounded-2xl shadow-xl",
        className
      )}
      data-testid="floating-comm-bar"
    >
      <div className="flex items-center gap-3 p-3">
        <div className="w-10 h-10 rounded-full bg-white/10 dark:bg-black/10 flex items-center justify-center flex-shrink-0">
          {supervisor.avatar ? (
            <img src={supervisor.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-white dark:text-black" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white dark:text-black truncate">
            {supervisor.name}
          </p>
          <p className="text-xs text-white/60 dark:text-black/60 truncate">
            {supervisor.role}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              onMessage();
            }}
            className="rounded-full text-white dark:text-black min-w-[44px] min-h-[44px]"
            data-testid="button-quick-message"
            aria-label="Send message"
          >
            <MessageSquare className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              onCall(supervisor);
            }}
            className="rounded-full text-white dark:text-black min-w-[44px] min-h-[44px]"
            data-testid="button-quick-call"
            aria-label="Call supervisor"
          >
            <Phone className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              onExpand();
            }}
            className="rounded-full text-white dark:text-black min-w-[44px] min-h-[44px]"
            data-testid="button-expand-comm"
            aria-label="Expand communication panel"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

interface CommunicationHistoryProps {
  visitId: string;
  history: Array<{
    id: string;
    type: 'call' | 'message' | 'voice';
    participant: TeamMember;
    content?: string;
    duration?: number;
    timestamp: Date;
    direction: 'incoming' | 'outgoing';
  }>;
  className?: string;
}

export function CommunicationHistory({
  visitId,
  history,
  className,
}: CommunicationHistoryProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("space-y-3", className)} data-testid="communication-history">
      {history.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl"
          data-testid={`history-item-${item.id}`}
        >
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            item.direction === 'outgoing' 
              ? "bg-black dark:bg-white text-white dark:text-black"
              : "bg-black/10 dark:bg-white/10 text-black dark:text-white"
          )}>
            {item.type === 'call' && <Phone className="w-4 h-4" />}
            {item.type === 'message' && <MessageSquare className="w-4 h-4" />}
            {item.type === 'voice' && <Mic className="w-4 h-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-medium text-black dark:text-white truncate">
                {item.participant.name}
              </p>
              <span className="text-xs text-black/40 dark:text-white/40">
                {item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
              </span>
            </div>

            {item.type === 'call' && item.duration && (
              <p className="text-xs text-black/60 dark:text-white/60">
                Call duration: {formatDuration(item.duration)}
              </p>
            )}

            {item.type === 'message' && item.content && (
              <p className="text-sm text-black/70 dark:text-white/70 truncate">
                {item.content}
              </p>
            )}

            {item.type === 'voice' && item.duration && (
              <p className="text-xs text-black/60 dark:text-white/60">
                Voice note: {formatDuration(item.duration)}
              </p>
            )}

            <p className="text-xs text-black/40 dark:text-white/40 mt-1">
              {new Date(item.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export type { TeamMember };
