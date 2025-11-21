import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
import {
  FolderKanban,
  MapPin,
  BarChart3,
  Users,
  CheckCircle2,
  TrendingUp,
  ArrowRight
} from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("mock_mmp_files")) {
      localStorage.setItem("mock_mmp_files", JSON.stringify([]));
    }
  }, []);

  const features = [
    {
      icon: FolderKanban,
      title: "Project Management",
      description: "Organize and track multiple projects with ease",
      color: "text-blue-600 dark:text-blue-400"
    },
    {
      icon: MapPin,
      title: "Field Operations",
      description: "Real-time site visit tracking and coordination",
      color: "text-orange-600 dark:text-orange-400"
    },
    {
      icon: BarChart3,
      title: "Advanced Reporting",
      description: "Comprehensive analytics and insights",
      color: "text-purple-600 dark:text-purple-400"
    }
  ];

  const stats = [
    { label: "Active Projects", value: "50+", icon: FolderKanban },
    { label: "Field Teams", value: "100+", icon: Users },
    { label: "Success Rate", value: "99%", icon: TrendingUp }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-orange-50/20 to-background dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute -top-32 -left-24 w-96 h-96 bg-blue-400/10 dark:bg-blue-600/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute top-1/2 -right-32 w-96 h-96 bg-orange-400/10 dark:bg-orange-600/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/10 rounded-full blur-3xl animate-blob animation-delay-4000" />

      <div className="relative z-10">
        {/* Hero Section */}
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="text-center lg:text-left space-y-8">
              <div className="flex justify-center lg:justify-start">
                <img
                  src={PactLogo}
                  alt="PACT Logo"
                  data-testid="img-logo"
                  className="h-24 w-24 md:h-28 md:w-28"
                />
              </div>

              <div className="space-y-4">
                <Badge 
                  variant="secondary" 
                  className="mb-2"
                  data-testid="badge-platform-status"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Trusted by Organizations Worldwide
                </Badge>
                
                <h1 
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold bg-gradient-to-r from-blue-600 to-orange-600 dark:from-blue-400 dark:to-orange-400 bg-clip-text text-transparent"
                  data-testid="heading-main"
                >
                  PACT Workflow Platform
                </h1>
                
                <p 
                  className="text-lg md:text-xl text-muted-foreground max-w-2xl"
                  data-testid="text-subtitle"
                >
                  Streamlined MMP Management System for seamless field operations. 
                  Empower your teams with real-time collaboration and data-driven insights.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button
                  size="lg"
                  onClick={() => navigate("/auth")}
                  data-testid="button-login"
                  className="gap-2"
                >
                  Continue to Login
                  <ArrowRight className="w-4 h-4" />
                </Button>
                
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  data-testid="button-learn-more"
                >
                  Learn More
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-8">
                {stats.map((stat, index) => (
                  <div 
                    key={index} 
                    className="text-center lg:text-left"
                    data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center justify-center lg:justify-start gap-2 mb-1">
                      <stat.icon className="w-4 h-4 text-muted-foreground" />
                      <p className="text-2xl md:text-3xl font-bold">{stat.value}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column - Feature Cards */}
            <div className="space-y-4">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card 
                    key={index} 
                    className="hover-elevate border-muted"
                    data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-md bg-muted ${feature.color}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-2">
                            {feature.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* Trust Section */}
        <div className="border-t bg-muted/20 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-wrap items-center justify-center gap-8 text-center">
              <div data-testid="trust-secure">
                <p className="text-sm text-muted-foreground mb-1">
                  Enterprise-Grade Security
                </p>
                <p className="text-xs text-muted-foreground">
                  SOC 2 Compliant
                </p>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div data-testid="trust-uptime">
                <p className="text-sm text-muted-foreground mb-1">
                  99.9% Uptime
                </p>
                <p className="text-xs text-muted-foreground">
                  Guaranteed Availability
                </p>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div data-testid="trust-support">
                <p className="text-sm text-muted-foreground mb-1">
                  24/7 Support
                </p>
                <p className="text-xs text-muted-foreground">
                  Always Here to Help
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p 
                className="text-sm text-muted-foreground"
                data-testid="text-copyright"
              >
                &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
              </p>
              
              <div className="flex gap-6">
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-privacy"
                >
                  Privacy Policy
                </a>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-terms"
                >
                  Terms of Service
                </a>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-support"
                >
                  Support
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
