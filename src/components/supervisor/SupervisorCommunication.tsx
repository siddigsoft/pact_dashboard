import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Send, 
  Users, 
  AlertTriangle, 
  Bell, 
  MessageSquare,
  Loader2,
  CheckCircle,
  Search
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { supabase } from '@/integrations/supabase/client';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  hubId?: string;
  email?: string;
  isOnline?: boolean;
}

interface SupervisorCommunicationProps {
  hubId?: string;
  className?: string;
}

type MessagePriority = 'normal' | 'urgent';
type RecipientType = 'all' | 'role' | 'individual';

export function SupervisorCommunication({ hubId, className }: SupervisorCommunicationProps) {
  const { currentUser, users } = useUser();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<MessagePriority>('normal');
  const [recipientType, setRecipientType] = useState<RecipientType>('all');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  const supervisorHubId = hubId || currentUser?.hubId;

  useEffect(() => {
    if (isOpen) {
      loadTeamMembers();
    }
  }, [isOpen, supervisorHubId]);

  const loadTeamMembers = async () => {
    if (!supervisorHubId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, hub_id, email, availability')
        .eq('hub_id', supervisorHubId)
        .neq('id', currentUser?.id || '');

      if (error) throw error;

      const members: TeamMember[] = (data || []).map(p => ({
        id: p.id,
        name: p.full_name || 'Unknown',
        role: p.role || 'user',
        hubId: p.hub_id,
        email: p.email,
        isOnline: p.availability === 'online',
      }));

      setTeamMembers(members);
    } catch (err) {
      console.error('Failed to load team members:', err);
      toast({
        title: 'Error',
        description: 'Failed to load team members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getRecipientIds = (): string[] => {
    switch (recipientType) {
      case 'all':
        return teamMembers.map(m => m.id);
      case 'role':
        return teamMembers.filter(m => m.role === selectedRole).map(m => m.id);
      case 'individual':
        return Array.from(selectedMembers);
      default:
        return [];
    }
  };

  const getRecipientCount = (): number => {
    return getRecipientIds().length;
  };

  const handleSendMessage = async () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please enter both a title and message',
        variant: 'destructive',
      });
      return;
    }

    const recipientIds = getRecipientIds();
    if (recipientIds.length === 0) {
      toast({
        title: 'No Recipients',
        description: 'Please select at least one recipient',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const successCount = await NotificationTriggerService.sendBulk(recipientIds, {
        title: priority === 'urgent' ? `[URGENT] ${title}` : title,
        message,
        type: priority === 'urgent' ? 'warning' : 'info',
        category: 'team',
        priority: priority === 'urgent' ? 'urgent' : 'medium',
        sendEmail: priority === 'urgent',
      });

      toast({
        title: 'Message Sent',
        description: `Successfully sent to ${successCount} team member${successCount !== 1 ? 's' : ''}`,
      });

      setTitle('');
      setMessage('');
      setPriority('normal');
      setRecipientType('all');
      setSelectedMembers(new Set());
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to send message:', err);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllMembers = () => {
    setSelectedMembers(new Set(teamMembers.map(m => m.id)));
  };

  const clearSelection = () => {
    setSelectedMembers(new Set());
  };

  const uniqueRoles = Array.from(new Set(teamMembers.map(m => m.role)));

  const filteredMembers = searchQuery
    ? teamMembers.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.role.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : teamMembers;

  const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
      coordinator: 'Coordinator',
      data_collector: 'Data Collector',
      enumerator: 'Enumerator',
      fom: 'Field Operations Manager',
      supervisor: 'Supervisor',
      admin: 'Admin',
    };
    return labels[role] || role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
  };

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className={className}
        data-testid="button-supervisor-communication"
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Message Team
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Message to Team
            </DialogTitle>
            <DialogDescription>
              Communicate with your hub team members
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as MessagePriority)}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Normal
                      </div>
                    </SelectItem>
                    <SelectItem value="urgent">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Urgent (sends email)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipients">Recipients</Label>
                <Select value={recipientType} onValueChange={(v) => setRecipientType(v as RecipientType)}>
                  <SelectTrigger data-testid="select-recipient-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        All Team Members ({teamMembers.length})
                      </div>
                    </SelectItem>
                    <SelectItem value="role">By Role</SelectItem>
                    <SelectItem value="individual">Select Individuals</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recipientType === 'role' && (
                <div className="space-y-2">
                  <Label>Select Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueRoles.map(role => (
                        <SelectItem key={role} value={role}>
                          {getRoleLabel(role)} ({teamMembers.filter(m => m.role === role).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {recipientType === 'individual' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Team Members</Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={selectAllMembers}>
                        Select All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-members"
                    />
                  </div>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    <div className="space-y-2">
                      {filteredMembers.map(member => (
                        <div 
                          key={member.id}
                          className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                        >
                          <Checkbox
                            id={`member-${member.id}`}
                            checked={selectedMembers.has(member.id)}
                            onCheckedChange={() => toggleMember(member.id)}
                            data-testid={`checkbox-member-${member.id}`}
                          />
                          <label 
                            htmlFor={`member-${member.id}`}
                            className="flex-1 flex items-center justify-between cursor-pointer"
                          >
                            <span className="text-sm">{member.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {getRoleLabel(member.role)}
                            </Badge>
                          </label>
                        </div>
                      ))}
                      {filteredMembers.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No team members found
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">
                    {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Message title..."
                  data-testid="input-message-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={4}
                  data-testid="input-message-body"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendMessage} 
              disabled={sending || loading || getRecipientCount() === 0}
              data-testid="button-send-message"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send to {getRecipientCount()} Member{getRecipientCount() !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SupervisorCommunication;
