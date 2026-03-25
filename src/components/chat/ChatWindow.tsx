
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/features/chat/context/ChatContextSupabase';
import { useCommunication } from '@/features/calls/context/CommunicationContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns';
import { useUser } from '@/features/user/context/UserContext';
import { getUserStatus } from '@/utils/userStatusUtils';
import { User } from '@/types/user';
import { 
  Send, 
  ArrowLeft, 
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
import { useToast } from '@/shared/hooks/use-toast';
import { uploadChatAttachment, getContentTypeFromFile, formatFileSize, ChatAttachment } from '@/utils/chatUpload';

interface ChatWindowProps {
  hideHeader?: boolean;
}

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
      return { text: 'Online', color: 'text-green-600 dark:text-green-400', dotColor: 'bg-green-500' };
    }
    const lastSeenTime = targetUser.location?.lastUpdated || targetUser.lastActive;
    if (lastSeenTime) {
      try {
        const lastSeenDate = parseISO(lastSeenTime);
        return {
          text: `Last seen ${formatDistanceToNow(lastSeenDate, { addSuffix: false })} ago`,
          color: 'text-gray-500 dark:text-gray-400',
          dotColor: 'bg-gray-400'
        };
      } catch {
        return { text: status.label, color: 'text-gray-500 dark:text-gray-400', dotColor: 'bg-gray-400' };
      }
    }
    return { text: status.label, color: 'text-gray-500 dark:text-gray-400', dotColor: 'bg-gray-400' };
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

  // Send typing indicator when user types (throttled to once per second)
  useEffect(() => {
    if (messageText.length > 0 && activeChat) {
      const now = Date.now();
      if (now - lastTypingSent.current > 1000) {
        sendTypingIndicator(activeChat.id);
        lastTypingSent.current = now;
      }
    }
  }, [messageText, activeChat, sendTypingIndicator]);
  
  // Get typing users for current chat
  const currentChatTypingUsers = activeChat ? typingUsers[activeChat.id] || [] : [];
  
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
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-gray-950" data-testid="no-chat-selected">
        <div className="max-w-sm">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center mx-auto mb-5">
            <MessageSquare className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Select a conversation</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Choose a chat from the sidebar or start a new conversation with your team
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900" data-testid="chat-window">
      {!hideHeader && (
      <div className="px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            onClick={() => setActiveChat(null)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="relative cursor-pointer">
            {activeChat.type === 'private' ? (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-sm">
                  {activeChat.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <Users className="h-4 w-4" />
                </AvatarFallback>
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
                : (() => {
                    const status = getTargetUserStatus();
                    return <span className={`${status?.color || 'text-gray-500'}`}>{status?.text || 'Offline'}</span>;
                  })()
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            onClick={() => handleCall(false)}
            disabled={!targetUser}
            data-testid="button-call"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            onClick={() => handleCall(true)}
            disabled={!targetUser}
            data-testid="button-video"
          >
            <Video className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            onClick={() => window.location.reload()}
            data-testid="button-refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
      
      <ScrollArea className="flex-1 bg-gray-50 dark:bg-gray-950">
        <div className="px-4 py-6 space-y-3 pb-4">
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
                  <div className={`flex items-end gap-2 max-w-[75%] ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <Avatar className={`h-7 w-7 shrink-0 ${showAvatar ? 'visible' : 'invisible'}`}>
                        <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                          {activeChat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div
                      className={`relative group px-4 py-2.5 transition-all ${
                        isOwnMessage
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm shadow-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700'
                      }`}
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
                                      isOwnMessage ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
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
                        <p className="text-sm break-words leading-relaxed">{message.content}</p>
                      )}

                      <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                        <span className={`text-[10px] ${isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                          {formatMessageTime(message.timestamp)}
                        </span>
                        {isOwnMessage && (
                          <CheckCheck className="h-3 w-3 text-blue-200" />
                        )}
                      </div>
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
              <p className="font-semibold text-gray-900 dark:text-white">Start your conversation</p>
              <p className="text-sm text-gray-500 mt-1">
                {activeChat.type === 'private'
                  ? `Send a message to ${activeChat.name}`
                  : `Say hello to ${activeChat.name}`}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {currentChatTypingUsers.length > 0 && (
        <div className="px-5 py-2 bg-gray-50 dark:bg-gray-950 flex items-center gap-2 text-xs text-gray-500 animate-in fade-in-0 slide-in-from-bottom-2">
          <div className="flex space-x-1">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>
            {currentChatTypingUsers.length === 1
              ? `${currentChatTypingUsers[0].name} is typing...`
              : `${currentChatTypingUsers.map(u => u.name).join(', ')} are typing...`}
          </span>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="px-4 py-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-sm"
              >
                {file.type.startsWith('image/') ? (
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-10 h-10 object-cover rounded-lg"
                    />
                    {uploadingFiles[`${file.name}_${file.size}_${index}`] && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <File className="h-4 w-4 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-xs text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
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

      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
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
            className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
            data-testid="button-attach"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              className="resize-none min-h-[42px] max-h-[120px] py-2.5 pl-4 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder:text-gray-400"
              value={messageText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
              data-testid="input-message"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1.5 bottom-1 h-7 w-7 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              data-testid="button-emoji"
            >
              <Smile className="h-4 w-4 text-gray-400" />
            </Button>
          </div>

          <Button
            size="icon"
            className={`h-9 w-9 shrink-0 rounded-lg transition-all ${
              messageText.trim() || selectedFiles.length > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            }`}
            onClick={handleSendMessage}
            disabled={(!messageText.trim() && selectedFiles.length === 0) || isSendingMessage || Object.values(uploadingFiles).some(v => v)}
            data-testid="button-send"
          >
            {isSendingMessage || Object.values(uploadingFiles).some(v => v) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

    </div>
  );
};

export default ChatWindow;
