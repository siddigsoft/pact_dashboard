
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { Search, Phone, ArrowLeftRight, Clock } from 'lucide-react';
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
  
  // Mock call history data
  const callHistory = [
    { id: 'c1', recipientId: 'usr2', direction: 'outgoing', duration: 124, timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), status: 'completed' },
    { id: 'c2', recipientId: 'usr3', direction: 'incoming', duration: 67, timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), status: 'missed' },
    { id: 'c3', recipientId: 'usr4', direction: 'outgoing', duration: 245, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'completed' },
    { id: 'c4', recipientId: 'usr5', direction: 'incoming', duration: 31, timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed' },
  ];
  
  // Format duration in minutes and seconds
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.id !== currentUser?.id &&
    (user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // Check if a call is active or in progress
  const isCallActive = callState.status !== 'idle';
  
  // Handle starting a call with a user
  const handleStartCall = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      initiateCall(user);
    }
  };
  
  // Handle call history item click
  const handleCallHistoryClick = (recipientId: string) => {
    const user = users.find(u => u.id === recipientId);
    if (user) {
      initiateCall(user);
    }
  };

  // Effect to check for authentication
  React.useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Call Center</h1>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
      
      {isCallActive && callState.recipient && (
        <div className="py-8">
          <CallInterface
            recipient={callState.recipient || callState.caller!}
            callType={callState.status}
            duration={callState.duration}
            onEnd={endCall}
          />
        </div>
      )}
      
      {!isCallActive && (
        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
          </TabsList>
          
          <div className="my-4 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <TabsContent value="contacts">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-2 p-1">
                {filteredUsers.map((user) => (
                  <Card 
                    key={user.id} 
                    className="p-3 hover:bg-accent cursor-pointer transition-colors flex justify-between items-center"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="rounded-full" />
                        ) : (
                          <div className="bg-primary/10 w-full h-full rounded-full flex items-center justify-center">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </Avatar>
                      
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.role}</div>
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 rounded-full bg-green-100 hover:bg-green-200 text-green-600"
                      onClick={() => handleStartCall(user.id)}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  </Card>
                ))}
                
                {filteredUsers.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-muted-foreground">No users found</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="history">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-2 p-1">
                {callHistory.map((call) => {
                  const recipient = users.find(u => u.id === call.recipientId);
                  if (!recipient) return null;
                  
                  return (
                    <Card 
                      key={call.id} 
                      className="p-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleCallHistoryClick(call.recipientId)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            {recipient.avatar ? (
                              <img src={recipient.avatar} alt={recipient.name} className="rounded-full" />
                            ) : (
                              <div className="bg-primary/10 w-full h-full rounded-full flex items-center justify-center">
                                {recipient.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </Avatar>
                          
                          <div>
                            <div className="font-medium">{recipient.name}</div>
                            <div className="flex items-center text-xs gap-1 mt-0.5">
                              <ArrowLeftRight className={`h-3 w-3 ${
                                call.direction === 'incoming' ? 'text-blue-500 rotate-180' : 'text-green-500'
                              }`} />
                              <span className={call.status === 'missed' ? 'text-red-500' : 'text-muted-foreground'}>
                                {call.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                                {call.status === 'missed' ? ' (Missed)' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            {new Date(call.timestamp).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1 text-xs mt-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDuration(call.duration)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                
                {callHistory.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-muted-foreground">No call history</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Calls;
