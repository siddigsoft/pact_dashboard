import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  CloudRain,
  Navigation,
  HelpCircle,
  X,
  ChevronDown,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface QuickMessage {
  id: string;
  text: string;
  textAr?: string;
  icon: React.ReactNode;
  category: 'status' | 'location' | 'delay' | 'help';
}

const defaultQuickMessages: QuickMessage[] = [
  {
    id: 'on-my-way',
    text: 'On my way to site',
    textAr: 'في طريقي إلى الموقع',
    icon: <Navigation className="w-4 h-4" />,
    category: 'location',
  },
  {
    id: 'arrived',
    text: 'Arrived at location',
    textAr: 'وصلت إلى الموقع',
    icon: <MapPin className="w-4 h-4" />,
    category: 'location',
  },
  {
    id: 'running-late',
    text: 'Running 10 minutes late',
    textAr: 'سأتأخر 10 دقائق',
    icon: <Clock className="w-4 h-4" />,
    category: 'delay',
  },
  {
    id: 'delay-30',
    text: 'Delayed by 30 minutes',
    textAr: 'تأخير 30 دقيقة',
    icon: <Clock className="w-4 h-4" />,
    category: 'delay',
  },
  {
    id: 'visit-completed',
    text: 'Visit completed',
    textAr: 'اكتملت الزيارة',
    icon: <CheckCircle className="w-4 h-4" />,
    category: 'status',
  },
  {
    id: 'need-assistance',
    text: 'Need assistance',
    textAr: 'أحتاج مساعدة',
    icon: <HelpCircle className="w-4 h-4" />,
    category: 'help',
  },
  {
    id: 'weather-delay',
    text: 'Weather conditions causing delay',
    textAr: 'الطقس يسبب تأخير',
    icon: <CloudRain className="w-4 h-4" />,
    category: 'delay',
  },
  {
    id: 'issue-found',
    text: 'Issue found at site',
    textAr: 'تم اكتشاف مشكلة',
    icon: <AlertTriangle className="w-4 h-4" />,
    category: 'status',
  },
];

interface QuickMessageButtonProps {
  message: QuickMessage;
  onSend: (message: QuickMessage) => void;
  isRtl?: boolean;
  size?: 'sm' | 'md';
}

function QuickMessageButton({ message, onSend, isRtl, size = 'md' }: QuickMessageButtonProps) {
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    hapticPresets.buttonPress();
    setIsSending(true);
    await onSend(message);
    setTimeout(() => {
      hapticPresets.success();
      setIsSending(false);
    }, 300);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={handleSend}
      disabled={isSending}
      className={cn(
        "flex items-center gap-2 px-4 min-h-[44px] rounded-full",
        "bg-black/5 dark:bg-white/5",
        "text-black dark:text-white",
        "active:bg-black/10 dark:active:bg-white/10",
        "disabled:opacity-50",
        "transition-colors",
        size === 'sm' && "px-3 min-h-[44px]"
      )}
      data-testid={`quick-message-${message.id}`}
      aria-label={`Send: ${isRtl ? message.textAr || message.text : message.text}`}
    >
      <span className={cn(
        "flex-shrink-0",
        isSending && "animate-pulse"
      )}>
        {isSending ? <Send className="w-4 h-4" /> : message.icon}
      </span>
      <span className={cn(
        "text-sm font-medium whitespace-nowrap",
        size === 'sm' && "text-xs"
      )}>
        {isRtl ? message.textAr || message.text : message.text}
      </span>
    </motion.button>
  );
}

interface QuickMessagesBarProps {
  onSend: (message: string) => void;
  messages?: QuickMessage[];
  isRtl?: boolean;
  className?: string;
}

export function QuickMessagesBar({
  onSend,
  messages = defaultQuickMessages,
  isRtl = false,
  className,
}: QuickMessagesBarProps) {
  const handleSendMessage = useCallback((message: QuickMessage) => {
    const text = isRtl ? (message.textAr || message.text) : message.text;
    onSend(text);
  }, [onSend, isRtl]);

  return (
    <div 
      className={cn(
        "flex gap-2 overflow-x-auto py-2 px-4 scrollbar-hide",
        className
      )}
      data-testid="quick-messages-bar"
    >
      {messages.map((message) => (
        <QuickMessageButton
          key={message.id}
          message={message}
          onSend={handleSendMessage}
          isRtl={isRtl}
          size="sm"
        />
      ))}
    </div>
  );
}

interface QuickMessagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  messages?: QuickMessage[];
  isRtl?: boolean;
  recipientName?: string;
}

export function QuickMessagesPanel({
  isOpen,
  onClose,
  onSend,
  messages = defaultQuickMessages,
  isRtl = false,
  recipientName,
}: QuickMessagesPanelProps) {
  const groupedMessages = messages.reduce((acc, msg) => {
    if (!acc[msg.category]) acc[msg.category] = [];
    acc[msg.category].push(msg);
    return acc;
  }, {} as Record<string, QuickMessage[]>);

  const categoryLabels: Record<string, { en: string; ar: string }> = {
    status: { en: 'Status Updates', ar: 'تحديثات الحالة' },
    location: { en: 'Location', ar: 'الموقع' },
    delay: { en: 'Delays', ar: 'التأخيرات' },
    help: { en: 'Assistance', ar: 'المساعدة' },
  };

  const handleSendMessage = useCallback((message: QuickMessage) => {
    const text = isRtl ? (message.textAr || message.text) : message.text;
    onSend(text);
    onClose();
  }, [onSend, onClose, isRtl]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
            data-testid="quick-messages-overlay"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[70vh] overflow-hidden"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-black dark:text-white" />
                  <h2 className="text-lg font-semibold text-black dark:text-white">
                    {isRtl ? 'رسائل سريعة' : 'Quick Messages'}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-full min-w-[44px] min-h-[44px]"
                  data-testid="button-close-quick-messages"
                  aria-label="Close quick messages"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {recipientName && (
                <div className="px-4 py-2 bg-black/5 dark:bg-white/5">
                  <p className="text-sm text-black/60 dark:text-white/60">
                    {isRtl ? `إرسال إلى: ${recipientName}` : `Sending to: ${recipientName}`}
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {Object.entries(groupedMessages).map(([category, categoryMessages]) => (
                  <div key={category}>
                    <h3 className="text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wider mb-3">
                      {isRtl ? categoryLabels[category]?.ar : categoryLabels[category]?.en}
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {categoryMessages.map((message) => (
                        <QuickMessageButton
                          key={message.id}
                          message={message}
                          onSend={handleSendMessage}
                          isRtl={isRtl}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface QuickMessagesFabProps {
  onSend: (message: string) => void;
  messages?: QuickMessage[];
  isRtl?: boolean;
  className?: string;
}

export function QuickMessagesFab({
  onSend,
  messages = defaultQuickMessages,
  isRtl = false,
  className,
}: QuickMessagesFabProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          hapticPresets.buttonPress();
          setIsOpen(true);
        }}
        className={cn(
          "fixed left-4 bottom-24 z-40",
          "w-12 h-12 rounded-full shadow-lg",
          "bg-black dark:bg-white",
          "flex items-center justify-center",
          className
        )}
        data-testid="fab-quick-messages"
        aria-label="Open quick messages"
      >
        <Zap className="w-5 h-5 text-white dark:text-black" />
      </motion.button>

      <QuickMessagesPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSend={onSend}
        messages={messages}
        isRtl={isRtl}
      />
    </>
  );
}

export { defaultQuickMessages };
export type { QuickMessage };
