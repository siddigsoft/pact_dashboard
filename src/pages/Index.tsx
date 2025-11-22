import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
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

const Index = () => {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("mock_mmp_files")) {
      localStorage.setItem("mock_mmp_files", JSON.stringify([]));
    }

    // Cleanup timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleGetStarted = () => {
    setIsNavigating(true);
    // Add a smooth transition delay
    navigationTimeoutRef.current = setTimeout(() => {
      navigate("/auth");
    }, 800);
  };

  const kpiData = [
    { icon: Activity, label: "Live Sites", value: "127", trend: "+12%" },
    { icon: Users, label: "Active Teams", value: "43", trend: "+8%" },
    { icon: CheckCircle2, label: "Tasks Completed", value: "2,847", trend: "+23%" },
    { icon: TrendingUp, label: "Efficiency", value: "98.5%", trend: "+5%" }
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
    { icon: Shield, label: "Enterprise Security", description: "SOC 2 compliant" },
    { icon: Radio, label: "Always Connected", description: "99.9% uptime SLA" },
    { icon: Clock, label: "24/7 Support", description: "Round-the-clock assistance" }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Loading Overlay */}
      {isNavigating && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
          data-testid="overlay-loading-navigation"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/30 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-foreground" data-testid="text-loading-title">
                Initializing Command Center
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-loading-message">
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
        <section className="container mx-auto px-4 pt-20 pb-16 md:pt-32 md:pb-24">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            {/* Logo & Status Badge */}
            <div className="flex flex-col items-center gap-4">
              <img
                src={PactLogo}
                alt="PACT Logo"
                data-testid="img-logo"
                className="h-20 w-20 md:h-24 md:w-24"
              />
              <Badge 
                variant="secondary" 
                className="gap-2"
                data-testid="badge-status"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                System Operational
              </Badge>
            </div>

            {/* Hero Headline */}
            <div className="space-y-6">
              <h1 
                className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight"
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
                className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto"
                data-testid="text-hero-description"
              >
                Real-time monitoring, seamless coordination, and data-driven insights 
                for enterprise field teams. The PACT Workflow Platform transforms 
                how you manage operations.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Button
                size="lg"
                onClick={handleGetStarted}
                disabled={isNavigating}
                data-testid="button-get-started"
                className="gap-2 text-lg px-8 relative"
              >
                {isNavigating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Live KPI Ribbon */}
        <section className="border-y bg-muted/30 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {kpiData.map((kpi, index) => {
                const Icon = kpi.icon;
                return (
                  <div 
                    key={index}
                    className="flex flex-col items-center gap-2"
                    data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <span className="text-2xl md:text-3xl font-bold">{kpi.value}</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <Badge variant="secondary" className="text-xs mt-1">
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
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="secondary" className="mb-4" data-testid="badge-how-it-works">
                How It Works
              </Badge>
              <h2 
                className="text-3xl md:text-4xl font-bold mb-4"
                data-testid="heading-workflow"
              >
                Streamlined Workflow in 3 Steps
              </h2>
              <p className="text-muted-foreground text-lg">
                From planning to execution, manage your entire operation seamlessly
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {workflows.map((workflow, index) => {
                const Icon = workflow.icon;
                return (
                  <Card 
                    key={index}
                    className="relative hover-elevate"
                    data-testid={`card-workflow-${workflow.step}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`p-4 rounded-full bg-muted ${workflow.color}`}>
                          <Icon className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                          <Badge variant="outline" className="font-mono">
                            {workflow.step}
                          </Badge>
                          <h3 className="text-xl font-semibold">
                            {workflow.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
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
          <div className="container mx-auto px-4 py-16">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index}
                    className="flex flex-col items-center text-center gap-3"
                    data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="p-3 rounded-md bg-background border">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{feature.label}</p>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t bg-muted/10">
          <div className="container mx-auto px-4 py-12">
            <div className="mb-8 text-center max-w-4xl mx-auto">
              <img src={PactLogo} alt="PACT" className="h-16 w-16 mb-6 mx-auto" />
              <h3 className="text-xl font-bold mb-4">Built for the Field, Designed for Reliability</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                The <strong className="text-foreground">PACT Command Center Platform</strong> delivers powerful capabilities across web and mobile applications, 
                ensuring seamless operations whether you're in the office or in the field.
              </p>
              <div className="text-left space-y-4 max-w-3xl mx-auto">
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">🖥️ Web Platform</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The web-based <strong className="text-foreground">Command Center</strong> provides comprehensive oversight with 
                    <strong className="text-foreground"> real-time dashboard analytics</strong>, 
                    <strong className="text-foreground"> role-based access control</strong>, and 
                    <strong className="text-foreground"> live team tracking</strong>. 
                    Upload and manage Monthly Monitoring Plans, assign site visits to field teams, monitor progress with visual workflows, 
                    and generate detailed reports. Advanced <strong className="text-foreground">financial tracking</strong> and 
                    <strong className="text-foreground"> budget management</strong> tools ensure complete visibility into project costs and resource allocation.
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">📱 Mobile Application</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The mobile application empowers field teams with <strong className="text-foreground">full offline functionality</strong> - 
                    capture site visits, update data, and complete tasks even without internet connectivity. 
                    All changes automatically <strong className="text-foreground">sync when back online</strong>, ensuring no data is ever lost. 
                    Advanced <strong className="text-foreground">interactive maps with real-time GPS tracking</strong> help teams navigate efficiently, while 
                    <strong className="text-foreground"> geofencing technology</strong> automatically triggers location-based actions and verifies site arrivals. 
                    Whether in remote areas or underground facilities, your teams stay productive and connected.
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t pt-8 text-center">
              <p className="text-sm text-muted-foreground" data-testid="text-copyright">
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
