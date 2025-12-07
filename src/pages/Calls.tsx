
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Users, ArrowLeft } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import CallInterface from '@/components/communication/CallInterface';
import { useCommunication } from '@/context/communications/CommunicationContext';

const Calls: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { users } = useUser();
  const { callState, initiateCall, endCall } = useCommunication();
  const [searchQuery, setSearchQuery] = useState('');
  
  const callHistory = [
    { id: 'c1', recipientId: 'usr2', direction: 'outgoing', duration: 124, timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), status: 'completed' },
    { id: 'c2', recipientId: 'usr3', direction: 'incoming', duration: 67, timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), status: 'missed' },
    { id: 'c3', recipientId: 'usr4', direction: 'outgoing', duration: 245, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'completed' },
    { id: 'c4', recipientId: 'usr5', direction: 'incoming', duration: 31, timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed' },
  ];
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  const filteredUsers = users.filter(user => 
    user.id !== currentUser?.id &&
    (user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const isCallActive = callState.status !== 'idle';
  
  const handleStartCall = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      initiateCall(user);
    }
  };
  
  const handleCallHistoryClick = (recipientId: string) => {
    const user = users.find(u => u.id === recipientId);
    if (user) {
      initiateCall(user);
    }
  };

  React.useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          data-testid="button-go-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Call Center</h1>
          <p className="text-sm text-muted-foreground">Make voice calls to your team members</p>
        </div>
      </div>
      
      {isCallActive && callState.recipient && (
        <Card className="border-2 border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="py-8">
            <CallInterface
              recipient={callState.recipient || callState.caller!}
              callType={callState.status}
              duration={callState.duration}
              onEnd={endCall}
            />
          </CardContent>
        </Card>
      )}
      
      {!isCallActive && (
        <>
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <PhoneCall className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center md:text-left flex-1">
                  <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">How to Make a Call</h2>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Select a team member from the contacts list below and tap the <strong>Call</strong> button to start a voice call.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Users className="h-4 w-4" />
                  <span>{filteredUsers.length} contacts available</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="contacts" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contacts" data-testid="tab-contacts">
                <Users className="h-4 w-4 mr-2" />
                Contacts
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                <Clock className="h-4 w-4 mr-2" />
                Call History
              </TabsTrigger>
            </TabsList>
            
            <div className="my-4 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or role..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            
            <TabsContent value="contacts">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-3 p-1">
                  {filteredUsers.map((user) => (
                    <Card 
                      key={user.id} 
                      className="overflow-visible"
                      data-testid={`card-contact-${user.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={user.avatar} alt={user.name} />
                              <AvatarFallback className="bg-primary/10 text-lg">
                                {user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate" data-testid={`text-contact-name-${user.id}`}>{user.name}</div>
                              <div className="text-sm text-muted-foreground truncate">{user.role}</div>
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => handleStartCall(user.id)}
                            variant="default"
                            className="gap-2 flex-shrink-0"
                            data-testid={`button-call-${user.id}`}
                          >
                            <Phone className="h-4 w-4" />
                            <span className="hidden sm:inline">Call</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {filteredUsers.length === 0 && (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground font-medium">No contacts found</p>
                        <p className="text-sm text-muted-foreground mt-1">Try a different search term</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="history">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-3 p-1">
                  {callHistory.map((call) => {
                    const recipient = users.find(u => u.id === call.recipientId);
                    if (!recipient) return null;
                    
                    const isMissed = call.status === 'missed';
                    const isIncoming = call.direction === 'incoming';
                    
                    return (
                      <Card 
                        key={call.id} 
                        className="overflow-visible"
                        data-testid={`card-history-${call.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={recipient.avatar} alt={recipient.name} />
                                <AvatarFallback className="bg-primary/10 text-lg">
                                  {recipient.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{recipient.name}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  {isMissed ? (
                                    <Badge variant="destructive" className="text-xs gap-1">
                                      <PhoneMissed className="h-3 w-3" />
                                      Missed
                                    </Badge>
                                  ) : isIncoming ? (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <PhoneIncoming className="h-3 w-3" />
                                      Incoming
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs gap-1">
                                      <PhoneOutgoing className="h-3 w-3" />
                                      Outgoing
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(call.duration)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end gap-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(call.timestamp).toLocaleDateString()}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCallHistoryClick(call.recipientId)}
                                className="gap-1"
                                data-testid={`button-callback-${call.id}`}
                              >
                                <Phone className="h-3 w-3" />
                                Call Back
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  
                  {callHistory.length === 0 && (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground font-medium">No call history yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Your recent calls will appear here</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default Calls;
