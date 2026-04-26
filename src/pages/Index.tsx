import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  MapPin,
  Users,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Zap,
  Shield,
  Clock,
  BarChart3,
  FileCheck,
  Radio,
  Loader2
} from "lucide-react";

interface KPIStats {
  liveSites: number;
  activeTeams: number;
  tasksCompleted: number;
  efficiency: number;
  liveSitesTrend: number;
  activeTeamsTrend: number;
  tasksCompletedTrend: number;
  efficiencyTrend: number;
}

const Index = () => {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState<KPIStats>({
    liveSites: 0,
    activeTeams: 0,
    tasksCompleted: 0,
    efficiency: 0,
    liveSitesTrend: 0,
    activeTeamsTrend: 0,
    tasksCompletedTrend: 0,
    efficiencyTrend: 0,
  });
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Fetch real stats from database
    fetchDashboardStats();

    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Cleanup timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      clearInterval(timeInterval);
    };
  }, []);

  const fetchDashboardStats = async () => {
    setIsLoadingStats(true);
    try {
      // Get current date ranges for trend calculation
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // ── MMP site entries — the actual source of truth for the "Live Sites",
      //    "Tasks Completed" and "Efficiency" tiles. The legacy queries used
      //    `site_entries` and `site_visits` (the latter was dropped by
      //    20250125_drop_site_visits_table.sql), which is why those tiles
      //    were stuck at 0.
      //
      //    Status values written by the MMP module are case-mixed
      //    ("Pending", "Dispatched", "Assigned", "Accepted", "In Progress",
      //    "Completed", "Rejected", ...) — see src/pages/MMP.tsx. We
      //    normalize to lowercase in JS so we don't have to enumerate every
      //    casing variant in the SQL filter.
      const { data: mmpEntries } = await supabase
        .from('mmp_site_entries')
        .select('id, status, created_at, updated_at');

      // Active teams (users with recent activity) — unchanged behavior.
      const { data: activeUsers } = await supabase
        .from('profiles')
        .select('id, updated_at')
        .gte('updated_at', thirtyDaysAgo.toISOString());

      const entries = mmpEntries ?? [];
      const norm = (s: unknown) =>
        String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

      // "Live" = currently in-progress: forwarded/dispatched/accepted but not
      // yet closed. We exclude terminal states (completed/cancelled/rejected)
      // and the very first "pending" stage (not yet forwarded).
      const LIVE = new Set([
        'dispatched', 'assigned', 'smartassigned', 'accepted',
        'inprogress', 'ongoing', 'started',
      ]);
      // "Done" = completed/verified/closed.
      const DONE = new Set(['completed', 'verified', 'closed', 'cpverified']);

      const liveSites = entries.filter(e => LIVE.has(norm(e.status))).length;
      const tasksCompleted = entries.filter(e => DONE.has(norm(e.status))).length;
      const totalEntries = entries.length;

      // Efficiency = completed / total, one decimal place.
      const efficiency = totalEntries > 0
        ? Math.round((tasksCompleted / totalEntries) * 1000) / 10
        : 0;

      const activeTeams = activeUsers?.length || 0;

      // Trends: last 30 days vs prior 30 days, same shape as before.
      // Live trend uses created_at (when the site entered the workflow).
      // Completed trend uses updated_at (when status was last changed —
      // reasonable proxy for completion time without an explicit completed_at).
      const inWindow = (iso: string | null | undefined, start: Date, end: Date) => {
        if (!iso) return false;
        const d = new Date(iso);
        return d >= start && d < end;
      };

      const recentLive = entries.filter(e =>
        LIVE.has(norm(e.status)) && inWindow(e.created_at, thirtyDaysAgo, now)
      ).length;
      const olderLive = entries.filter(e =>
        LIVE.has(norm(e.status)) && inWindow(e.created_at, sixtyDaysAgo, thirtyDaysAgo)
      ).length;
      const liveSitesTrend = olderLive > 0
        ? Math.round(((recentLive - olderLive) / olderLive) * 100)
        : (recentLive > 0 ? 100 : 0);

      const recentDone = entries.filter(e => {
        if (!DONE.has(norm(e.status))) return false;
        return inWindow(e.updated_at || e.created_at, thirtyDaysAgo, now);
      }).length;
      const olderDone = entries.filter(e => {
        if (!DONE.has(norm(e.status))) return false;
        return inWindow(e.updated_at || e.created_at, sixtyDaysAgo, thirtyDaysAgo);
      }).length;
      const tasksCompletedTrend = olderDone > 0
        ? Math.round(((recentDone - olderDone) / olderDone) * 100)
        : (recentDone > 0 ? 100 : 0);

      // Efficiency trend: compare 30-day-window efficiency to prior-30-day-window.
      const recentTotal = entries.filter(e =>
        inWindow(e.created_at, thirtyDaysAgo, now)
      ).length;
      const olderTotal = entries.filter(e =>
        inWindow(e.created_at, sixtyDaysAgo, thirtyDaysAgo)
      ).length;
      const recentEff = recentTotal > 0 ? (recentDone / recentTotal) * 100 : 0;
      const olderEff = olderTotal > 0 ? (olderDone / olderTotal) * 100 : 0;
      const efficiencyTrend = olderEff > 0
        ? Math.round(((recentEff - olderEff) / olderEff) * 100)
        : (recentEff > 0 ? Math.round(recentEff) : 0);

      setStats({
        liveSites,
        activeTeams,
        tasksCompleted,
        efficiency,
        liveSitesTrend,
        activeTeamsTrend: activeTeams > 0 ? Math.min(Math.round(activeTeams / 5), 50) : 0,
        tasksCompletedTrend,
        efficiencyTrend,
      });
    } catch (error) {
      // One-time console.error, then fall back to zeros so the strip never
      // gets stuck on "..." or breaks the layout.
      console.error('Error fetching dashboard stats:', error);
      setStats({
        liveSites: 0,
        activeTeams: 0,
        tasksCompleted: 0,
        efficiency: 0,
        liveSitesTrend: 0,
        activeTeamsTrend: 0,
        tasksCompletedTrend: 0,
        efficiencyTrend: 0,
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleGetStarted = () => {
    setIsNavigating(true);
    // Add a smooth transition delay
    navigationTimeoutRef.current = setTimeout(() => {
      navigate("/auth");
    }, 800);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return num.toLocaleString();
    }
    return num.toString();
  };

  const formatTrend = (trend: number): string => {
    if (trend === 0) return "0%";
    return trend > 0 ? `+${trend}%` : `${trend}%`;
  };

  const kpiData = [
    { 
      icon: Activity, 
      label: "Live Sites", 
      value: isLoadingStats ? "..." : formatNumber(stats.liveSites), 
      trend: formatTrend(stats.liveSitesTrend),
      isPositive: stats.liveSitesTrend >= 0
    },
    { 
      icon: Users, 
      label: "Active Teams", 
      value: isLoadingStats ? "..." : formatNumber(stats.activeTeams), 
      trend: formatTrend(stats.activeTeamsTrend),
      isPositive: stats.activeTeamsTrend >= 0
    },
    { 
      icon: CheckCircle2, 
      label: "Tasks Completed", 
      value: isLoadingStats ? "..." : formatNumber(stats.tasksCompleted), 
      trend: formatTrend(stats.tasksCompletedTrend),
      isPositive: stats.tasksCompletedTrend >= 0
    },
    { 
      icon: TrendingUp, 
      label: "Efficiency", 
      value: isLoadingStats ? "..." : `${stats.efficiency}%`, 
      trend: formatTrend(stats.efficiencyTrend),
      isPositive: stats.efficiencyTrend >= 0
    }
  ];

  const workflows = [
    {
      step: "01",
      title: "Plan & Upload",
      description: "Upload Monthly Monitoring Plans and assign to projects",
      icon: FileCheck,
      color: "text-blue-500 dark:text-blue-400"
    },
    {
      step: "02",
      title: "Coordinate Teams",
      description: "Assign site visits to field teams with real-time tracking",
      icon: MapPin,
      color: "text-orange-500 dark:text-orange-400"
    },
    {
      step: "03",
      title: "Monitor & Report",
      description: "Track progress and generate comprehensive analytics",
      icon: BarChart3,
      color: "text-purple-500 dark:text-purple-400"
    }
  ];

  const features = [
    { icon: Zap, label: "Real-time Updates", description: "Live data synchronization" },
    { icon: Shield, label: "Enterprise Security", description: "Enterprise-grade protection" },
    { icon: Radio, label: "Always Connected", description: "99.9% uptime SLA" },
    { icon: Clock, label: "24/7 Support", description: "Round-the-clock assistance" }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Loading Overlay */}
      {isNavigating && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-lg"
          data-testid="overlay-loading-navigation"
        >
          <div className="flex flex-col items-center gap-8">
            {/* PACT Logo with subtle pulse */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-orange-500/20 to-purple-500/20 dark:from-blue-400/20 dark:via-orange-400/20 dark:to-purple-400/20 rounded-full blur-xl animate-pulse" />
              <img 
                src={PactLogo} 
                alt="PACT" 
                className="h-28 w-28 md:h-32 md:w-32 relative z-10 drop-shadow-lg object-contain"
                style={{ imageRendering: 'crisp-edges' }}
              />
            </div>

            {/* Modern Gradient Spinner */}
            <div className="relative w-20 h-20">
              {/* Background rings */}
              <div className="absolute inset-0 rounded-full border-4 border-muted/20" />
              {/* Animated gradient ring */}
              <div className="absolute inset-0 rounded-full border-4 border-transparent bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-padding animate-spin" 
                   style={{ 
                     maskImage: 'linear-gradient(transparent 50%, black 50%)',
                     WebkitMaskImage: 'linear-gradient(transparent 50%, black 50%)'
                   }}
              />
              {/* Center gradient glow */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-r from-blue-500/10 via-orange-500/10 to-purple-500/10 dark:from-blue-400/10 dark:via-orange-400/10 dark:to-purple-400/10 animate-pulse" />
            </div>

            {/* Brand Gradient Text */}
            <div className="text-center space-y-2">
              <h2 
                className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-text text-transparent"
                data-testid="text-loading-title"
              >
                Initializing PACT
              </h2>
              <p 
                className="text-lg font-semibold bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-text text-transparent"
                data-testid="text-loading-subtitle"
              >
                Command Center
              </p>
              <p className="text-sm text-muted-foreground pt-2" data-testid="text-loading-message">
                Preparing your workspace...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Animated Background Layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-orange-500/5 to-purple-500/5 dark:from-blue-600/10 dark:via-orange-600/10 dark:to-purple-600/10" />
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-orange-500/20 dark:bg-orange-600/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>

      <div className="relative z-10">
        {/* Hero Section - Full Width */}
        <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            {/* Logo & Status Badge */}
            <div className="flex flex-col items-center gap-4">
              <img
                src={PactLogo}
                alt="PACT Logo"
                data-testid="img-logo"
                className="h-24 w-24 md:h-32 md:w-32 lg:h-40 lg:w-40 object-contain drop-shadow-lg"
                style={{ imageRendering: 'crisp-edges' }}
              />
              <Badge 
                variant="secondary" 
                className="gap-1.5 text-xs"
                data-testid="badge-status"
              >
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                System Operational
              </Badge>
            </div>

            {/* Hero Headline */}
            <div className="space-y-4">
              <h1 
                className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight"
                data-testid="heading-hero"
              >
                <span className="bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-text text-transparent">
                  Command Center
                </span>
                <br />
                <span className="text-foreground">
                  for Field Operations
                </span>
              </h1>
              
              <p 
                className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
                data-testid="text-hero-description"
              >
                Real-time monitoring, seamless coordination, and data-driven insights 
                for enterprise field teams. The PACT Workflow Platform transforms 
                how you manage operations.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
              <Button
                size="lg"
                onClick={handleGetStarted}
                disabled={isNavigating}
                data-testid="button-get-started"
                className="gap-2"
              >
                {isNavigating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Digital Clock */}
            <div className="flex flex-col items-center gap-2 pt-4" data-testid="clock-container">
              <div className="font-mono text-3xl md:text-4xl font-bold tracking-wider">
                {currentTime.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false 
                })}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentTime.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: true 
                })}
              </div>
              <p className="text-base font-medium text-muted-foreground">
                {currentTime.toLocaleDateString('en-US', { 
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long', 
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
        </section>

        {/* Live KPI Ribbon */}
        <section className="border-y bg-muted/30 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpiData.map((kpi, index) => {
                const Icon = kpi.icon;
                return (
                  <div 
                    key={index}
                    className="flex flex-col items-center gap-1"
                    data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xl md:text-2xl font-semibold">{kpi.value}</span>
                    </div>
                    <div className="text-center flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <Badge 
                        variant="secondary" 
                        className={`text-[10px] px-1.5 py-0 ${
                          kpi.isPositive 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {kpi.trend}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Workflow Timeline */}
        <section className="container mx-auto px-4 py-10 md:py-14">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <Badge variant="secondary" className="mb-3 text-xs" data-testid="badge-how-it-works">
                How It Works
              </Badge>
              <h2 
                className="text-2xl md:text-3xl font-semibold mb-2"
                data-testid="heading-workflow"
              >
                Streamlined Workflow in 3 Steps
              </h2>
              <p className="text-muted-foreground text-sm">
                From planning to execution, manage your entire operation seamlessly
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {workflows.map((workflow, index) => {
                const Icon = workflow.icon;
                return (
                  <Card 
                    key={index}
                    className="relative"
                    data-testid={`card-workflow-${workflow.step}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className={`p-3 rounded-full bg-muted ${workflow.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1.5">
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5">
                            {workflow.step}
                          </Badge>
                          <h3 className="text-base font-medium">
                            {workflow.title}
                          </h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {workflow.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-y bg-muted/20">
          <div className="container mx-auto px-4 py-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index}
                    className="flex flex-col items-center text-center gap-2"
                    data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="p-2 rounded-md bg-background border">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{feature.label}</p>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t bg-muted/10">
          <div className="container mx-auto px-4 py-8">
            <div className="mb-6 text-center max-w-3xl mx-auto">
              <img src={PactLogo} alt="PACT" className="h-10 w-10 mb-4 mx-auto" width={40} height={40} loading="lazy" />
              <h3 className="text-base font-medium mb-2">Built for the Field, Designed for Reliability</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                The <strong className="text-foreground">PACT Command Center Platform</strong> delivers powerful capabilities across web and mobile applications, 
                ensuring seamless operations whether you're in the office or in the field.
              </p>
              <div className="text-left space-y-3 max-w-2xl mx-auto">
                <div>
                  <h4 className="text-xs font-medium text-foreground mb-1">Web Platform</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The web-based <strong className="text-foreground">Command Center</strong> provides comprehensive oversight with 
                    <strong className="text-foreground"> real-time dashboard analytics</strong>, 
                    <strong className="text-foreground"> role-based access control</strong>, and 
                    <strong className="text-foreground"> live team tracking</strong>. 
                    Upload and manage Monthly Monitoring Plans, assign site visits to field teams, monitor progress with visual workflows, 
                    and generate detailed reports.
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-foreground mb-1">Mobile Application</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The mobile application empowers field teams with <strong className="text-foreground">full offline functionality</strong> - 
                    capture site visits, update data, and complete tasks even without internet connectivity. 
                    All changes automatically <strong className="text-foreground">sync when back online</strong>, ensuring no data is ever lost.
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t pt-4 text-center">
              <p className="text-xs text-muted-foreground" data-testid="text-copyright">
                &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
