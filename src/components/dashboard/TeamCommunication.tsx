
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MessageSquare, MapPin, Users } from 'lucide-react';
import ChatIndicatorWidget from './ChatIndicatorWidget';
import DashboardLocationSharingCard from '@/components/DashboardLocationSharingCard';

export const TeamCommunication = () => {
  const [activeTab, setActiveTab] = useState('chat');
  
  return (
    <Card className="border-t-4 border-t-violet-500 hover:shadow-md transition-all duration-300">
      <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent flex flex-row justify-between items-center">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-violet-500" />
          Team Communication
        </CardTitle>
        <Tabs defaultValue="chat" className="w-auto" onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 h-7">
            <TabsTrigger value="chat" className="text-xs px-2">Chat</TabsTrigger>
            <TabsTrigger value="location" className="text-xs px-2">Location</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4"
        >
          {activeTab === 'chat' && <ChatIndicatorWidget />}
          {activeTab === 'location' && <DashboardLocationSharingCard />}
        </motion.div>
      </CardContent>
    </Card>
  );
};
