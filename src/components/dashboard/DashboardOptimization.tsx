
import React from 'react';
import type { Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectContext } from '@/context/project/ProjectContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { BarChart3, FileCheck, CalendarRange, MapPin } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: React.ReactNode;
  description?: string;
  icon: React.ReactNode;
  trendValue?: number;
  trendDirection?: 'up' | 'down' | 'neutral';
}

export const StatsCard = ({ title, value, description, icon, trendValue, trendDirection }: StatsCardProps) => {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trendValue !== undefined && (
          <div className={`flex items-center text-xs ${
            trendDirection === 'up' ? 'text-green-500' : 
            trendDirection === 'down' ? 'text-red-500' : 'text-gray-500'
          }`}>
            {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '→'} {trendValue}%
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Container animation variants
export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Item animation variants
export const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100
    }
  }
};

export const useDashboardStats = () => {
  const { projects } = useProjectContext();
  const { mmpFiles } = useMMP();
  const { siteVisits } = useSiteVisitContext();

  // Count active projects
  const activeProjects = projects?.filter(project => project.status === 'active').length || 0;
  
  // Count approved MMPs
  const approvedMmps = mmpFiles?.filter(mmp => mmp.status === 'approved').length || 0;
  
  // Count completed site visits
  const completedVisits = siteVisits?.filter(visit => visit.status === 'completed').length || 0;
  
  // Count pending site visits
  const pendingSiteVisits = siteVisits?.filter(visit => ['pending', 'assigned', 'inProgress'].includes(visit.status)).length || 0;

  return {
    activeProjects,
    approvedMmps,
    completedVisits,
    pendingSiteVisits
  };
};

// Dashboard statistics to be displayed
export const dashboardStats = [
  {
    title: "Active Projects",
    value: "0",
    description: "Current ongoing projects",
    icon: <BarChart3 className="h-4 w-4 text-primary" />,
  },
  {
    title: "Approved MMPs",
    value: "0",
    description: "Total approved monitoring plans",
    icon: <FileCheck className="h-4 w-4 text-primary" />,
    trendValue: 12,
    trendDirection: 'up' as const,
  },
  {
    title: "Completed Visits",
    value: "0", 
    description: "Successfully completed site visits",
    icon: <MapPin className="h-4 w-4 text-primary" />,
  },
  {
    title: "Pending Site Visits",
    value: "0",
    description: "Site visits requiring action",
    icon: <CalendarRange className="h-4 w-4 text-primary" />,
  },
];
