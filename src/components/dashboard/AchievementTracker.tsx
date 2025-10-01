
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AchievementProgressBar } from './AchievementProgressBar';
import { Trophy, Calendar, RotateCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '@/context/AppContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { formatDistanceToNow, startOfWeek, startOfMonth, startOfQuarter } from 'date-fns';

export const AchievementTracker = () => {
  const [timeframe, setTimeframe] = useState('weekly');
  const { siteVisits, mmpFiles, users } = useAppContext();
  const { projects } = useProjectContext();

  // Helpers
  const getStartFor = (tf: 'weekly' | 'monthly' | 'quarterly'): Date => {
    if (tf === 'weekly') return startOfWeek(new Date());
    if (tf === 'monthly') return startOfMonth(new Date());
    return startOfQuarter(new Date());
  };

  const inWindow = (ts?: string, from?: Date) => {
    if (!ts || !from) return false;
    const d = new Date(ts);
    return !isNaN(d.getTime()) && d >= from;
  };

  const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  // Compute dynamic "last updated" from latest timestamps across sources
  const lastUpdated = useMemo(() => {
    const dates: number[] = [];
    (siteVisits || []).forEach((v: any) => {
      [v.createdAt, v.assignedAt, v.completedAt, v.dueDate, v?.permitDetails?.verifiedAt]
        .filter(Boolean)
        .forEach((t: string) => dates.push(new Date(t).getTime()));
    });
    (mmpFiles || []).forEach((f: any) => {
      [f.createdAt, f.uploadedAt, f.modifiedAt, f.approvedAt]
        .filter(Boolean)
        .forEach((t: string) => dates.push(new Date(t).getTime()));
    });
    (projects || []).forEach((p: any) => {
      [p.createdAt, p.updatedAt].filter(Boolean).forEach((t: string) => dates.push(new Date(t).getTime()));
      (p.activities || []).forEach((a: any) => {
        [a.startDate, a.endDate].filter(Boolean).forEach((t: string) => dates.push(new Date(t).getTime()));
      });
    });
    const max = dates.length ? new Date(Math.max(...dates)) : undefined;
    return max ? formatDistanceToNow(max, { addSuffix: true }) : 'just now';
  }, [siteVisits, mmpFiles, projects]);

  // Weekly KPIs
  const weeklyGoals = useMemo(() => {
    const from = getStartFor('weekly');

    const visitsCompleted = (siteVisits || []).filter((v: any) => inWindow(v.completedAt, from)).length;
    const visitsPlanned = (siteVisits || []).filter((v: any) => inWindow(v.dueDate, from)).length;
    const visitsTarget = Math.max(visitsPlanned || 0, visitsCompleted || 0, 1);

    const mmpInWindow = (mmpFiles || []).filter((f: any) => inWindow(f.createdAt || f.uploadedAt, from));
    const mmpApproved = mmpInWindow.filter((f: any) => !!f.approvedAt || String(f.status || '').toLowerCase() === 'approved');
    const complianceRate = (mmpInWindow.length > 0)
      ? clampPct((mmpApproved.length / mmpInWindow.length) * 100)
      : (() => {
          const total = (mmpFiles || []).length;
          const appr = (mmpFiles || []).filter((f: any) => String(f.status || '').toLowerCase() === 'approved').length;
          return total > 0 ? clampPct((appr / total) * 100) : 0;
        })();

    const totalUsers = (users || []).length || 1;
    const activeUsers = (users || []).filter((u: any) => (u.availability !== 'offline') && inWindow(u.lastActive, from)).length;
    const teamActivityRate = clampPct((activeUsers / totalUsers) * 100);

    return [
      { title: 'Site Visits Completed', progress: visitsCompleted, target: visitsTarget, category: 'visits' },
      { title: 'Compliance Rate', progress: complianceRate, target: 100, unit: '%', category: 'compliance' },
      { title: 'Team Activity Rate', progress: teamActivityRate, target: 100, unit: '%', category: 'team' },
    ];
  }, [siteVisits, mmpFiles, users]);

  // Monthly KPIs
  const monthlyGoals = useMemo(() => {
    const from = getStartFor('monthly');

    const visitsCompleted = (siteVisits || []).filter((v: any) => inWindow(v.completedAt, from)).length;
    const visitsPlanned = (siteVisits || []).filter((v: any) => inWindow(v.dueDate, from)).length;
    const visitsTarget = Math.max(visitsPlanned || 0, visitsCompleted || 0, 1);

    const mmpInWindow = (mmpFiles || []).filter((f: any) => inWindow(f.createdAt || f.uploadedAt, from));
    const mmpApproved = mmpInWindow.filter((f: any) => !!f.approvedAt || String(f.status || '').toLowerCase() === 'approved').length;
    const mmpRejected = mmpInWindow.filter((f: any) => String(f.status || '').toLowerCase() === 'rejected').length;
    const complianceRate = mmpInWindow.length > 0 ? clampPct((mmpApproved / mmpInWindow.length) * 100) : 0;
    const rejectionRate = mmpInWindow.length > 0 ? clampPct((mmpRejected / mmpInWindow.length) * 100) : 0;

    const totalUsers = (users || []).length || 1;
    const activeUsers = (users || []).filter((u: any) => (u.availability !== 'offline') && inWindow(u.lastActive, from)).length;
    const teamActivityRate = clampPct((activeUsers / totalUsers) * 100);

    return [
      { title: 'Site Visits Completed', progress: visitsCompleted, target: visitsTarget, category: 'visits' },
      { title: 'Compliance Rate', progress: complianceRate, target: 100, unit: '%', category: 'compliance' },
      { title: 'Rejection Rate', progress: rejectionRate, target: 100, unit: '%', category: 'fraud' },
      { title: 'Team Activity Rate', progress: teamActivityRate, target: 100, unit: '%', category: 'team' },
    ];
  }, [siteVisits, mmpFiles, users]);

  // Quarterly KPIs
  const quarterlyGoals = useMemo(() => {
    const from = getStartFor('quarterly');

    // Project completion: completed activities (by endDate) vs total planned in quarter
    let actCompleted = 0; let actTotal = 0;
    (projects || []).forEach((p: any) => {
      (p.activities || []).forEach((a: any) => {
        if (inWindow(a.endDate || a.startDate, from)) {
          actTotal += 1;
          if (String(a.status || '').toLowerCase() === 'completed') actCompleted += 1;
        }
      });
    });
    const projectTarget = Math.max(actTotal || 0, actCompleted || 0, 1);

    // Compliance audits: permits verified this quarter vs all visits this quarter
    const visitsInQ = (siteVisits || []).filter((v: any) => inWindow(v.createdAt || v.dueDate, from));
    const permitsVerified = visitsInQ.filter((v: any) => inWindow(v?.permitDetails?.verifiedAt, from)).length;
    const auditsTarget = Math.max(visitsInQ.length || 0, 1);
    const auditsPct = clampPct((permitsVerified / auditsTarget) * 100);

    // Fraud prevention score: 100 - rejection rate of MMP files in quarter
    const mmpInQ = (mmpFiles || []).filter((f: any) => inWindow(f.createdAt || f.uploadedAt, from));
    const rejInQ = mmpInQ.filter((f: any) => String(f.status || '').toLowerCase() === 'rejected').length;
    const preventionScore = mmpInQ.length > 0 ? clampPct(100 - (rejInQ / mmpInQ.length) * 100) : 100;

    // Team performance: average rating of site visits this quarter (0-5) mapped to percent
    const rated = (siteVisits || []).filter((v: any) => inWindow(v.completedAt, from) && typeof v.rating === 'number');
    const avgRating = rated.length ? rated.reduce((s: number, v: any) => s + (v.rating || 0), 0) / rated.length : 0;
    const teamPerf = clampPct((avgRating / 5) * 100);

    // Documentation quality: percent of completed visits with notes or attachments this quarter
    const completedInQ = (siteVisits || []).filter((v: any) => inWindow(v.completedAt, from));
    const documented = completedInQ.filter((v: any) => (v?.attachments && v.attachments.length > 0) || (v?.notes && String(v.notes).trim().length > 0)).length;
    const docQuality = completedInQ.length > 0 ? clampPct((documented / completedInQ.length) * 100) : 0;

    return [
      { title: 'Project Completion', progress: actCompleted, target: projectTarget, category: 'visits' },
      { title: 'Compliance Audits', progress: auditsPct, target: 100, unit: '%', category: 'compliance' },
      { title: 'Fraud Prevention Score', progress: preventionScore, target: 100, unit: '%', category: 'fraud' },
      { title: 'Team Performance', progress: teamPerf, target: 100, unit: '%', category: 'team' },
      { title: 'Documentation Quality', progress: docQuality, target: 100, unit: '%', category: 'compliance' },
    ];
  }, [projects, siteVisits, mmpFiles]);
  
  return (
    <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-all duration-300">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Achievement Tracker
        </CardTitle>
        <Tabs defaultValue="weekly" value={timeframe} onValueChange={setTimeframe} className="w-auto">
          <TabsList className="grid grid-cols-3 h-7">
            <TabsTrigger value="weekly" className="text-xs px-2">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs px-2">Monthly</TabsTrigger>
            <TabsTrigger value="quarterly" className="text-xs px-2">Quarterly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-4">
        <motion.div
          key={timeframe}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {timeframe === 'weekly' && 'This Week'}
                {timeframe === 'monthly' && 'This Month'}
                {timeframe === 'quarterly' && 'This Quarter'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <RotateCw className="h-3.5 w-3.5" />
              <span>Updated {lastUpdated}</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {timeframe === 'weekly' && weeklyGoals.map((goal, index) => (
              <AchievementProgressBar
                key={`weekly-${index}`}
                title={goal.title}
                progress={goal.progress}
                target={goal.target}
                unit={goal.unit}
                category={goal.category}
              />
            ))}
            
            {timeframe === 'monthly' && monthlyGoals.map((goal, index) => (
              <AchievementProgressBar
                key={`monthly-${index}`}
                title={goal.title}
                progress={goal.progress}
                target={goal.target}
                unit={goal.unit}
                category={goal.category}
              />
            ))}
            
            {timeframe === 'quarterly' && quarterlyGoals.map((goal, index) => (
              <AchievementProgressBar
                key={`quarterly-${index}`}
                title={goal.title}
                progress={goal.progress}
                target={goal.target}
                unit={goal.unit}
                category={goal.category}
              />
            ))}
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
};
