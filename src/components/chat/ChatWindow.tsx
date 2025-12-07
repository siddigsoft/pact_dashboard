
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
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
  MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadChatAttachment, getContentTypeFromFile, formatFileSize, ChatAttachment } from '@/utils/chatUpload';

const ChatWindow: React.FC = () => {
  const { activeChat, getChatMessages, sendMessage, setActiveChat, isSendingMessage } = useChat();
  const [messageText, setMessageText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const { currentUser } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatMessages = activeChat ? getChatMessages(activeChat.id) || [] : [];
  
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
      <div className="h-full flex flex-col items-center justify-center p-6 text-center" data-testid="no-chat-selected">
        <div className="bg-card dark:bg-gray-800 p-8 rounded-2xl shadow-sm max-w-sm">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Select a conversation</h2>
          <p className="text-sm text-muted-foreground">
            Choose a chat from the sidebar or start a new conversation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="chat-window">
      <div className="py-2.5 px-4 flex items-center justify-between border-b bg-card dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8"
            onClick={() => setActiveChat(null)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          <div className="relative">
            {activeChat.type === 'private' ? (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium">
                  {activeChat.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
            )}
            {activeChat.type === 'private' && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
            )}
          </div>
          
          <div>
            <h3 className="font-medium text-sm leading-tight" data-testid="text-chat-name">{activeChat.name}</h3>
            <p className="text-xs text-muted-foreground">
              {activeChat.type === 'group' 
                ? `${activeChat.participants.length} participants` 
                : (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Online
                  </span>
                )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-call">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-video">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-more">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3 pb-4">
          {chatMessages.length > 0 ? (
            chatMessages.map((message) => {
              const isOwnMessage = message.senderId === currentUser?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${message.id}`}
                >
                  <div className={`flex items-end gap-2 max-w-[75%] ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-gradient-to-br from-gray-400 to-gray-500 text-white text-xs">
                          {activeChat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div
                      className={`rounded-2xl px-3.5 py-2 ${
                        isOwnMessage
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-card dark:bg-gray-800 text-foreground rounded-bl-md border'
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

      <div className="p-3 bg-card dark:bg-gray-900 border-t">
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
            className="h-9 w-9 shrink-0"
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
              className="resize-none min-h-[36px] max-h-[120px] py-2 pr-10 text-sm bg-muted/50 dark:bg-gray-800 border-0"
              value={messageText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
              data-testid="input-message"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 bottom-1 h-7 w-7"
              data-testid="button-emoji"
            >
              <Smile className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          
          <Button 
            size="icon" 
            className="h-9 w-9 shrink-0"
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
