import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { StatsCard, containerVariants, itemVariants, useDashboardStats } from './DashboardOptimization';
import { useProgressiveLoading } from './animation-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, subMonths, isAfter } from 'date-fns';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, ClipboardDocumentCheckIcon, CalendarDaysIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  FileCheck, 
  MapPin, 
  CalendarRange, 
  Globe, 
  TrendingUp, 
  Users, 
  CheckCircle,
  ClipboardList // Add icon for the new section
} from 'lucide-react';
import type { MMPStatus } from '@/types';

export const DashboardStatsOverview = () => {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const isLoaded = useProgressiveLoading(300);

  const { activeProjects, approvedMmps, completedVisits, pendingSiteVisits } = useDashboardStats();
  const { currentUser, roles } = useAppContext();
  const isFinanceOrAdmin = roles?.includes('admin') || roles?.includes('financialAdmin');

  const { mmpFiles } = useMMP();
  const { siteVisits } = useSiteVisitContext();
  const navigate = useNavigate();

  // Helper to normalize status for comparison
  const normalizeStatus = (status: MMPStatus) =>
    status?.replace(/_/g, '').toLowerCase();

  // ====================== KPI CARDS ======================
  // Use meaningful icons for each KPI
  const statsToDisplay = [
    {
      title: 'Active Projects',
      value: activeProjects,
      description: 'Current ongoing projects',
      icon: <ClipboardDocumentCheckIcon className="h-5 w-5 text-primary" />,
    },
    {
      title: 'Approved MMPs',
      value: approvedMmps,
      description: 'Total approved monitoring plans',
      icon: <CheckCircleIcon className="h-5 w-5 text-green-600" />,
    },
    {
      title: 'Completed Visits',
      value: completedVisits,
      description: 'Successfully completed site visits',
      icon: <CalendarDaysIcon className="h-5 w-5 text-blue-600" />,
    },
    {
      title: 'Pending Site Visits',
      value: pendingSiteVisits,
      description: 'Site visits requiring action',
      icon: <ExclamationCircleIcon className="h-5 w-5 text-amber-600" />,
    },
  ];

  // ====================== MMP GROUPS ======================
  const threeMonthGroups = useMemo(() => {
    const now = new Date();
    const months = [0, 1, 2].map(i => startOfMonth(subMonths(now, i)));
    const map: Record<string, any[]> = {};

    (mmpFiles || []).forEach(m => {
      const d = m.uploadedAt ? new Date(m.uploadedAt) : (m.approvedAt ? new Date(m.approvedAt) : null);
      if (!d) return;

      const key = format(startOfMonth(d), 'yyyy-MM');
      if (months.some(mo => format(mo, 'yyyy-MM') === key)) {
        map[key] = map[key] || [];
        map[key].push(m);
      }
    });

    return months.map(mo => ({
      monthLabel: format(mo, 'MMMM yyyy'),
      key: format(mo, 'yyyy-MM'),
      items: map[format(mo, 'yyyy-MM')] || [],
    }));
  }, [mmpFiles]);

  // ====================== SITE VISITS FILTERS ======================
  const [hubFilter, setHubFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const filteredSiteVisits = useMemo(() => {
    let v = (siteVisits || []).slice();
    if (hubFilter) v = v.filter(s => (s.hub || '').toLowerCase() === hubFilter.toLowerCase());
    if (regionFilter)
      v = v.filter(s => {
        const regionVal = (s.location?.region || s.region || s.state || '').toString();
        return regionVal.toLowerCase() === regionFilter.toLowerCase();
      });
    if (monthFilter) v = v.filter(s => (s.dueDate || '').startsWith(monthFilter));
    return v;
  }, [siteVisits, hubFilter, regionFilter, monthFilter]);

  const totalVisits = filteredSiteVisits.length;
  const completedCount = filteredSiteVisits.filter(v => v.status === 'completed').length;
  const ongoingCount = filteredSiteVisits.filter(v => ['assigned', 'inProgress'].includes(v.status)).length;
  const scheduledCount = filteredSiteVisits.filter(v => {
    if (!v.dueDate) return false;
    const d = new Date(v.dueDate);
    return !isNaN(d.getTime()) && isAfter(d, new Date()) && v.status !== 'completed';
  }).length;

  const assignedCount = filteredSiteVisits.filter(v => v.assignedTo && ['assigned', 'inProgress'].includes(v.status)).length;
  const unassignedCount = filteredSiteVisits.filter(v => !v.assignedTo && ['pending', 'permitVerified', 'assigned'].includes(v.status)).length;

  const costTotals = useMemo(() => {
    const all = filteredSiteVisits || [];
    const total = all.reduce((s, v) => s + (v.fees?.total || 0), 0);
    const completed = all.filter(v => v.status === 'completed').reduce((s, v) => s + (v.fees?.total || 0), 0);
    const ongoing = all.filter(v => ['assigned', 'inProgress'].includes(v.status)).reduce((s, v) => s + (v.fees?.total || 0), 0);
    return { total, completed, ongoing };
  }, [filteredSiteVisits]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(); cutoff.setDate(now.getDate() + 14);
    return (siteVisits || [])
      .filter(s => s.dueDate && !isNaN(new Date(s.dueDate).getTime()) && new Date(s.dueDate) >= now && new Date(s.dueDate) <= cutoff)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10);
  }, [siteVisits]);

  // Add workflow status counts
  const mmpStatusCounts = useMemo(() => {
    const counts = { pending: 0, reviewed: 0, approved: 0, sent: 0 };
    (mmpFiles || []).forEach(mmp => {
      const norm = normalizeStatus(mmp.status);
      if (norm === 'pendingreview') counts.pending++;
      if (norm === 'reviewed') counts.reviewed++;
      if (norm === 'approved') counts.approved++;
      if (norm === 'sent') counts.sent++;
    });
    return counts;
  }, [mmpFiles]);

  // Add workflow status cards for relevant roles
  const workflowCards = [
    { title: 'Pending Review', value: mmpStatusCounts.pending, color: 'amber-500' },
    { title: 'Reviewed', value: mmpStatusCounts.reviewed, color: 'blue-500' },
    { title: 'Approved', value: mmpStatusCounts.approved, color: 'green-600' },
    { title: 'Sent', value: mmpStatusCounts.sent, color: 'gray-500' },
  ];

  // ====================== LOADING STATE ======================
  if (!isLoaded) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 items-stretch">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  // ====================== DASHBOARD LAYOUT ======================
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">

      {/* ===== TOP KPIs ===== */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {statsToDisplay.map((stat, index) => (
          <motion.div
            key={stat.title}
            variants={itemVariants}
            className="flex flex-col h-full"
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
            whileHover={{ scale: 1.025, transition: { duration: 0.18 } }}
          >
            <div className="flex flex-col flex-1 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-blue-100 dark:border-blue-900 p-5 gap-2 transition hover:shadow-md min-h-[140px]">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 rounded-full p-2">{stat.icon}</div>
                <div>
                  <div className="text-lg font-semibold">{stat.title}</div>
                  <div className="text-xs text-muted-foreground">{stat.description}</div>
                </div>
              </div>
              <div className="mt-2 text-3xl font-bold text-primary flex-1 flex items-end">
                {hoveredCard === index ? (
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 0.4 }}>
                    {stat.value}
                  </motion.div>
                ) : stat.value}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ===== WORKFLOW STATUS CARDS ===== */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {workflowCards.map(card => (
          <div key={card.title} className={`rounded-xl p-4 bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 flex flex-col items-center`}>
            <div className={`text-lg font-semibold text-${card.color}`}>{card.title}</div>
            <div className={`text-2xl font-bold text-${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ===== MIDDLE GRID: MMPs + Site Visits Summary + Costs/Schedule ===== */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-stretch">

        {/* ===== MMP Overview ===== */}
        <div className="flex flex-col h-full">
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-xl shadow-sm p-5 flex flex-col flex-1">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">MMP Overview</h3>
                <div className="text-xs text-muted-foreground mt-1">(Last 3 Months)</div>
              </div>
              <button className="text-sm text-primary font-medium hover:underline" onClick={() => navigate('/mmp')}>Manage</button>
            </div>
            <div className="space-y-2">
              {threeMonthGroups.map(group => (
                <details key={group.key} className="rounded-lg border border-neutral-100 bg-neutral-50 hover:shadow transition">
                  <summary className="font-medium flex justify-between items-center cursor-pointer px-3 py-2 text-base rounded-lg select-none focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <span>{group.monthLabel}</span>
                    <span className="text-muted-foreground text-sm">{group.items.length} files</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm px-3 pb-2">
                    {group.items.slice(0, 3).map(m => (
                      <li key={m.id} className="flex justify-between items-center py-1">
                        <span className="truncate">{m.projectName || m.mmpId}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.status === 'approved' ? 'bg-green-100 text-green-700' : m.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {m.status || 'unknown'}
                        </span>
                        <button className="text-xs text-primary hover:underline ml-2" onClick={() => navigate(`/mmp/${m.id}`)}>View</button>
                      </li>
                    ))}
                    {group.items.length === 0 && <li className="text-xs text-muted-foreground">No uploads</li>}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* ===== Site Visits Summary ===== */}
        <div className="flex flex-col h-full">
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-xl shadow-sm p-5 space-y-5 flex flex-col flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Site Visits</h3>
              <button className="text-sm text-primary font-medium hover:underline" onClick={() => navigate('/site-visits')}>Details</button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <div className="relative w-full sm:w-1/3">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  placeholder="Hub"
                  value={hubFilter}
                  onChange={e => setHubFilter(e.target.value)}
                  className="input input-sm w-full pl-8 rounded-lg border border-neutral-200 focus:ring-primary/30"
                  aria-label="Search for Hub"
                />
              </div>
              <div className="relative w-full sm:w-1/3">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  placeholder="Region"
                  value={regionFilter}
                  onChange={e => setRegionFilter(e.target.value)}
                  className="input input-sm w-full pl-8 rounded-lg border border-neutral-200 focus:ring-primary/30"
                  aria-label="Search for Region"
                />
              </div>
              <div className="relative w-full sm:w-1/3">
                <select
                  value={monthFilter}
                  onChange={e => setMonthFilter(e.target.value)}
                  className="input input-sm w-full rounded-lg border border-neutral-200 focus:ring-primary/30"
                  aria-label="Filter by Month"
                >
                  <option value="">All months</option>
                  {[0, 1, 2].map(i => {
                    const d = subMonths(new Date(), i);
                    const v = format(d, 'yyyy-MM');
                    return <option key={v} value={v}>{format(d, 'MMMM yyyy')}</option>;
                  })}
                </select>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{totalVisits}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-700">{completedCount}</div>
                <div className="text-xs text-green-700">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-700">{ongoingCount}</div>
                <div className="text-xs text-blue-700">Ongoing</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{scheduledCount}</div>
                <div className="text-xs text-amber-700">Scheduled</div>
              </div>
            </div>

            {/* Ongoing Site Visits */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="p-3 border border-neutral-100 rounded-lg bg-neutral-50">
                <div className="text-xs text-muted-foreground">Assigned</div>
                <div className="text-xl font-bold">{assignedCount}</div>
                <button className="text-xs text-primary mt-2 hover:underline" onClick={() => navigate('/site-visits?status=assigned')}>View</button>
              </div>
              <div className="p-3 border border-neutral-100 rounded-lg bg-neutral-50">
                <div className="text-xs text-muted-foreground">Unassigned</div>
                <div className="text-xl font-bold">{unassignedCount}</div>
                <button className="text-xs text-primary mt-2 hover:underline" onClick={() => navigate('/site-visits?status=pending')}>View</button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Costs & Upcoming Schedule ===== */}
        <div className="flex flex-col h-full space-y-5">
          {isFinanceOrAdmin && (
            <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-xl shadow-sm p-5 flex flex-col flex-1">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Cost of Site Visits</h3>
                <button className="text-sm text-primary font-medium hover:underline" onClick={() => navigate('/finance')}>Finance</button>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Total</span><span className="font-semibold">{costTotals.total.toLocaleString()} SDG</span></div>
                <div className="flex justify-between text-green-700"><span>Completed</span><span className="font-semibold">{costTotals.completed.toLocaleString()} SDG</span></div>
                <div className="flex justify-between text-blue-700"><span>Ongoing</span><span className="font-semibold">{costTotals.ongoing.toLocaleString()} SDG</span></div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded-xl shadow-sm p-5 flex flex-col flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upcoming Visits (Next 14 Days)</h3>
              <button className="text-sm text-primary font-medium hover:underline" onClick={() => navigate('/calendar')}>Calendar</button>
            </div>
            {upcoming.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {upcoming.map(u => (
                  <li key={u.id} className="flex justify-between items-center py-1">
                    <div className="truncate">{u.siteName || u.siteCode || 'Unnamed site'}</div>
                    <div className="text-xs text-muted-foreground">{u.dueDate ? format(new Date(u.dueDate), 'MMM d') : '-'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No upcoming visits scheduled.</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
