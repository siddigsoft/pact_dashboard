
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Filter, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import ActivityFeed from './ActivityFeed';

const activityTypes = [
  { id: 'all', label: 'All Activities' },
  { id: 'projects', label: 'Projects' },
  { id: 'siteVisits', label: 'Site Visits' },
  { id: 'mmp', label: 'MMP Files' },
  { id: 'team', label: 'Team' },
];

export const EnhancedActivityFeed = () => {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['all']);
  
  const toggleType = (typeId: string) => {
    if (typeId === 'all') {
      setSelectedTypes(['all']);
      return;
    }
    
    let newSelection = [...selectedTypes];
    
    // Remove 'all' if a specific type is selected
    if (newSelection.includes('all')) {
      newSelection = newSelection.filter(t => t !== 'all');
    }
    
    // Toggle the selected type
    if (newSelection.includes(typeId)) {
      newSelection = newSelection.filter(t => t !== typeId);
      // If nothing's selected, default to 'all'
      if (newSelection.length === 0) newSelection = ['all'];
    } else {
      newSelection.push(typeId);
    }
    
    setSelectedTypes(newSelection);
  };
  
  return (
    

      <CardContent className="p-4 h-[350px] ">
        <ActivityFeed />
      </CardContent>
    
  );
};
