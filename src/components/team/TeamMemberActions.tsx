import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MessageSquare, MapPin, MoreVertical } from 'lucide-react';
import { User } from '@/types/user';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { SmartSiteAssignmentDialog } from './SmartSiteAssignmentDialog';
import { useToast } from '@/hooks/use-toast';

interface TeamMemberActionsProps {
  user: User;
  variant?: 'dropdown' | 'buttons';
  size?: 'sm' | 'default';
  onActionComplete?: () => void;
}

export const TeamMemberActions: React.FC<TeamMemberActionsProps> = ({ 
  user, 
  variant = 'buttons',
  size = 'sm',
  onActionComplete 
}) => {
  const navigate = useNavigate();
  const { createChat } = useChat();
  const { toast } = useToast();
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const handleSendMessage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCreatingChat(true);
    
    try {
      const chat = await createChat([user.id], undefined, 'private');
      if (chat) {
        navigate('/chat');
        toast({
          title: 'Chat Opened',
          description: `Opening conversation with ${user.name}`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to open chat. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to open chat. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleAssignSite = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAssignmentDialog(true);
  };

  const handleAssignmentComplete = () => {
    setShowAssignmentDialog(false);
    onActionComplete?.();
    toast({
      title: 'Site Visit Assigned',
      description: `Site visit successfully assigned to ${user.name}`,
      variant: 'success',
    });
  };

  if (variant === 'dropdown') {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              data-testid={`button-actions-${user.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem 
              onClick={handleSendMessage}
              disabled={isCreatingChat}
              data-testid={`action-message-${user.id}`}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Send Message
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleAssignSite}
              data-testid={`action-assign-${user.id}`}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Assign Site Visit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SmartSiteAssignmentDialog
          user={user}
          isOpen={showAssignmentDialog}
          onClose={() => setShowAssignmentDialog(false)}
          onOpenChange={setShowAssignmentDialog}
          onAssignmentComplete={handleAssignmentComplete}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size={size}
        onClick={handleSendMessage}
        disabled={isCreatingChat}
        className="gap-1"
        data-testid={`button-message-${user.id}`}
      >
        <MessageSquare className="h-3 w-3" />
        <span className="hidden sm:inline">Message</span>
      </Button>
      <Button
        variant="outline"
        size={size}
        onClick={handleAssignSite}
        className="gap-1"
        data-testid={`button-assign-${user.id}`}
      >
        <MapPin className="h-3 w-3" />
        <span className="hidden sm:inline">Assign</span>
      </Button>

      <SmartSiteAssignmentDialog
        user={user}
        isOpen={showAssignmentDialog}
        onClose={() => setShowAssignmentDialog(false)}
        onOpenChange={setShowAssignmentDialog}
        onAssignmentComplete={handleAssignmentComplete}
      />
    </div>
  );
};
