
import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, MapPin, Calendar, Users, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QuickActionButtons = () => {
  const navigate = useNavigate();
  
  return (
    <div className="flex flex-wrap gap-2">
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 shadow-sm"
        onClick={() => navigate('/site-visits/create')}
      >
        <MapPin className="h-4 w-4 text-emerald-500" />
        <span>New Site Visit</span>
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 shadow-sm"
        onClick={() => navigate('/mmp/upload')}
      >
        <FileText className="h-4 w-4 text-blue-500" />
        <span>Upload MMP</span>
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 shadow-sm"
        onClick={() => navigate('/projects/create')}
      >
        <Plus className="h-4 w-4 text-violet-500" />
        <span>Create Project</span>
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 shadow-sm"
        onClick={() => navigate('/calendar')}
      >
        <Calendar className="h-4 w-4 text-amber-500" />
        <span>Schedule</span>
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 shadow-sm"
        onClick={() => navigate('/users')}
      >
        <Users className="h-4 w-4 text-indigo-500" />
        <span>Team</span>
      </Button>
    </div>
  );
};
