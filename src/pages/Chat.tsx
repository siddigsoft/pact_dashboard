
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  MessageSquare, 
  Zap, 
  Clock, 
  Users, 
  Briefcase,
  Heart,
  ThumbsUp,
  Coffee,
  CheckCircle,
  AlertCircle,
  Calendar,
  FileText,
  Send,
  Sparkles,
  Star,
  Bell
} from 'lucide-react';

const QUICK_REPLY_CATEGORIES = [
  {
    id: 'greetings',
    label: 'Greetings',
    icon: Heart,
    color: 'text-pink-600 bg-pink-500/10',
    templates: [
      { id: 1, text: "Good morning! How can I help you today?" },
      { id: 2, text: "Hello! Hope you're having a great day." },
      { id: 3, text: "Hi there! Thanks for reaching out." },
    ]
  },
  {
    id: 'status',
    label: 'Status Updates',
    icon: CheckCircle,
    color: 'text-green-600 bg-green-500/10',
    templates: [
      { id: 4, text: "Task completed successfully. Ready for review." },
      { id: 5, text: "Currently working on this. Will update you soon." },
      { id: 6, text: "All done! Let me know if you need anything else." },
    ]
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: Calendar,
    color: 'text-blue-600 bg-blue-500/10',
    templates: [
      { id: 7, text: "Can we schedule a call to discuss this?" },
      { id: 8, text: "I'm available tomorrow between 10 AM and 2 PM." },
      { id: 9, text: "Let me check my calendar and get back to you." },
    ]
  },
  {
    id: 'work',
    label: 'Work Related',
    icon: Briefcase,
    color: 'text-purple-600 bg-purple-500/10',
    templates: [
      { id: 10, text: "Please find the attached document for your review." },
      { id: 11, text: "I'll send over the report by end of day." },
      { id: 12, text: "Could you please provide more details on this?" },
    ]
  },
  {
    id: 'acknowledgment',
    label: 'Acknowledgment',
    icon: ThumbsUp,
    color: 'text-amber-600 bg-amber-500/10',
    templates: [
      { id: 13, text: "Got it, thanks for the update!" },
      { id: 14, text: "Understood. I'll take care of it." },
      { id: 15, text: "Thank you for letting me know." },
    ]
  },
  {
    id: 'follow-up',
    label: 'Follow Up',
    icon: Clock,
    color: 'text-cyan-600 bg-cyan-500/10',
    templates: [
      { id: 16, text: "Just following up on my previous message." },
      { id: 17, text: "Any updates on this?" },
      { id: 18, text: "Gentle reminder about our pending discussion." },
    ]
  },
];

const FEATURED_TEMPLATES = [
  { id: 'f1', text: "I'm on it!", icon: Zap, color: 'bg-amber-500' },
  { id: 'f2', text: "Thanks!", icon: Heart, color: 'bg-pink-500' },
  { id: 'f3', text: "On my way", icon: Clock, color: 'bg-blue-500' },
  { id: 'f4', text: "Call me", icon: Coffee, color: 'bg-green-500' },
];

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const [searchParams] = useSearchParams();
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('greetings');

  const prefilledMessage = searchParams.get('message');
  const targetUserId = searchParams.get('userId');

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (prefilledMessage && targetUserId) {
      console.log('Pre-filled message for user:', targetUserId, prefilledMessage);
    }
  }, [prefilledMessage, targetUserId]);

  const handleSelectTemplate = (text: string) => {
    console.log('Selected template:', text);
    setShowTemplates(false);
  };

  return (
    <div className="uber-page uber-font" data-testid="chat-page">
      <div className="uber-page-content">
        <div className="uber-page-header uber-slide-in-down">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="uber-icon-btn"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl uber-heading" data-testid="text-page-title">
                Messages
              </h1>
              <p className="text-xs text-muted-foreground uber-text mt-1">Connect with your team</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(true)}
              className="uber-icon-btn"
              data-testid="button-templates"
            >
              <Sparkles className="h-5 w-5 text-amber-500" />
            </button>
            <button 
              onClick={() => navigate('/notifications')}
              className="uber-icon-btn relative"
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>
      
      {prefilledMessage && (
        <Card className="mb-4 border-primary/30 bg-primary/5 uber-slide-in-up uber-stagger-1">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Send className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary">Draft message ready</span>
                  <Badge variant="secondary" className="h-4 text-[9px]">From Calls</Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{prefilledMessage}</p>
              </div>
              <Button size="sm" className="gap-1.5" data-testid="button-send-draft">
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="uber-card-elevated overflow-hidden rounded-2xl uber-slide-in-up uber-stagger-2">
        <div className="flex h-[calc(100vh-280px)]">
          <div className={`${isMobile ? 'w-full md:w-80' : 'w-80'} h-full border-r border-border/30`}>
            <ChatSidebar />
          </div>
          <div className="flex-1 h-full overflow-hidden bg-muted/20">
            <ChatWindow />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-5 uber-slide-in-up uber-stagger-3">
        {FEATURED_TEMPLATES.map((template) => (
          <button
            key={template.id}
            className={`uber-pill transition-all hover:scale-105 ${
              template.color === 'bg-amber-500' 
                ? 'uber-pill-warning' 
                : template.color === 'bg-pink-500' 
                ? 'uber-pill-danger' 
                : template.color === 'bg-blue-500' 
                ? 'uber-pill-info' 
                : 'uber-pill-success'
            }`}
            onClick={() => handleSelectTemplate(template.text)}
            data-testid={`featured-template-${template.id}`}
          >
            <template.icon className="h-3 w-3" />
            {template.text}
          </button>
        ))}
      </div>

      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Message Templates
            </DialogTitle>
            <DialogDescription>
              Quick replies to speed up your conversations
            </DialogDescription>
          </DialogHeader>

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mt-2">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              {QUICK_REPLY_CATEGORIES.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid={`category-${category.id}`}
                >
                  <category.icon className="h-3.5 w-3.5" />
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {QUICK_REPLY_CATEGORIES.map((category) => (
              <TabsContent key={category.id} value={category.id} className="mt-4">
                <div className="space-y-2">
                  {category.templates.map((template) => (
                    <button
                      key={template.id}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                      onClick={() => handleSelectTemplate(template.text)}
                      data-testid={`template-${template.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${category.color}`}>
                          <category.icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm flex-1">{template.text}</span>
                        <Send className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Recently Used</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => handleSelectTemplate("Got it, thanks!")}>
                Got it, thanks!
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => handleSelectTemplate("I'll check and update you")}>
                I'll check and update you
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-muted" onClick={() => handleSelectTemplate("Sounds good!")}>
                Sounds good!
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default Chat;
