
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
import { getUserStatus } from '@/utils/userStatusUtils';
import { supabase } from '@/integrations/supabase/client';
import { 
  Send, ArrowLeft, Paperclip, Users, X, File, Loader2, Phone, Video,
  Smile, Check, CheckCheck, MessageSquare, RotateCcw, Mic, MicOff,
  Search, Pin, PinOff, SmilePlus, MoreVertical, Volume2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadChatAttachment, getContentTypeFromFile, formatFileSize, ChatAttachment } from '@/utils/chatUpload';
import { cn } from '@/lib/utils';

interface ChatWindowProps { hideHeader?: boolean; }

const EMOJI_OPTIONS = ['👍','❤️','😂','😮','😢','🙏','🔥','✅'];

interface Reaction { emoji: string; user_id: string; message_id: string; }
interface PinnedMsg { message_id: string; content_preview: string; pinned_by: string; }

const ChatWindow: React.FC<ChatWindowProps> = ({ hideHeader = false }) => {
  const navigate = useNavigate();
  const { activeChat, getChatMessages, sendMessage, setActiveChat, isSendingMessage, typingUsers, sendTypingIndicator } = useChat();
  const { initiateCall } = useCommunication();
  const [messageText, setMessageText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const { currentUser, users } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef<number>(0);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reactions
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [emojiPickerForMsg, setEmojiPickerForMsg] = useState<string | null>(null);

  // Pinning
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMsg[]>([]);
  const [showPinned, setShowPinned] = useState(false);

  // Read receipts
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({}); // messageId -> [userId,...]
  
  const chatMessages = activeChat ? getChatMessages(activeChat.id) || [] : [];

  const getTargetUser = () => {
    if (!activeChat || activeChat.type !== 'private') return null;
    const targetUserId = activeChat.participants.find(id => id !== currentUser?.id);
    if (!targetUserId) return null;
    return users.find(u => u.id === targetUserId);
  };
  const targetUser = getTargetUser();

  const getTargetUserStatus = () => {
    if (!targetUser) return null;
    const status = getUserStatus(targetUser);
    if (status.type === 'online') return { text: 'Online', color: 'text-green-600 dark:text-green-400', dotColor: 'bg-green-500' };
    const lastSeenTime = targetUser.location?.lastUpdated || targetUser.lastActive;
    if (lastSeenTime) {
      try {
        return { text: `Last seen ${formatDistanceToNow(parseISO(lastSeenTime), { addSuffix: false })} ago`, color: 'text-gray-500 dark:text-gray-400', dotColor: 'bg-gray-400' };
      } catch { /* noop */ }
    }
    return { text: status.label, color: 'text-gray-500 dark:text-gray-400', dotColor: 'bg-gray-400' };
  };

  // Load reactions, pinned messages, and read receipts when chat changes
  useEffect(() => {
    if (!activeChat) return;
    loadReactions();
    loadPinnedMessages();
    loadReadReceipts();
  }, [activeChat?.id]);

  // Mark visible messages as read when chat is active
  useEffect(() => {
    if (!activeChat || !currentUser?.id || chatMessages.length === 0) return;
    const othersMessages = chatMessages.filter(m => m.senderId !== currentUser.id);
    if (othersMessages.length === 0) return;
    const unreadIds = othersMessages
      .filter(m => !readReceipts[m.id]?.includes(currentUser.id))
      .map(m => m.id);
    if (unreadIds.length === 0) return;
    // Mark as read in batch (fire and forget)
    const markRead = async () => {
      const rows = unreadIds.map(msgId => ({ message_id: msgId, chat_id: activeChat.id, user_id: currentUser.id }));
      await supabase.from('message_reads').upsert(rows, { onConflict: 'message_id,user_id' });
      // Update local state
      setReadReceipts(prev => {
        const updated = { ...prev };
        unreadIds.forEach(id => {
          updated[id] = [...(updated[id] || []), currentUser.id!];
        });
        return updated;
      });
    };
    markRead();
  }, [activeChat?.id, chatMessages.length]);

  const loadReadReceipts = async () => {
    if (!activeChat) return;
    const { data } = await supabase.from('message_reads').select('message_id, user_id').eq('chat_id', activeChat.id);
    if (!data) return;
    const grouped: Record<string, string[]> = {};
    data.forEach((r: { message_id: string; user_id: string }) => {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      grouped[r.message_id].push(r.user_id);
    });
    setReadReceipts(grouped);
  };

  const loadReactions = async () => {
    if (!activeChat) return;
    const { data } = await supabase.from('chat_message_reactions').select('*').eq('chat_id', activeChat.id);
    setReactions(data || []);
  };

  const loadPinnedMessages = async () => {
    if (!activeChat) return;
    const { data } = await supabase.from('chat_pinned_messages').select('*').eq('chat_id', activeChat.id).order('pinned_at', { ascending: false });
    setPinnedMessages(data || []);
  };

  // Filtered messages based on search
  const displayMessages = searchQuery.trim()
    ? chatMessages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : chatMessages;

  const handleCall = (isVideo: boolean = false) => {
    if (!targetUser) {
      toast({ title: 'Cannot call', description: activeChat?.type === 'group' ? 'Group calls are not supported yet' : 'User not found', variant: 'destructive' });
      return;
    }
    initiateCall(targetUser);
    navigate('/calls');
  };

  useEffect(() => {
    if (messageText.length > 0 && activeChat) {
      const now = Date.now();
      if (now - lastTypingSent.current > 1000) {
        sendTypingIndicator(activeChat.id);
        lastTypingSent.current = now;
      }
    }
  }, [messageText, activeChat, sendTypingIndicator]);

  const currentChatTypingUsers = activeChat ? typingUsers[activeChat.id] || [] : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach(file => { try { URL.revokeObjectURL(URL.createObjectURL(file)); } catch { /* noop */ } });
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [selectedFiles]);

  // ── Voice Recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const audioFile = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });
        await sendVoiceMessage(audioFile);
      };
      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access to send voice messages', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecording(false);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      audioChunksRef.current = []; // clear so onstop does nothing
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecording(false);
    setRecordingTime(0);
  };

  const sendVoiceMessage = async (audioFile: File) => {
    if (!activeChat || !currentUser?.id) return;
    try {
      const attachment = await uploadChatAttachment(audioFile, activeChat.id, currentUser.id);
      await sendMessage(activeChat.id, '🎤 Voice message', 'audio', [{ url: attachment.url, name: audioFile.name, type: audioFile.type, size: audioFile.size }], { duration: recordingTime });
      toast({ title: 'Voice message sent' });
    } catch (e: any) {
      toast({ title: 'Failed to send voice message', description: e.message, variant: 'destructive' });
    }
  };

  const formatRecordingTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const validFiles: File[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({ title: 'File too large', description: `${file.name} exceeds the ${isImage ? '10MB' : '25MB'} limit`, variant: 'destructive' });
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) setSelectedFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (index: number) => setSelectedFiles(prev => prev.filter((_, i) => i !== index));

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!activeChat || !currentUser?.id) return;
    const hasText = messageText.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    if (!hasText && !hasFiles) return;
    try {
      if (hasFiles) {
        const attachments: ChatAttachment[] = [];
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const fileId = `${file.name}_${file.size}_${i}`;
          setUploadingFiles(prev => ({ ...prev, [fileId]: true }));
          try {
            const attachment = await uploadChatAttachment(file, activeChat.id, currentUser.id);
            attachments.push(attachment);
          } catch (error: any) {
            toast({ title: 'Upload failed', description: `Failed to upload ${file.name}: ${error.message}`, variant: 'destructive' });
            setUploadingFiles(prev => { const u = { ...prev }; delete u[fileId]; return u; });
            return;
          } finally {
            setUploadingFiles(prev => { const u = { ...prev }; delete u[fileId]; return u; });
          }
        }
        if (attachments.length > 0) {
          const contentType = getContentTypeFromFile(selectedFiles[0]);
          await sendMessage(activeChat.id, messageText || (contentType === 'image' ? 'Photo' : 'File'), contentType, attachments.map(a => ({ url: a.url, name: a.name, type: a.type, size: a.size })), { fileCount: attachments.length });
        }
      } else {
        await sendMessage(activeChat.id, messageText, 'text');
      }
      setMessageText('');
      setSelectedFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (error: any) {
      toast({ title: 'Failed to send', description: error.message || 'An error occurred', variant: 'destructive' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // ── Reactions ──────────────────────────────────────────────────────────────
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser?.id || !activeChat) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === currentUser.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('chat_message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji);
      setReactions(prev => prev.filter(r => !(r.message_id === messageId && r.user_id === currentUser.id && r.emoji === emoji)));
    } else {
      await supabase.from('chat_message_reactions').insert({ message_id: messageId, chat_id: activeChat.id, user_id: currentUser.id, emoji });
      setReactions(prev => [...prev, { message_id: messageId, chat_id: activeChat.id, user_id: currentUser.id, emoji } as any]);
    }
    setEmojiPickerForMsg(null);
  };

  const getMessageReactions = (messageId: string) => {
    const msgReactions = reactions.filter(r => r.message_id === messageId);
    const grouped: Record<string, { count: number; myReaction: boolean }> = {};
    msgReactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, myReaction: false };
      grouped[r.emoji].count++;
      if (r.user_id === currentUser?.id) grouped[r.emoji].myReaction = true;
    });
    return grouped;
  };

  // ── Pinning ────────────────────────────────────────────────────────────────
  const pinMessage = async (messageId: string, content: string) => {
    if (!activeChat || !currentUser?.id) return;
    const alreadyPinned = pinnedMessages.some(p => p.message_id === messageId);
    if (alreadyPinned) {
      await supabase.from('chat_pinned_messages').delete().eq('chat_id', activeChat.id).eq('message_id', messageId);
      setPinnedMessages(prev => prev.filter(p => p.message_id !== messageId));
      toast({ title: 'Message unpinned' });
    } else {
      const preview = content.length > 80 ? content.substring(0, 80) + '…' : content;
      await supabase.from('chat_pinned_messages').insert({ chat_id: activeChat.id, message_id: messageId, pinned_by: currentUser.id, content_preview: preview });
      setPinnedMessages(prev => [{ message_id: messageId, content_preview: preview, pinned_by: currentUser.id }, ...prev]);
      toast({ title: 'Message pinned' });
    }
    setEmojiPickerForMsg(null);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday ' + format(date, 'HH:mm');
    return format(date, 'MMM d, HH:mm');
  };

  if (!activeChat) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-gray-950" data-testid="no-chat-selected">
        <div className="max-w-sm">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center mx-auto mb-5">
            <MessageSquare className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Select a conversation</h2>
          <p className="text-sm text-gray-500 leading-relaxed">Choose a chat from the sidebar or start a new conversation with your team</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900" data-testid="chat-window" onClick={() => { setEmojiPickerForMsg(null); }}>
      {/* ── Header ── */}
      {!hideHeader && (
        <div className="px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
          {searchOpen ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="flex-1 h-8 text-sm"
                data-testid="input-message-search"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400" onClick={() => setActiveChat(null)} data-testid="button-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="relative cursor-pointer">
                  {activeChat.type === 'private' ? (
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-sm">{activeChat.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"><Users className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                  )}
                  {activeChat.type === 'private' && (() => {
                    const status = getTargetUserStatus();
                    return <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${status?.dotColor || 'bg-gray-400'} rounded-full border-2 border-white dark:border-gray-900`} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight truncate" data-testid="text-chat-name">{activeChat.name}</h3>
                  <p className="text-xs mt-0.5">
                    {activeChat.type === 'group'
                      ? <span className="text-gray-500">{activeChat.participants.length} participants</span>
                      : (() => { const status = getTargetUserStatus(); return <span className={`${status?.color || 'text-gray-500'}`}>{status?.text || 'Offline'}</span>; })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {pinnedMessages.length > 0 && (
                  <Button variant="ghost" size="icon" className={cn('rounded-lg h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800', showPinned && 'bg-amber-50 dark:bg-amber-900/20 text-amber-600')} onClick={() => setShowPinned(v => !v)} data-testid="button-pinned">
                    <Pin className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" onClick={() => setSearchOpen(true)} data-testid="button-search">
                  <Search className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" onClick={() => handleCall(false)} disabled={!targetUser} data-testid="button-call">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" onClick={() => handleCall(true)} disabled={!targetUser} data-testid="button-video">
                  <Video className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" onClick={() => window.location.reload()} data-testid="button-refresh">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pinned messages banner ── */}
      {showPinned && pinnedMessages.length > 0 && (
        <div className="border-b border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Pin className="h-3.5 w-3.5" />{pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? 's' : ''}
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-amber-600" onClick={() => setShowPinned(false)}>Hide</Button>
          </div>
          {pinnedMessages.slice(0, 3).map(p => (
            <div key={p.message_id} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Pin className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="truncate">{p.content_preview}</span>
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto shrink-0 text-amber-500 hover:text-red-500" onClick={() => pinMessage(p.message_id, p.content_preview)}>
                <PinOff className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ── Search results note ── */}
      {searchQuery.trim() && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 text-xs text-blue-700 dark:text-blue-400 font-medium">
          {displayMessages.length} result{displayMessages.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* ── Messages ── */}
      <ScrollArea className="flex-1 bg-gray-50 dark:bg-gray-950">
        <div className="px-4 py-6 space-y-3 pb-4">
          {displayMessages.length > 0 ? (
            displayMessages.map((message, index) => {
              const isOwnMessage = message.senderId === currentUser?.id;
              const showAvatar = !isOwnMessage && (index === 0 || displayMessages[index - 1]?.senderId === currentUser?.id);
              const msgReactions = getMessageReactions(message.id);
              const hasReactions = Object.keys(msgReactions).length > 0;
              const isPinned = pinnedMessages.some(p => p.message_id === message.id);
              const isAudio = message.contentType === 'audio';

              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-2 duration-300 group`}
                  data-testid={`message-${message.id}`}
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
                >
                  <div className={`flex items-end gap-2 max-w-[75%] ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <Avatar className={`h-7 w-7 shrink-0 ${showAvatar ? 'visible' : 'invisible'}`}>
                        <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                          {activeChat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="relative">
                      {isPinned && (
                        <div className={cn('absolute -top-1.5 flex items-center gap-0.5 text-[9px] text-amber-600 font-semibold', isOwnMessage ? 'right-0' : 'left-0')}>
                          <Pin className="h-2.5 w-2.5" />Pinned
                        </div>
                      )}

                      <div
                        className={`relative group/msg px-4 py-2.5 transition-all ${isPinned ? 'ring-1 ring-amber-400/50' : ''} ${
                          isOwnMessage
                            ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700'
                        }`}
                        style={{ marginTop: isPinned ? '8px' : undefined }}
                      >
                        {/* Attachments */}
                        {message.attachments && (
                          <div className="mb-2 space-y-2">
                            {(() => {
                              const attachmentsArray = Array.isArray(message.attachments) ? message.attachments : message.attachments.url ? [message.attachments] : [];
                              return attachmentsArray.map((attachment: any, idx: number) => {
                                const isImage = message.contentType === 'image' || attachment.type?.startsWith('image/');
                                const isAudioAttach = message.contentType === 'audio' || attachment.type?.startsWith('audio/');
                                if (isAudioAttach && attachment.url) {
                                  return (
                                    <div key={idx} className="flex items-center gap-2">
                                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', isOwnMessage ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/40')}>
                                        <Volume2 className={cn('h-4 w-4', isOwnMessage ? 'text-white' : 'text-blue-600')} />
                                      </div>
                                      <audio controls src={attachment.url} className="h-8 w-36 rounded" style={{ filter: isOwnMessage ? 'invert(1)' : undefined }} />
                                    </div>
                                  );
                                }
                                if (isImage && attachment.url) {
                                  return (
                                    <div key={idx} className="rounded-lg overflow-hidden">
                                      <img src={attachment.url} alt={attachment.name || 'Image'} className="max-w-full h-auto max-h-64 object-contain rounded cursor-pointer" loading="lazy" onClick={() => window.open(attachment.url, '_blank')} />
                                    </div>
                                  );
                                } else if (attachment.url) {
                                  return (
                                    <a key={idx} href={attachment.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 p-2 rounded-lg hover:opacity-80 transition-opacity ${isOwnMessage ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                      <File className="h-4 w-4" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{attachment.name || 'File'}</p>
                                        {attachment.size && <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>}
                                      </div>
                                    </a>
                                  );
                                }
                                return null;
                              });
                            })()}
                          </div>
                        )}

                        {/* Text content */}
                        {message.content && message.contentType !== 'image' && message.contentType !== 'audio' && (
                          <p className={cn('text-sm break-words leading-relaxed', searchQuery && message.content.toLowerCase().includes(searchQuery.toLowerCase()) && 'bg-yellow-200/50 dark:bg-yellow-500/20 rounded px-0.5')}>
                            {searchQuery && message.content.toLowerCase().includes(searchQuery.toLowerCase())
                              ? (() => {
                                  const lower = message.content!.toLowerCase();
                                  const idx = lower.indexOf(searchQuery.toLowerCase());
                                  return (<>{message.content!.substring(0, idx)}<mark className="bg-yellow-300 dark:bg-yellow-600/50 rounded">{message.content!.substring(idx, idx + searchQuery.length)}</mark>{message.content!.substring(idx + searchQuery.length)}</>);
                                })()
                              : message.content}
                          </p>
                        )}

                        <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                          <span className={`text-[10px] ${isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.timestamp)}</span>
                          {isOwnMessage && (() => {
                            const readers = (readReceipts[message.id] || []).filter(uid => uid !== currentUser?.id);
                            if (readers.length > 0) {
                              return (
                                <span className="flex items-center gap-0.5 text-[9px] text-blue-200" title={`Seen by ${readers.length}`}>
                                  <CheckCheck className="h-3 w-3 text-blue-300" />
                                  <span>Seen</span>
                                </span>
                              );
                            }
                            return <CheckCheck className="h-3 w-3 text-blue-200/50" title="Delivered" />;
                          })()}
                        </div>

                        {/* Action buttons on hover */}
                        <div className={cn('absolute top-1 hidden group-hover/msg:flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-1.5 py-1 z-10', isOwnMessage ? 'right-full mr-2' : 'left-full ml-2')}>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                            onClick={(e) => { e.stopPropagation(); setEmojiPickerForMsg(emojiPickerForMsg === message.id ? null : message.id); }}
                            title="React"
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className={cn('h-6 w-6 text-gray-500 hover:text-amber-600', isPinned && 'text-amber-500')}
                            onClick={(e) => { e.stopPropagation(); pinMessage(message.id, message.content || 'Attachment'); }}
                            title={isPinned ? 'Unpin' : 'Pin message'}
                          >
                            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          </Button>
                        </div>

                        {/* Emoji picker */}
                        {emojiPickerForMsg === message.id && (
                          <div
                            className={cn('absolute z-20 flex gap-1 p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg', isOwnMessage ? 'right-0 top-full mt-1' : 'left-0 top-full mt-1')}
                            onClick={e => e.stopPropagation()}
                          >
                            {EMOJI_OPTIONS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className={cn('w-7 h-7 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors', msgReactions[emoji]?.myReaction && 'bg-blue-50 dark:bg-blue-900/30')}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reaction bubbles */}
                      {hasReactions && (
                        <div className={cn('flex flex-wrap gap-1 mt-1', isOwnMessage ? 'justify-end' : 'justify-start')}>
                          {Object.entries(msgReactions).map(([emoji, { count, myReaction }]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(message.id, emoji)}
                              className={cn('flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors', myReaction ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50')}
                            >
                              {emoji} {count > 1 && <span className="font-medium">{count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center mb-4">
                <MessageSquare className="h-7 w-7 text-blue-500" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">{searchQuery ? 'No messages match your search' : 'Start your conversation'}</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery ? `Try a different keyword` : activeChat.type === 'private' ? `Send a message to ${activeChat.name}` : `Say hello to ${activeChat.name}`}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* ── Typing indicator ── */}
      {currentChatTypingUsers.length > 0 && (
        <div className="px-5 py-2 bg-gray-50 dark:bg-gray-950 flex items-center gap-2 text-xs text-gray-500 animate-in fade-in-0 slide-in-from-bottom-2">
          <div className="flex space-x-1">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>{currentChatTypingUsers.length === 1 ? `${currentChatTypingUsers[0].name} is typing...` : `${currentChatTypingUsers.map(u => u.name).join(', ')} are typing...`}</span>
        </div>
      )}

      {/* ── File previews ── */}
      {selectedFiles.length > 0 && (
        <div className="px-4 py-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-sm">
                {file.type.startsWith('image/') ? (
                  <div className="relative">
                    <img src={URL.createObjectURL(file)} alt={file.name} className="w-10 h-10 object-cover rounded-lg" />
                    {uploadingFiles[`${file.name}_${file.size}_${index}`] && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"><Loader2 className="h-3.5 w-3.5 text-white animate-spin" /></div>
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center"><File className="h-4 w-4 text-gray-500" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-xs text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600" onClick={() => removeSelectedFile(index)} disabled={Object.values(uploadingFiles).some(v => v)} data-testid={`button-remove-file-${index}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Compose bar ── */}
      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        {recording ? (
          /* Recording UI */
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-2">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono font-semibold text-red-700 dark:text-red-400">{formatRecordingTime(recordingTime)}</span>
              <div className="flex gap-0.5 flex-1 items-center px-2">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="bg-red-400 dark:bg-red-500 rounded-full w-0.5" style={{ height: `${8 + Math.random() * 16}px`, opacity: 0.6 + Math.random() * 0.4 }} />
                ))}
              </div>
              <span className="text-xs text-red-500">Recording…</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-500" onClick={cancelRecording} title="Cancel recording">
              <X className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-9 w-9 bg-green-500 hover:bg-green-600 text-white rounded-xl" onClick={stopRecording} title="Send voice message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={handleFileSelect} className="hidden" id="chat-file-input" />
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors" onClick={() => fileInputRef.current?.click()} disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)} data-testid="button-attach">
              <Paperclip className="h-4 w-4" />
            </Button>
            {/* Voice message button */}
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-red-500 transition-colors" onClick={startRecording} disabled={isSendingMessage} data-testid="button-voice" title="Record voice message">
              <Mic className="h-4 w-4" />
            </Button>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={messageText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                className="resize-none min-h-[36px] max-h-[120px] py-2 pr-3 text-sm rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-900 transition-colors scrollbar-hide"
                disabled={isSendingMessage}
                data-testid="input-message"
              />
            </div>

            <Button
              size="icon"
              className={cn('h-9 w-9 shrink-0 rounded-xl transition-all', (messageText.trim() || selectedFiles.length > 0) ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400')}
              onClick={handleSendMessage}
              disabled={isSendingMessage || (!messageText.trim() && selectedFiles.length === 0) || Object.values(uploadingFiles).some(v => v)}
              data-testid="button-send"
            >
              {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
