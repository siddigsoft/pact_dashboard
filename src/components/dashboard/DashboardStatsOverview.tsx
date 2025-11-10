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

export const DashboardStatsOverview = () => {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const isLoaded = useProgressiveLoading(300);

  const { activeProjects, approvedMmps, completedVisits, pendingSiteVisits } = useDashboardStats();
  const { roles } = useAppContext();
  const isFinanceOrAdmin = roles?.includes('admin') || roles?.includes('financialAdmin');

  const { mmpFiles } = useMMP();
  const { siteVisits } = useSiteVisitContext();
  const navigate = useNavigate();

  // ====================== KPI CARDS ======================
  const statsToDisplay = [
    { title: 'Active Projects', value: activeProjects, description: 'Current ongoing projects', icon: <svg className="h-4 w-4 text-primary" /> },
    { title: 'Approved MMPs', value: approvedMmps, description: 'Total approved monitoring plans', icon: <svg className="h-4 w-4 text-primary" /> },
    { title: 'Completed Visits', value: completedVisits, description: 'Successfully completed site visits', icon: <svg className="h-4 w-4 text-primary" /> },
    { title: 'Pending Site Visits', value: pendingSiteVisits, description: 'Site visits requiring action', icon: <svg className="h-4 w-4 text-primary" /> },
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

  // ====================== LOADING STATE ======================
  if (!isLoaded) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  // ====================== DASHBOARD LAYOUT ======================
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ===== TOP KPIs ===== */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statsToDisplay.map((stat, index) => (
          <motion.div
            key={stat.title}
            variants={itemVariants}
            className="h-full"
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
            whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
          >
            <StatsCard
              {...stat}
              value={hoveredCard === index ? (
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.5 }}>
                  {stat.value}
                </motion.div>
              ) : stat.value}
            />
          </motion.div>
        ))}
      </div>

      {/* ===== MIDDLE GRID: MMPs + Site Visits Summary + Costs/Schedule ===== */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">

        {/* ===== MMP Overview ===== */}
        <div className="bg-white border rounded-lg shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">MMP Overview — Last 3 Months</h3>
            <button className="text-sm text-primary" onClick={() => navigate('/mmp')}>Manage</button>
          </div>
          <div className="space-y-2">
            {threeMonthGroups.map(group => (
              <details key={group.key} className="p-2 border rounded hover:shadow-sm">
                <summary className="font-medium flex justify-between cursor-pointer">
                  {group.monthLabel} <span className="text-muted-foreground">{group.items.length} files</span>
                </summary>
                <ul className="mt-1 space-y-1 text-sm">
                  {group.items.slice(0, 3).map(m => (
                    <li key={m.id} className="flex justify-between items-center">
                      <span className="truncate">{m.projectName || m.mmpId}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${m.status === 'approved' ? 'bg-green-100 text-green-800' : m.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {m.status || 'unknown'}
                      </span>
                      <button className="text-xs text-primary" onClick={() => navigate(`/mmp/${m.id}`)}>View</button>
                    </li>
                  ))}
                  {group.items.length === 0 && <li className="text-xs text-muted-foreground">No uploads</li>}
                </ul>
              </details>
            ))}
          </div>
        </div>

        {/* ===== Site Visits Summary ===== */}
        <div className="bg-white border rounded-lg shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Site Visits</h3>
            <button className="text-sm text-primary" onClick={() => navigate('/site-visits')}>Details</button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative w-full sm:w-1/3">
              <input
                placeholder="Search by Hub"
                value={hubFilter}
                onChange={e => setHubFilter(e.target.value)}
                className="input input-sm w-full pl-8"
              />
              <MagnifyingGlassIcon className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            </div>
            <div className="relative w-full sm:w-1/3">
              <input
                placeholder="Search by Region"
                value={regionFilter}
                onChange={e => setRegionFilter(e.target.value)}
                className="input input-sm w-full pl-8"
              />
              <MagnifyingGlassIcon className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            </div>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="input input-sm w-full sm:w-1/3">
              <option value="">All months</option>
              {[0, 1, 2].map(i => {
                const d = subMonths(new Date(), i);
                const v = format(d, 'yyyy-MM');
                return <option key={v} value={v}>{format(d, 'MMMM yyyy')}</option>;
              })}
            </select>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div><div className="text-2xl font-bold">{totalVisits}</div><div className="text-sm text-muted-foreground">Total</div></div>
            <div><div className="text-2xl font-bold text-green-700">{completedCount}</div><div className="text-sm text-green-700">Completed</div></div>
            <div><div className="text-2xl font-bold text-blue-700">{ongoingCount}</div><div className="text-sm text-blue-700">Ongoing</div></div>
            <div><div className="text-2xl font-bold text-amber-700">{scheduledCount}</div><div className="text-sm text-amber-700">Scheduled</div></div>
          </div>

          {/* Ongoing Site Visits */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 border rounded">
              <div className="text-sm text-muted-foreground">Assigned</div>
              <div className="text-2xl font-bold">{assignedCount}</div>
              <button className="text-sm text-primary mt-2" onClick={() => navigate('/site-visits?status=assigned')}>View</button>
            </div>
            <div className="p-3 border rounded">
              <div className="text-sm text-muted-foreground">Unassigned</div>
              <div className="text-2xl font-bold">{unassignedCount}</div>
              <button className="text-sm text-primary mt-2" onClick={() => navigate('/site-visits?status=pending')}>View</button>
            </div>
          </div>
        </div>

        {/* ===== Costs & Upcoming Schedule ===== */}
        <div className="space-y-4">
          {isFinanceOrAdmin && (
            <div className="bg-white border rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold">Cost of Site Visits</h3>
                <button className="text-sm text-primary" onClick={() => navigate('/finance')}>Finance</button>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>Total</span><span>{costTotals.total.toLocaleString()} SDG</span></div>
                <div className="flex justify-between text-green-700"><span>Completed</span><span>{costTotals.completed.toLocaleString()} SDG</span></div>
                <div className="flex justify-between text-blue-700"><span>Ongoing</span><span>{costTotals.ongoing.toLocaleString()} SDG</span></div>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">Upcoming Visits (Next 14 Days)</h3>
              <button className="text-sm text-primary" onClick={() => navigate('/calendar')}>Calendar</button>
            </div>
            {upcoming.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {upcoming.map(u => (
                  <li key={u.id} className="flex justify-between items-start">
                    <div className="truncate">{u.siteName || u.siteCode || 'Unnamed site'}</div>
                    <div className="text-xs">{u.dueDate ? format(new Date(u.dueDate), 'MMM d') : '-'}</div>
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
