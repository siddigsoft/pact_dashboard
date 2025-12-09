import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Paperclip, 
  Mic, 
  Image, 
  Camera, 
  X, 
  Check, 
  CheckCheck,
  Clock,
  MoreVertical,
  Reply,
  Copy,
  Trash2,
  Forward,
  Smile
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format, isToday, isYesterday } from 'date-fns';

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  type?: 'text' | 'image' | 'audio' | 'file' | 'location';
  attachmentUrl?: string;
  replyTo?: ChatMessage;
  isOwn?: boolean;
}

interface MobileChatBubbleProps {
  message: ChatMessage;
  showAvatar?: boolean;
  showName?: boolean;
  onReply?: (message: ChatMessage) => void;
  onCopy?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  className?: string;
}

export function MobileChatBubble({
  message,
  showAvatar = true,
  showName = true,
  onReply,
  onCopy,
  onDelete,
  onForward,
  className,
}: MobileChatBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const isOwn = message.isOwn;

  const handleLongPress = useCallback(() => {
    hapticPresets.warning();
    setShowActions(true);
  }, []);

  const StatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return <Clock className="h-3 w-3 text-black/40 dark:text-white/40" />;
      case 'sent':
        return <Check className="h-3 w-3 text-black/40 dark:text-white/40" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-black/40 dark:text-white/40" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-black dark:text-white" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[85%]",
        isOwn ? "ml-auto flex-row-reverse" : "mr-auto",
        className
      )}
      data-testid={`chat-bubble-${message.id}`}
    >
      {showAvatar && !isOwn && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center self-end">
          {message.senderAvatar ? (
            <img src={message.senderAvatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-xs font-medium text-black/60 dark:text-white/60">
              {message.senderName?.charAt(0) || '?'}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {showName && !isOwn && message.senderName && (
          <span className="text-xs font-medium text-black/60 dark:text-white/60 px-1">
            {message.senderName}
          </span>
        )}

        {message.replyTo && (
          <div className={cn(
            "px-3 py-1.5 rounded-t-xl border-l-2",
            isOwn 
              ? "bg-black/5 dark:bg-white/5 border-black/40 dark:border-white/40" 
              : "bg-black/5 dark:bg-white/5 border-black/40 dark:border-white/40"
          )}>
            <p className="text-xs font-medium text-black/60 dark:text-white/60">
              {message.replyTo.senderName}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40 truncate">
              {message.replyTo.content}
            </p>
          </div>
        )}

        <motion.div
          className={cn(
            "relative px-3 py-2 rounded-2xl touch-manipulation",
            message.replyTo && "rounded-t-lg",
            isOwn 
              ? "bg-black dark:bg-white text-white dark:text-black rounded-br-md" 
              : "bg-black/5 dark:bg-white/10 text-black dark:text-white rounded-bl-md"
          )}
          onContextMenu={(e) => {
            e.preventDefault();
            handleLongPress();
          }}
          whileTap={{ scale: 0.98 }}
        >
          {message.type === 'image' && message.attachmentUrl && (
            <img 
              src={message.attachmentUrl} 
              alt="" 
              className="rounded-lg mb-2 max-w-[200px]"
            />
          )}

          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

          <div className={cn(
            "flex items-center justify-end gap-1 mt-1",
            isOwn ? "text-white/60 dark:text-black/60" : "text-black/40 dark:text-white/40"
          )}>
            <span className="text-[10px]">
              {format(message.timestamp, 'HH:mm')}
            </span>
            {isOwn && <StatusIcon />}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
            onClick={() => setShowActions(false)}
            data-testid="chat-actions-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden min-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { icon: Reply, label: 'Reply', action: onReply },
                { icon: Copy, label: 'Copy', action: onCopy },
                { icon: Forward, label: 'Forward', action: onForward },
                { icon: Trash2, label: 'Delete', action: onDelete, destructive: true },
              ].map(({ icon: Icon, label, action, destructive }) => action && (
                <button
                  key={label}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left",
                    "active:bg-black/5 dark:active:bg-white/5",
                    destructive ? "text-destructive" : "text-black dark:text-white"
                  )}
                  onClick={() => {
                    hapticPresets.buttonPress();
                    action(message);
                    setShowActions(false);
                  }}
                  data-testid={`button-${label.toLowerCase()}-message`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChatInputProps {
  onSend: (content: string, type?: ChatMessage['type']) => void;
  onAttach?: () => void;
  onCamera?: () => void;
  onVoice?: () => void;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ChatInput({
  onSend,
  onAttach,
  onCamera,
  onVoice,
  replyTo,
  onCancelReply,
  placeholder = 'Type a message...',
  disabled = false,
  className,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!message.trim() || disabled) return;
    
    hapticPresets.buttonPress();
    onSend(message.trim());
    setMessage('');
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [message, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
  }, []);

  return (
    <div className={cn("bg-white dark:bg-neutral-900 border-t border-black/10 dark:border-white/10", className)}>
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-3 px-4 py-2 bg-black/5 dark:bg-white/5 border-l-2 border-black dark:border-white"
            data-testid="reply-preview"
          >
            <Reply className="h-4 w-4 text-black/60 dark:text-white/60 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-black dark:text-white">
                {replyTo.senderName}
              </p>
              <p className="text-xs text-black/60 dark:text-white/60 truncate">
                {replyTo.content}
              </p>
            </div>
            <button
              onClick={() => {
                hapticPresets.buttonPress();
                onCancelReply?.();
              }}
              className="p-1"
              data-testid="button-cancel-reply"
            >
              <X className="h-4 w-4 text-black/60 dark:text-white/60" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2 p-3">
        <div className="flex items-center gap-1">
          {onAttach && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                onAttach();
              }}
              disabled={disabled}
              className="rounded-full"
              data-testid="button-attach"
            >
              <Paperclip className="h-5 w-5 text-black/60 dark:text-white/60" />
            </Button>
          )}

          {onCamera && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                onCamera();
              }}
              disabled={disabled}
              className="rounded-full"
              data-testid="button-camera"
            >
              <Camera className="h-5 w-5 text-black/60 dark:text-white/60" />
            </Button>
          )}
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full px-4 py-2.5 bg-black/5 dark:bg-white/5 rounded-2xl",
              "text-sm text-black dark:text-white resize-none",
              "placeholder:text-black/40 dark:placeholder:text-white/40",
              "focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20",
              "max-h-[120px] overflow-y-auto",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            data-testid="input-chat-message"
          />
        </div>

        {message.trim() ? (
          <Button
            variant="default"
            size="icon"
            onClick={handleSend}
            disabled={disabled}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black flex-shrink-0"
            data-testid="button-send-message"
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : onVoice ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              onVoice();
            }}
            disabled={disabled}
            className="rounded-full flex-shrink-0"
            data-testid="button-voice-message"
          >
            <Mic className="h-5 w-5 text-black/60 dark:text-white/60" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface ChatListProps {
  messages: ChatMessage[];
  currentUserId: string;
  onReply?: (message: ChatMessage) => void;
  onLoadMore?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ChatList({
  messages,
  currentUserId,
  onReply,
  onLoadMore,
  isLoading = false,
  className,
}: ChatListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const groupedMessages = groupMessagesByDate(messages);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setShowScrollToBottom(!isAtBottom);

    if (target.scrollTop < 100 && onLoadMore && !isLoading) {
      onLoadMore();
    }
  }, [onLoadMore, isLoading]);

  const scrollToBottom = useCallback(() => {
    hapticPresets.buttonPress();
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
    });
  }, [messages.length]);

  return (
    <div 
      ref={listRef}
      className={cn("flex-1 overflow-y-auto p-4", className)}
      onScroll={handleScroll}
      data-testid="chat-list"
    >
      {Object.entries(groupedMessages).map(([date, dateMessages]) => (
        <div key={date} className="mb-4">
          <div className="flex justify-center mb-4">
            <span className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 text-xs font-medium text-black/60 dark:text-white/60">
              {date}
            </span>
          </div>

          <div className="space-y-2">
            {dateMessages.map((message, index) => {
              const prevMessage = dateMessages[index - 1];
              const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

              return (
                <MobileChatBubble
                  key={message.id}
                  message={{ ...message, isOwn: message.senderId === currentUserId }}
                  showAvatar={showAvatar}
                  showName={showAvatar}
                  onReply={onReply}
                  onCopy={(msg) => {
                    navigator.clipboard.writeText(msg.content);
                    hapticPresets.success();
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}

      <AnimatePresence>
        {showScrollToBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-24 right-4 w-10 h-10 rounded-full bg-black dark:bg-white shadow-lg flex items-center justify-center"
            onClick={scrollToBottom}
            data-testid="button-scroll-to-bottom"
          >
            <svg className="w-5 h-5 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function groupMessagesByDate(messages: ChatMessage[]): Record<string, ChatMessage[]> {
  const groups: Record<string, ChatMessage[]> = {};

  messages.forEach(message => {
    let dateKey: string;
    
    if (isToday(message.timestamp)) {
      dateKey = 'Today';
    } else if (isYesterday(message.timestamp)) {
      dateKey = 'Yesterday';
    } else {
      dateKey = format(message.timestamp, 'MMMM d, yyyy');
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(message);
  });

  return groups;
}

interface TypingIndicatorProps {
  users: Array<{ id: string; name: string }>;
  className?: string;
}

export function TypingIndicator({ users, className }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const text = users.length === 1
    ? `${users[0].name} is typing...`
    : users.length === 2
    ? `${users[0].name} and ${users[1].name} are typing...`
    : `${users[0].name} and ${users.length - 1} others are typing...`;

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2", className)} data-testid="typing-indicator">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-black/40 dark:bg-white/40"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-black/60 dark:text-white/60">{text}</span>
    </div>
  );
}
