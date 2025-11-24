
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
import { Send, Info, ArrowLeft, MoreVertical, Paperclip, Users, X, Image as ImageIcon, File, Loader2 } from 'lucide-react';
import { ChatMessage } from '@/types';
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
  
  // Get messages for the active chat
  const chatMessages = activeChat ? getChatMessages(activeChat.id) || [] : [];
  
  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cleanup object URLs when component unmounts or files change
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

    // Validate files
    const validFiles: File[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024; // 10MB for images, 25MB for files
      
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

    // Reset input
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
      // If there are files, upload them first
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
            return; // Don't send message if upload fails
          } finally {
            setUploadingFiles(prev => {
              const updated = { ...prev };
              delete updated[fileId];
              return updated;
            });
          }
        }

        // Send message with attachments
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
            messageText || (contentType === 'image' ? '📷 Image' : '📎 File'),
            contentType,
            attachmentsData,
            { fileCount: attachments.length }
          );
        }
      } else {
        // Send text message only
        await sendMessage(activeChat.id, messageText, 'text');
      }

      // Clear form
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
  
  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // If no chat is selected
  if (!activeChat) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Select a conversation</h2>
          <p className="text-muted-foreground mb-4">
            Choose a chat from the sidebar or start a new conversation to begin messaging
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="py-3 px-4 flex items-center justify-between border-b bg-white">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setActiveChat(null)}
          >
            <ArrowLeft size={18} />
          </Button>
          
          <div className="flex items-center gap-3">
            {activeChat.type === 'private' ? (
              <Avatar className="h-9 w-9">
                <div className="bg-primary/20 w-full h-full rounded-full flex items-center justify-center text-primary font-medium">
                  {activeChat.name.charAt(0).toUpperCase()}
                </div>
              </Avatar>
            ) : (
              <Avatar className="h-9 w-9">
                <div className="bg-secondary/20 w-full h-full rounded-full flex items-center justify-center">
                  <Users size={16} className="text-secondary" />
                </div>
              </Avatar>
            )}
            
            <div>
              <h3 className="font-medium leading-tight">{activeChat.name}</h3>
              <p className="text-xs text-muted-foreground">
                {activeChat.type === 'group' 
                  ? `${activeChat.participants.length} participants` 
                  : 'Online'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <Info size={18} />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical size={18} />
          </Button>
        </div>
      </div>
      
      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 pb-4">
          {chatMessages.length > 0 ? (
            chatMessages.map((message) => {
              const isOwnMessage = message.senderId === currentUser?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      isOwnMessage
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-100 text-foreground'
                    }`}
                  >
                    {!isOwnMessage && (
                      <p className="text-xs font-medium mb-1">
                        {message.senderId === 'usr1' ? 'You' : activeChat.name}
                      </p>
                    )}
                    
                    {/* Display attachments (images/files) */}
                    {message.attachments && (
                      <div className="mb-2 space-y-2">
                        {(() => {
                          // Handle both array and object formats
                          const attachmentsArray = Array.isArray(message.attachments) 
                            ? message.attachments 
                            : message.attachments.url 
                              ? [message.attachments] 
                              : [];
                          
                          return attachmentsArray.map((attachment: any, idx: number) => {
                            const isImage = message.contentType === 'image' || attachment.type?.startsWith('image/');
                            
                            if (isImage && attachment.url) {
                              return (
                                <div key={idx} className="rounded-lg overflow-hidden max-w-full">
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
                                  className={`flex items-center gap-2 p-2 rounded hover:opacity-80 transition-opacity ${
                                    isOwnMessage 
                                      ? 'bg-white/20' 
                                      : 'bg-black/10'
                                  }`}
                                >
                                  <File size={16} />
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
                    
                    {/* Display text content */}
                    {message.content && (
                      <p className="text-sm break-words">{message.content}</p>
                    )}
                    
                    <p className="text-xs mt-1 opacity-70 text-right">
                      {formatDistanceToNow(new Date(message.timestamp), {
                        addSuffix: true,
                        includeSeconds: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Users size={24} className="text-primary" />
              </div>
              <p className="font-medium">Start your conversation</p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeChat.type === 'private'
                  ? `Send your first message to ${activeChat.name}`
                  : `Send your first message to the ${activeChat.name} group`}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t border-b">
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-white border rounded-lg p-2 text-sm"
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
                  <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                    <File size={20} className="text-gray-600" />
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
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message input */}
      <div className="p-3 bg-white border-t">
        <div className="flex gap-2">
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
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
          >
            <Paperclip size={18} />
          </Button>
          
          <div className="flex-1 flex items-end">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              className="resize-none min-h-[40px] max-h-[120px] py-2"
              value={messageText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isSendingMessage || Object.values(uploadingFiles).some(v => v)}
            />
          </div>
          
          <Button 
            size="icon" 
            className="h-10 w-10"
            onClick={handleSendMessage}
            disabled={(!messageText.trim() && selectedFiles.length === 0) || isSendingMessage || Object.values(uploadingFiles).some(v => v)}
          >
            {isSendingMessage || Object.values(uploadingFiles).some(v => v) ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
