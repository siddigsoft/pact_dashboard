
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
import { getUserStatus } from '@/utils/userStatusUtils';
import { User } from '@/types/user';
import { 
  Send, 
  ArrowLeft, 
  MoreVertical, 
  Paperclip, 
  Users, 
  X, 
  File, 
  Loader2,
  Phone,
  Video,
  Smile,
  Check,
  CheckCheck,
  MessageSquare,
  RotateCcw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadChatAttachment, getContentTypeFromFile, formatFileSize, ChatAttachment } from '@/utils/chatUpload';

const ChatWindow: React.FC = () => {
  const navigate = useNavigate();
  const { activeChat, getChatMessages, sendMessage, setActiveChat, isSendingMessage } = useChat();
  const { initiateCall } = useCommunication();
  const [messageText, setMessageText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [isTyping, setIsTyping] = useState(false);
  const { currentUser, users } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatMessages = activeChat ? getChatMessages(activeChat.id) || [] : [];

  // Get the target user for private chats
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
    if (status.type === 'online') {
      return { text: 'Online', color: 'text-green-400', dotColor: 'bg-green-500' };
    }
    const lastSeenTime = targetUser.location?.lastUpdated || targetUser.lastActive;
    if (lastSeenTime) {
      try {
        const lastSeenDate = parseISO(lastSeenTime);
        return { 
          text: `Last seen ${formatDistanceToNow(lastSeenDate, { addSuffix: false })} ago`,
          color: 'text-white/60',
          dotColor: 'bg-gray-400'
        };
      } catch {
        return { text: status.label, color: 'text-white/60', dotColor: 'bg-gray-400' };
      }
    }
    return { text: status.label, color: 'text-white/60', dotColor: 'bg-gray-400' };
  };

  // Handle call initiation
  const handleCall = (isVideo: boolean = false) => {
    if (!targetUser) {
      toast({
        title: 'Cannot call',
        description: activeChat?.type === 'group' ? 'Group calls are not supported yet' : 'User not found',
        variant: 'destructive',
      });
      return;
    }
    
    // Pass the full user object to initiateCall
    initiateCall(targetUser);
    
    // Navigate to calls page to see the call interface
    navigate('/calls');
  };

  // Simulate typing indicator
  useEffect(() => {
    if (messageText.length > 0) {
      setIsTyping(true);
      const timer = setTimeout(() => setIsTyping(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [messageText]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach(file => {
        const url = URL.createObjectURL(file);
        URL.revokeObjectURL(url);
      });
    };
  }, [selectedFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
      
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds the ${isImage ? '10MB' : '25MB'} limit`,
          variant: 'destructive',
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

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
            console.error('Error uploading file:', error);
            toast({
              title: 'Upload failed',
              description: `Failed to upload ${file.name}: ${error.message}`,
              variant: 'destructive',
            });
            setUploadingFiles(prev => {
              const updated = { ...prev };
              delete updated[fileId];
              return updated;
            });
            return;
          } finally {
            setUploadingFiles(prev => {
              const updated = { ...prev };
              delete updated[fileId];
              return updated;
            });
          }
        }

        if (attachments.length > 0) {
          const contentType = getContentTypeFromFile(selectedFiles[0]);
          const attachmentsData = attachments.map(att => ({
            url: att.url,
            name: att.name,
            type: att.type,
            size: att.size,
          }));

          await sendMessage(
            activeChat.id,
            messageText || (contentType === 'image' ? 'Photo' : 'File'),
            contentType,
            attachmentsData,
            { fileCount: attachments.length }
          );
        }
      } else {
        await sendMessage(activeChat.id, messageText, 'text');
      }

      setMessageText('');
      setSelectedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Failed to send',
        description: error.message || 'An error occurred while sending the message',
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday ' + format(date, 'HH:mm');
    }
    return format(date, 'MMM d, HH:mm');
  };

  if (!activeChat) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-background via-background to-muted/20" data-testid="no-chat-selected">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-3xl" />
          <div className="relative bg-card dark:bg-gray-800/80 backdrop-blur-sm p-10 rounded-3xl border border-border/50 shadow-xl max-w-sm">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
              <MessageSquare className="h-10 w-10 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-3 tracking-tight">Select a conversation</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Choose a chat from the sidebar or start a new conversation with your team
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black" data-testid="chat-window">
      <div className="px-4 py-3 flex items-center justify-between bg-black sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setActiveChat(null)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          <div className="relative group cursor-pointer">
            {activeChat.type === 'private' ? (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-white text-black font-bold text-sm">
                  {activeChat.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-white text-black">
                  <Users className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            )}
            {activeChat.type === 'private' && (() => {
              const status = getTargetUserStatus();
              return <div className={`absolute bottom-0 right-0 w-3 h-3 ${status?.dotColor || 'bg-gray-400'} rounded-full border-2 border-black`} />;
            })()}
          </div>
          
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-white leading-tight truncate" data-testid="text-chat-name">{activeChat.name}</h3>
            <p className="text-xs mt-0.5">
              {activeChat.type === 'group' 
                ? <span className="text-white/60">{activeChat.participants.length} participants</span>
                : (() => {
                    const status = getTargetUserStatus();
                    return <span className={`font-medium ${status?.color || 'text-white/60'}`}>{status?.text || 'Offline'}</span>;
                  })()
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Button 
            variant="ghost"
            size="icon"
            className="rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => handleCall(false)}
            disabled={!targetUser}
            data-testid="button-call"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost"
            size="icon"
            className="rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => handleCall(true)}
            disabled={!targetUser}
            data-testid="button-video"
          >
            <Video className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost"
            size="icon"
            className="rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => window.location.reload()}
            data-testid="button-refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost"
            size="icon"
            className="rounded-full bg-white/10 hover:bg-white/20 text-white"
            data-testid="button-more"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 px-4 py-6">
        <div className="space-y-4 pb-4">
          {chatMessages.length > 0 ? (
            chatMessages.map((message, index) => {
              const isOwnMessage = message.senderId === currentUser?.id;
              const showAvatar = !isOwnMessage && (index === 0 || chatMessages[index - 1]?.senderId === currentUser?.id);
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
                  data-testid={`message-${message.id}`}
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
                >
                  <div className={`flex items-end gap-2.5 max-w-[80%] ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <Avatar className={`h-8 w-8 shrink-0 ${showAvatar ? 'visible' : 'invisible'}`}>
                        <AvatarFallback className="bg-gradient-to-br from-gray-400 to-gray-500 text-white text-xs font-medium">
                          {activeChat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div
                      className={`relative group ${
                        isOwnMessage
                          ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-2xl rounded-br-sm shadow-md shadow-primary/10'
                          : 'bg-card dark:bg-gray-800/90 text-foreground rounded-2xl rounded-bl-sm border border-border/50 shadow-sm'
                      } px-4 py-2.5 transition-all hover:shadow-lg`}
                    >
                      {message.attachments && (
                        <div className="mb-2 space-y-2">
                          {(() => {
                            const attachmentsArray = Array.isArray(message.attachments) 
                              ? message.attachments 
                              : message.attachments.url 
                                ? [message.attachments] 
                                : [];
                            
                            return attachmentsArray.map((attachment: any, idx: number) => {
                              const isImage = message.contentType === 'image' || attachment.type?.startsWith('image/');
                              
                              if (isImage && attachment.url) {
                                return (
                                  <div key={idx} className="rounded-lg overflow-hidden">
                                    <img
                                      src={attachment.url}
                                      alt={attachment.name || 'Image'}
                                      className="max-w-full h-auto max-h-64 object-contain rounded cursor-pointer"
                                      loading="lazy"
                                      onClick={() => window.open(attachment.url, '_blank')}
                                    />
                                  </div>
                                );
                              } else if (attachment.url) {
                                return (
                                  <a
                                    key={idx}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 p-2 rounded-lg hover:opacity-80 transition-opacity ${
                                      isOwnMessage ? 'bg-white/20' : 'bg-muted'
                                    }`}
                                  >
                                    <File className="h-4 w-4" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{attachment.name || 'File'}</p>
                                      {attachment.size && (
                                        <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
                                      )}
                                    </div>
                                  </a>
                                );
                              }
                              return null;
                            });
                          })()}
                        </div>
                      )}
                      
                      {message.content && message.contentType !== 'image' && (
                        <p className="text-sm break-words">{message.content}</p>
                      )}
                      
                      <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                        <span className="text-[10px] opacity-60">
                          {formatMessageTime(message.timestamp)}
                        </span>
                        {isOwnMessage && (
                          <CheckCheck className="h-3 w-3 opacity-60" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-7 w-7 text-primary" />
              </div>
              <p className="font-medium">Start your conversation</p>
              <p className="text-sm text-muted-foreground mt-1 text-center">
                {activeChat.type === 'private'
                  ? `Send a message to ${activeChat.name}`
                  : `Say hello to ${activeChat.name}`}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {selectedFiles.length > 0 && (
        <div className="px-3 py-2 bg-muted/50 dark:bg-gray-800 border-t">
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-card dark:bg-gray-700 border rounded-lg p-2 text-sm"
              >
                {file.type.startsWith('image/') ? (
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                    {uploadingFiles[`${file.name}_${file.size}_${index}`] && (
                      <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <File className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-xs">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeSelectedFile(index)}
                  disabled={Object.values(uploadingFiles).some(v => v)}
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 bg-card/95 dark:bg-gray-900/95 backdrop-blur-md border-t shadow-sm">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={handleFileSelect}
            className="hidden"
            id="chat-file-input"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full hover:bg-primary/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
            data-testid="button-attach"
          >
            <Paperclip className="h-5 w-5 text-muted-foreground" />
          </Button>
          
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              className="resize-none min-h-[44px] max-h-[120px] py-3 pl-4 pr-12 text-sm bg-muted/60 dark:bg-gray-800/80 border border-border/30 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              value={messageText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
              data-testid="input-message"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 bottom-1.5 h-8 w-8 rounded-full hover:bg-primary/10"
              data-testid="button-emoji"
            >
              <Smile className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
          
          <Button 
            size="icon" 
            className={`h-10 w-10 shrink-0 rounded-full shadow-md transition-all ${
              messageText.trim() || selectedFiles.length > 0
                ? 'bg-gradient-to-br from-primary to-primary/90 hover:shadow-lg hover:scale-105'
                : ''
            }`}
            onClick={handleSendMessage}
            disabled={(!messageText.trim() && selectedFiles.length === 0) || isSendingMessage || Object.values(uploadingFiles).some(v => v)}
            data-testid="button-send"
          >
            {isSendingMessage || Object.values(uploadingFiles).some(v => v) ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
