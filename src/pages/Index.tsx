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
                className="h-20 w-20 relative z-10 drop-shadow-lg"
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
            <div className="flex flex-col items-center gap-3">
              <img
                src={PactLogo}
                alt="PACT Logo"
                data-testid="img-logo"
                className="h-14 w-14 md:h-16 md:w-16"
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
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
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
        <footer className="bg-gradient-to-b from-muted/30 to-muted/50">
          <div className="container mx-auto px-4 py-12">
            <div className="mb-8 text-center max-w-4xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={PactLogo} alt="PACT" className="h-12 w-12" />
                <div className="text-left">
                  <h3 className="text-xl font-bold tracking-tight">Built for the Field</h3>
                  <p className="text-sm text-muted-foreground">Designed for Reliability</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
                The <strong className="text-foreground">PACT Command Center Platform</strong> delivers powerful capabilities across web and mobile applications, 
                ensuring seamless operations whether you're in the office or in the field.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                <Card className="text-left">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                        <Radio className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          Web Platform
                          <Badge variant="secondary" className="text-[10px]">Full Access</Badge>
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Comprehensive oversight with <strong className="text-foreground">real-time dashboard analytics</strong>, 
                          <strong className="text-foreground"> role-based access control</strong>, and 
                          <strong className="text-foreground"> live team tracking</strong>. 
                          Manage MMPs, assign site visits, and generate detailed reports.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="text-left">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
                        <MapPin className="w-5 h-5 text-orange-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          Mobile Application
                          <Badge variant="secondary" className="text-[10px]">Offline Ready</Badge>
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Empowers field teams with <strong className="text-foreground">full offline functionality</strong> - 
                          capture site visits, update data, and complete tasks without connectivity. 
                          <strong className="text-foreground"> Auto-sync when online</strong>.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            <div className="pt-6 text-center border-t">
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
