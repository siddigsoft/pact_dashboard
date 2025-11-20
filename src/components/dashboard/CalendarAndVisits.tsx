
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, ClipboardList } from 'lucide-react';
import { DashboardCalendar } from './DashboardCalendar';
import UpcomingSiteVisitsCard from './UpcomingSiteVisitsCard';

export const CalendarAndVisits = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  
  return (
    
      <CardContent className="p-0 overflow-hidden ">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === 'calendar' ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4"
        >
          {activeTab === 'calendar' && <DashboardCalendar />}
          {activeTab === 'visits' && <UpcomingSiteVisitsCard siteVisits={[]} />}
        </motion.div>
      </CardContent>
    
  );
};
