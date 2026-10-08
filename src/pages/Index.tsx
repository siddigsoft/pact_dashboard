import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/context/AppContext";
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
  Loader2,
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

  const { currentUser, authReady } = useAppContext();

  useEffect(() => {
    if (authReady && currentUser) {
      navigate("/dashboard", { replace: true });
    }
  }, [authReady, currentUser, navigate]);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setIsLoadingStats(true);
    try {
      // Public landing KPIs via SECURITY DEFINER RPC (anon-safe aggregates).
      // See supabase/migrations/20260426_public_landing_kpis_rpc.sql.
      const { data, error } = await supabase.rpc("public_landing_kpis");
      if (error) throw error;

      const k = (data ?? {}) as Partial<{
        live_sites: number;
        active_teams: number;
        tasks_completed: number;
        efficiency: number;
        live_sites_trend: number;
        active_teams_trend: number;
        tasks_completed_trend: number;
        efficiency_trend: number;
      }>;

      setStats({
        liveSites: Number(k.live_sites ?? 0),
        activeTeams: Number(k.active_teams ?? 0),
        tasksCompleted: Number(k.tasks_completed ?? 0),
        efficiency: Number(k.efficiency ?? 0),
        liveSitesTrend: Number(k.live_sites_trend ?? 0),
        activeTeamsTrend: Number(k.active_teams_trend ?? 0),
        tasksCompletedTrend: Number(k.tasks_completed_trend ?? 0),
        efficiencyTrend: Number(k.efficiency_trend ?? 0),
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
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
    navigate("/auth");
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000) return num.toLocaleString();
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
      value: isLoadingStats ? "…" : formatNumber(stats.liveSites),
      trend: formatTrend(stats.liveSitesTrend),
      isPositive: stats.liveSitesTrend >= 0,
    },
    {
      icon: Users,
      label: "Active Teams",
      value: isLoadingStats ? "…" : formatNumber(stats.activeTeams),
      trend: formatTrend(stats.activeTeamsTrend),
      isPositive: stats.activeTeamsTrend >= 0,
    },
    {
      icon: CheckCircle2,
      label: "Tasks Completed",
      value: isLoadingStats ? "…" : formatNumber(stats.tasksCompleted),
      trend: formatTrend(stats.tasksCompletedTrend),
      isPositive: stats.tasksCompletedTrend >= 0,
    },
    {
      icon: TrendingUp,
      label: "Efficiency",
      value: isLoadingStats ? "…" : `${stats.efficiency}%`,
      trend: formatTrend(stats.efficiencyTrend),
      isPositive: stats.efficiencyTrend >= 0,
    },
  ];

  const workflows = [
    {
      step: "01",
      title: "Plan & Upload",
      description: "Upload Monthly Monitoring Plans and assign to projects",
      icon: FileCheck,
    },
    {
      step: "02",
      title: "Coordinate Teams",
      description: "Assign site visits to field teams with real-time tracking",
      icon: MapPin,
    },
    {
      step: "03",
      title: "Monitor & Report",
      description: "Track progress and generate comprehensive analytics",
      icon: BarChart3,
    },
  ];

  const features = [
    { icon: Zap, label: "Real-time Updates", description: "Live data synchronization" },
    { icon: Shield, label: "Enterprise Security", description: "Enterprise-grade protection" },
    { icon: Radio, label: "Always Connected", description: "99.9% uptime SLA" },
    { icon: Clock, label: "24/7 Support", description: "Round-the-clock assistance" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isNavigating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          data-testid="overlay-loading-navigation"
        >
          <div className="flex flex-col items-center gap-4">
            <img src={PactLogo} alt="PACT" className="h-16 w-16 object-contain" />
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-foreground/70" data-testid="text-loading-message">
              Opening sign in…
            </p>
          </div>
        </div>
      )}

      <main className="flex-1">
        <section className="container mx-auto px-4 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <img
              src={PactLogo}
              alt="PACT Logo"
              data-testid="img-logo"
              className="h-20 w-20 md:h-28 md:w-28 mx-auto object-contain"
            />

            <div className="space-y-3">
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground"
                data-testid="heading-hero"
              >
                Command Center
                <br />
                for Field Operations
              </h1>
              <p
                className="text-base md:text-lg text-foreground/70 max-w-2xl mx-auto leading-relaxed"
                data-testid="text-hero-description"
              >
                Real-time monitoring, seamless coordination, and data-driven insights
                for enterprise field teams. The PACT Workflow Platform transforms
                how you manage operations.
              </p>
            </div>

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
                  Loading…
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </section>

        <section className="border-y bg-muted/40">
          <div className="container mx-auto px-4 py-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpiData.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    className="flex flex-col items-center gap-1"
                    data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-4 h-4 text-foreground/70" />
                      <span className="text-xl md:text-2xl font-semibold tabular-nums text-foreground">
                        {kpi.value}
                      </span>
                    </div>
                    <div className="text-center flex items-center gap-1.5">
                      <p className="text-xs text-foreground/65">{kpi.label}</p>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 tabular-nums ${
                          kpi.isPositive
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
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

        <section className="container mx-auto px-4 py-10 md:py-14">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/60" data-testid="badge-how-it-works">
                How It Works
              </p>
              <h2
                className="text-2xl md:text-3xl font-semibold text-foreground"
                data-testid="heading-workflow"
              >
                Streamlined Workflow in 3 Steps
              </h2>
              <p className="text-sm text-foreground/70">
                From planning to execution, manage your entire operation seamlessly
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {workflows.map((workflow) => {
                const Icon = workflow.icon;
                return (
                  <Card key={workflow.step} data-testid={`card-workflow-${workflow.step}`}>
                    <CardContent className="p-5">
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="p-3 rounded-md bg-muted text-foreground">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1.5">
                          <p className="font-mono text-[11px] text-foreground/60">{workflow.step}</p>
                          <h3 className="text-base font-medium text-foreground">{workflow.title}</h3>
                          <p className="text-xs text-foreground/70 leading-relaxed">
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

        <section className="border-y bg-muted/30">
          <div className="container mx-auto px-4 py-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.label}
                    className="flex flex-col items-center text-center gap-2"
                    data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="p-2 rounded-md bg-background border border-border">
                      <Icon className="w-4 h-4 text-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{feature.label}</p>
                      <p className="text-xs text-foreground/70">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6 text-center max-w-3xl mx-auto">
            <img src={PactLogo} alt="PACT" className="h-10 w-10 mb-4 mx-auto" width={40} height={40} loading="lazy" />
            <h3 className="text-base font-medium mb-2 text-foreground">
              Built for the Field, Designed for Reliability
            </h3>
            <p className="text-xs text-foreground/70 leading-relaxed mb-4">
              The <strong className="text-foreground font-medium">PACT Command Center Platform</strong> delivers
              powerful capabilities across web and mobile applications, ensuring seamless operations
              whether you&apos;re in the office or in the field.
            </p>
            <div className="text-left space-y-3 max-w-2xl mx-auto">
              <div>
                <h4 className="text-xs font-medium text-foreground mb-1">Web Platform</h4>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  The web-based <strong className="text-foreground font-medium">Command Center</strong> provides
                  comprehensive oversight with{" "}
                  <strong className="text-foreground font-medium">real-time dashboard analytics</strong>,{" "}
                  <strong className="text-foreground font-medium">role-based access control</strong>, and{" "}
                  <strong className="text-foreground font-medium">live team tracking</strong>. Upload and manage
                  Monthly Monitoring Plans, assign site visits to field teams, monitor progress with visual
                  workflows, and generate detailed reports.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-foreground mb-1">Mobile Application</h4>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  The mobile application empowers field teams with{" "}
                  <strong className="text-foreground font-medium">full offline functionality</strong>: capture
                  site visits, update data, and complete tasks even without internet connectivity. All changes
                  automatically <strong className="text-foreground font-medium">sync when back online</strong>,
                  ensuring no data is ever lost.
                </p>
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-center">
            <p className="text-xs text-foreground/60" data-testid="text-copyright">
              &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
