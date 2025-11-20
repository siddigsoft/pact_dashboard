
import React, { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from './SectionHeader';
import { QuickActionButtons } from './QuickActionButtons';
import { EnhancedMoDaCountdown } from './EnhancedMoDaCountdown';
import { CalendarAndVisits } from './CalendarAndVisits';
import { EnhancedActivityFeed } from './EnhancedActivityFeed';
import { AchievementTracker } from './AchievementTracker';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, Activity, MapPin, Target, Inbox } from 'lucide-react';
import { containerVariants, itemVariants } from './DashboardOptimization';
import LiveTeamMapWidget from './LiveTeamMapWidget';
import { useAppContext } from '@/context/AppContext';
import ForwardedMMPsCard from './ForwardedMMPsCard';

const LazyLoadingCard = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
    {children}
  </Suspense>
);

export const DashboardDesktopView = () => {
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
  const { currentUser, roles } = useAppContext();
  
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  const SectionCollapsible = ({ 
    id, 
    icon, 
    title, 
    description, 
    children 
  }: { 
    id: string;
    icon: React.ReactNode;
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => {
    const isCollapsed = collapsedSections[id] || false;
    
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <SectionHeader 
            title={title} 
            description={description} 
            icon={icon} 
          />
          <Button 
            variant="ghost" 
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => toggleSection(id)}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {!isCollapsed && children}
      </div>
    );
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Operational Overview Zone */}
      <div className="flex flex-col-reverse md:flex-row items-start justify-between gap-4">
        <motion.div variants={itemVariants} className="w-full md:w-3/4">
          <QuickActionButtons />
        </motion.div>
        
        <motion.div variants={itemVariants} className="w-full md:w-1/4 flex justify-end items-center">
          <Badge variant="outline" className="flex items-center gap-1 px-3 py-1 text-sm border-primary">
            <span className="h-2 w-2 rounded-full bg-green-400"></span>
            {currentUser?.role || 'Team Member'}
          </Badge>
        </motion.div>
      </div>
      
      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* Left Column */}
        <div className="space-y-6">
          {(roles?.includes('fom' as any) || roles?.includes('fieldOpManager' as any)) && (
            <motion.div variants={itemVariants}>
              <SectionCollapsible 
                id="forwarded-mmp"
                icon={<Inbox className="h-5 w-5 text-primary" />}
                title="Forwarded to You"
                description="MMPs awaiting your permit attachments"
              >
                <LazyLoadingCard>
                  <ForwardedMMPsCard />
                </LazyLoadingCard>
              </SectionCollapsible>
            </motion.div>
          )}
        </div>
        
        {/* Right Column */}
        <motion.div variants={itemVariants} className="space-y-6 lg:sticky lg:top-4">
          <LazyLoadingCard>
            <EnhancedMoDaCountdown />
          </LazyLoadingCard>
        </motion.div>

        {/* Full-width Field Team Map */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <SectionCollapsible
            id="team-map"
            icon={<MapPin className="h-5 w-5 text-primary" />}
            title="Field Team Map"
            description="Live view of team locations and active site visits"
          >
            <LazyLoadingCard>
              <LiveTeamMapWidget />
            </LazyLoadingCard>
          </SectionCollapsible>
        </motion.div>

        {/* Full-width Planning & Activities */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <SectionCollapsible 
            id="planning" 
            icon={<Activity className="h-5 w-5 text-primary" />}
            title="Planning & Activities"
            description="Schedule management and team activities"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div variants={itemVariants}>
                <LazyLoadingCard>
                  <CalendarAndVisits />
                </LazyLoadingCard>
              </motion.div>
              
              <motion.div variants={itemVariants}>
                <LazyLoadingCard>
                  <EnhancedActivityFeed />
                </LazyLoadingCard>
              </motion.div>
            </div>
          </SectionCollapsible>
        </motion.div>

        {/* Full-width Progress & Achievements */}
        {/* <motion.div variants={itemVariants} className="lg:col-span-2">
          <SectionCollapsible 
            id="achievements" 
            icon={<Target className="h-5 w-5 text-primary" />}
            title="Progress & Achievements"
            description="Track performance metrics and goals"
          >
            <motion.div variants={itemVariants}>
              <LazyLoadingCard>
                <AchievementTracker />
              </LazyLoadingCard>
            </motion.div>
          </SectionCollapsible>
        </motion.div> */}
      </div>
    </motion.div>
  );
};
