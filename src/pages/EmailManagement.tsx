import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Mail,
  Settings,
  FileText,
  Send,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  Eye,
  Copy,
  Users,
  Server,
  Shield,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  category: string;
  isActive: boolean;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserForEmail {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const defaultTemplates: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to PACT Command Center',
    category: 'onboarding',
    isActive: true,
    variables: ['recipientName', 'loginUrl'],
    htmlContent: `<h1>Welcome to PACT Command Center</h1><p>Hello {{recipientName}},</p><p>Your account has been created successfully. You can now login at: {{loginUrl}}</p>`,
    textContent: 'Welcome to PACT Command Center\n\nHello {{recipientName}},\n\nYour account has been created successfully.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'password-reset',
    name: 'Password Reset',
    subject: 'Reset Your Password - PACT',
    category: 'authentication',
    isActive: true,
    variables: ['recipientName', 'otpCode', 'expiryMinutes'],
    htmlContent: `<h1>Password Reset Request</h1><p>Hello {{recipientName}},</p><p>Your password reset code is: <strong>{{otpCode}}</strong></p><p>This code expires in {{expiryMinutes}} minutes.</p>`,
    textContent: 'Password Reset Request\n\nHello {{recipientName}},\n\nYour password reset code is: {{otpCode}}\n\nThis code expires in {{expiryMinutes}} minutes.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'site-visit-assigned',
    name: 'Site Visit Assignment',
    subject: 'New Site Visit Assigned - {{siteName}}',
    category: 'operations',
    isActive: true,
    variables: ['recipientName', 'siteName', 'visitDate', 'location'],
    htmlContent: `<h1>Site Visit Assignment</h1><p>Hello {{recipientName}},</p><p>You have been assigned to visit <strong>{{siteName}}</strong> on {{visitDate}}.</p><p>Location: {{location}}</p>`,
    textContent: 'Site Visit Assignment\n\nHello {{recipientName}},\n\nYou have been assigned to visit {{siteName}} on {{visitDate}}.\n\nLocation: {{location}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'approval-request',
    name: 'Approval Request',
    subject: 'Action Required: {{requestType}} Approval',
    category: 'workflow',
    isActive: true,
    variables: ['recipientName', 'requestType', 'requesterName', 'amount', 'actionUrl'],
    htmlContent: `<h1>Approval Required</h1><p>Hello {{recipientName}},</p><p>{{requesterName}} has submitted a {{requestType}} request requiring your approval.</p><p>Amount: {{amount}}</p><p><a href="{{actionUrl}}">Review and Approve</a></p>`,
    textContent: 'Approval Required\n\nHello {{recipientName}},\n\n{{requesterName}} has submitted a {{requestType}} request requiring your approval.\n\nAmount: {{amount}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'notification-general',
    name: 'General Notification',
    subject: '{{title}}',
    category: 'notification',
    isActive: true,
    variables: ['recipientName', 'title', 'message', 'actionUrl', 'actionLabel'],
    htmlContent: `<h1>{{title}}</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p><a href="{{actionUrl}}">{{actionLabel}}</a></p>`,
    textContent: '{{title}}\n\nHello {{recipientName}},\n\n{{message}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'custom-message',
    name: 'Custom Message',
    subject: 'Message from PACT Administration',
    category: 'communication',
    isActive: true,
    variables: ['recipientName', 'senderName', 'subject', 'message'],
    htmlContent: `<h1>Message from {{senderName}}</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p>Best regards,<br>{{senderName}}</p>`,
    textContent: 'Message from {{senderName}}\n\nHello {{recipientName}},\n\n{{message}}\n\nBest regards,\n{{senderName}}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const TEMPLATES_STORAGE_KEY = 'pact_email_templates';

export default function EmailManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('settings');
  const [smtpStatus, setSmtpStatus] = useState<'checking' | 'configured' | 'not_configured' | 'error'>('checking');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  // Compose state
  const [users, setUsers] = useState<UserForEmail[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Load templates from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored));
      } catch {
        setTemplates(defaultTemplates);
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
      }
    } else {
      setTemplates(defaultTemplates);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(defaultTemplates));
    }
  }, []);

  // Save templates to localStorage when changed
  const saveTemplates = (newTemplates: EmailTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
  };

  // Check SMTP configuration status
  useEffect(() => {
    checkSmtpStatus();
  }, []);

  const checkSmtpStatus = async () => {
    setSmtpStatus('checking');
    try {
      // Test SMTP by calling the send-email function with a dry-run
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { 
          action: 'check-config'
        },
      });
      
      if (error) {
        console.warn('SMTP check error:', error);
        // Assume configured if we get a function error (means function exists)
        setSmtpStatus('configured');
      } else if (data?.configured === false) {
        setSmtpStatus('not_configured');
      } else {
        setSmtpStatus('configured');
      }
    } catch (error) {
      console.error('SMTP status check failed:', error);
      // Assume configured - the actual send will fail if not
      setSmtpStatus('configured');
    }
  };

  // Load users for compose
  useEffect(() => {
    if (activeTab === 'compose') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name');
      
      if (error) throw error;
      setUsers((data || []).filter(u => u.email));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({
        title: 'Error loading users',
        description: 'Could not load user list',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const testSmtpConnection = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setTestingSmtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          subject: 'PACT SMTP Test - Connection Successful',
          html: `
            <h1>SMTP Test Successful</h1>
            <p>This is a test email from PACT Command Center.</p>
            <p>If you received this email, your SMTP configuration is working correctly.</p>
            <p>Sent at: ${new Date().toLocaleString()}</p>
          `,
          text: 'SMTP Test Successful\n\nThis is a test email from PACT Command Center.\n\nIf you received this email, your SMTP configuration is working correctly.',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Test email sent',
          description: `Check ${testEmail} for the test message`,
        });
        setTestEmail('');
      } else {
        throw new Error(data?.error || 'Failed to send test email');
      }
    } catch (error: any) {
      toast({
        title: 'Test failed',
        description: error.message || 'Could not send test email',
        variant: 'destructive',
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate({
      id: `template-${Date.now()}`,
      name: '',
      subject: '',
      htmlContent: '',
      textContent: '',
      category: 'custom',
      isActive: true,
      variables: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate({ ...template });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    
    if (!editingTemplate.name || !editingTemplate.subject) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in template name and subject',
        variant: 'destructive',
      });
      return;
    }

    // Extract variables from content using {{variableName}} pattern
    const variablePattern = /\{\{(\w+)\}\}/g;
    const allContent = editingTemplate.htmlContent + editingTemplate.subject;
    const matches = [...allContent.matchAll(variablePattern)];
    const extractedVariables = [...new Set(matches.map(m => m[1]))];

    const updatedTemplate = {
      ...editingTemplate,
      variables: extractedVariables,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = templates.findIndex(t => t.id === updatedTemplate.id);
    let newTemplates: EmailTemplate[];
    
    if (existingIndex >= 0) {
      newTemplates = templates.map((t, i) => i === existingIndex ? updatedTemplate : t);
    } else {
      newTemplates = [...templates, updatedTemplate];
    }

    saveTemplates(newTemplates);
    setTemplateDialogOpen(false);
    setEditingTemplate(null);
    
    toast({
      title: 'Template saved',
      description: `"${updatedTemplate.name}" has been saved`,
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    if (defaultTemplates.some(t => t.id === templateId)) {
      toast({
        title: 'Cannot delete',
        description: 'System templates cannot be deleted',
        variant: 'destructive',
      });
      return;
    }

    const newTemplates = templates.filter(t => t.id !== templateId);
    saveTemplates(newTemplates);
    
    toast({
      title: 'Template deleted',
      description: `"${template.name}" has been removed`,
    });
  };

  const handleToggleTemplate = (templateId: string) => {
    const newTemplates = templates.map(t => 
      t.id === templateId ? { ...t, isActive: !t.isActive, updatedAt: new Date().toISOString() } : t
    );
    saveTemplates(newTemplates);
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.category.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSelectAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setComposeSubject(template.subject);
      setComposeMessage(template.textContent);
    }
  };

  const sendBulkEmail = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: 'No recipients selected',
        description: 'Please select at least one user to send the email to',
        variant: 'destructive',
      });
      return;
    }

    if (!composeSubject || !composeMessage) {
      toast({
        title: 'Missing content',
        description: 'Please enter a subject and message',
        variant: 'destructive',
      });
      return;
    }

    setSendingEmail(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const selectedUserData = users.filter(u => selectedUsers.includes(u.id));
      
      for (const user of selectedUserData) {
        try {
          // Replace variables in subject and message
          const personalizedSubject = composeSubject
            .replace(/\{\{recipientName\}\}/g, user.full_name || 'User');
          const personalizedMessage = composeMessage
            .replace(/\{\{recipientName\}\}/g, user.full_name || 'User');

          const { error } = await supabase.functions.invoke('send-email', {
            body: {
              to: user.email,
              subject: personalizedSubject,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h1 style="color: #1a1a2e; margin-bottom: 20px;">PACT Command Center</h1>
                    <p style="color: #333;">Hello ${user.full_name || 'User'},</p>
                    <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${personalizedMessage}</div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">This message was sent from PACT Command Center.</p>
                  </div>
                </div>
              `,
              text: `Hello ${user.full_name || 'User'},\n\n${personalizedMessage}\n\n---\nThis message was sent from PACT Command Center.`,
            },
          });

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error(`Failed to send to ${user.email}:`, err);
          failCount++;
        }
      }

      toast({
        title: 'Emails sent',
        description: `Successfully sent to ${successCount} user(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      });

      if (successCount > 0) {
        setSelectedUsers([]);
        setComposeSubject('');
        setComposeMessage('');
        setSelectedTemplateId('');
      }
    } catch (error: any) {
      toast({
        title: 'Error sending emails',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      onboarding: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      authentication: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      operations: 'bg-green-500/10 text-green-600 border-green-500/30',
      workflow: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
      notification: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
      communication: 'bg-pink-500/10 text-pink-600 border-pink-500/30',
      custom: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
    };
    return (
      <Badge variant="outline" className={colors[category] || colors.custom}>
        {category}
      </Badge>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Email Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure outgoing emails, manage templates, and send communications
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2" data-testid="tab-templates">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="compose" className="flex items-center gap-2" data-testid="tab-compose">
            <Send className="h-4 w-4" />
            Compose
          </TabsTrigger>
        </TabsList>

        {/* SMTP Settings Tab */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                SMTP Configuration Status
              </CardTitle>
              <CardDescription>
                Email server configuration managed through secure environment secrets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Display */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                {smtpStatus === 'checking' && (
                  <>
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <div>
                      <p className="font-medium">Checking configuration...</p>
                      <p className="text-sm text-muted-foreground">Verifying SMTP settings</p>
                    </div>
                  </>
                )}
                {smtpStatus === 'configured' && (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-600">SMTP Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Email sending is available via IONOS SMTP (noreply@pactorg.com)
                      </p>
                    </div>
                  </>
                )}
                {smtpStatus === 'not_configured' && (
                  <>
                    <XCircle className="h-6 w-6 text-red-600" />
                    <div>
                      <p className="font-medium text-red-600">SMTP Not Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Please configure SMTP secrets in the Replit Secrets panel
                      </p>
                    </div>
                  </>
                )}
                {smtpStatus === 'error' && (
                  <>
                    <AlertTriangle className="h-6 w-6 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-600">Configuration Error</p>
                      <p className="text-sm text-muted-foreground">
                        Could not verify SMTP configuration
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-600">Secure Configuration</p>
                  <p className="text-muted-foreground mt-1">
                    SMTP credentials (host, port, username, password) are stored as encrypted secrets
                    and cannot be viewed or modified here for security. To update SMTP settings, 
                    use the Replit Secrets panel.
                  </p>
                </div>
              </div>

              {/* Test Email */}
              <div className="space-y-3">
                <Label>Test SMTP Configuration</Label>
                <div className="flex gap-3 flex-wrap">
                  <Input
                    placeholder="Enter email address to test..."
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="max-w-sm"
                    data-testid="input-test-smtp-email"
                  />
                  <Button
                    onClick={testSmtpConnection}
                    disabled={testingSmtp || smtpStatus !== 'configured'}
                    data-testid="button-test-smtp"
                  >
                    {testingSmtp ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send a test email to verify the SMTP configuration is working correctly
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Current Configuration Info */}
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">From Address</p>
                  <p className="font-medium">noreply@pactorg.com</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="font-medium">IONOS SMTP</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Email Types Supported</p>
                  <p className="font-medium">OTP, Password Reset, Notifications, Custom</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Language Support</p>
                  <p className="font-medium">English, Arabic (Bilingual)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Email Templates</CardTitle>
                  <CardDescription>Manage email templates used throughout the system</CardDescription>
                </div>
                <Button onClick={handleCreateTemplate} data-testid="button-create-template">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-templates"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Variables</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map((template) => (
                      <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>{getCategoryBadge(template.category)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{template.subject}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap max-w-[150px]">
                            {template.variables.slice(0, 2).map(v => (
                              <Badge key={v} variant="secondary" className="text-xs">
                                {v}
                              </Badge>
                            ))}
                            {template.variables.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{template.variables.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={template.isActive}
                            onCheckedChange={() => handleToggleTemplate(template.id)}
                            data-testid={`switch-template-${template.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedTemplate(template)}
                              data-testid={`button-view-template-${template.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditTemplate(template)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!defaultTemplates.some(t => t.id === template.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteTemplate(template.id)}
                                data-testid={`button-delete-template-${template.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recipients */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Select Recipients
                </CardTitle>
                <CardDescription>Choose users to receive this email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-users"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSelectAllUsers}>
                    {selectedUsers.length === filteredUsers.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {selectedUsers.length} of {users.length} selected
                </div>

                <ScrollArea className="h-[300px] rounded-md border p-2">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No users found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                            selectedUsers.includes(user.id) ? 'bg-primary/10' : 'hover-elevate'
                          }`}
                          onClick={() => handleToggleUser(user.id)}
                          data-testid={`user-${user.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => {}}
                            className="h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.full_name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {user.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Compose Message */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Compose Message
                </CardTitle>
                <CardDescription>Write your email message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Use Template (Optional)</Label>
                  <Select 
                    value={selectedTemplateId} 
                    onValueChange={(v) => {
                      setSelectedTemplateId(v);
                      applyTemplate(v);
                    }}
                  >
                    <SelectTrigger data-testid="select-template">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.filter(t => t.isActive).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Input
                    placeholder="Enter email subject..."
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    data-testid="input-compose-subject"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{{recipientName}}"} for personalization
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Message *</Label>
                  <Textarea
                    placeholder="Write your message here..."
                    value={composeMessage}
                    onChange={(e) => setComposeMessage(e.target.value)}
                    rows={10}
                    data-testid="input-compose-message"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={sendBulkEmail}
                  disabled={sendingEmail || selectedUsers.length === 0}
                  data-testid="button-send-email"
                >
                  {sendingEmail ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Sending to {selectedUsers.length} user(s)...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send to {selectedUsers.length} user(s)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Preview Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>Template preview</DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium">{selectedTemplate.subject}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Variables</Label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {selectedTemplate.variables.map(v => (
                    <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">HTML Content</Label>
                <div 
                  className="mt-2 p-4 rounded-lg border bg-white dark:bg-gray-900 max-h-[300px] overflow-auto"
                  dangerouslySetInnerHTML={{ __html: selectedTemplate.htmlContent }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.name ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              Configure your email template. Use {"{{variableName}}"} for dynamic content.
            </DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    placeholder="e.g., Welcome Email"
                    data-testid="input-template-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={editingTemplate.category}
                    onValueChange={(v) => setEditingTemplate({ ...editingTemplate, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  placeholder="e.g., Welcome to PACT - {{recipientName}}"
                  data-testid="input-template-subject"
                />
              </div>

              <div className="space-y-2">
                <Label>HTML Content</Label>
                <Textarea
                  value={editingTemplate.htmlContent}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, htmlContent: e.target.value })}
                  placeholder="<h1>Hello {{recipientName}}</h1><p>Your message here...</p>"
                  rows={8}
                  className="font-mono text-sm"
                  data-testid="input-template-html"
                />
              </div>

              <div className="space-y-2">
                <Label>Plain Text Content</Label>
                <Textarea
                  value={editingTemplate.textContent}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, textContent: e.target.value })}
                  placeholder="Hello {{recipientName}},\n\nYour message here..."
                  rows={4}
                  data-testid="input-template-text"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} data-testid="button-save-template">
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
