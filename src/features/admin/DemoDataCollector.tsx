import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Wallet,
  TrendingUp,
  Flame,
  RefreshCw,
  Navigation,
  Phone,
  Mail,
  HelpCircle,
  Award,
  ArrowLeft,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { format, addDays } from 'date-fns';

const DEMO_VISITS = [
  {
    id: '1',
    siteName: 'Al-Rashid Health Center',
    locality: 'Khartoum North',
    status: 'assigned',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    priority: 'high',
    distance: '2.3 km',
  },
  {
    id: '2',
    siteName: 'Omdurman Primary School',
    locality: 'Omdurman',
    status: 'assigned',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    priority: 'medium',
    distance: '5.1 km',
  },
  {
    id: '3',
    siteName: 'Bahri Community Center',
    locality: 'Bahri',
    status: 'inProgress',
    dueDate: format(addDays(new Date(), -1), 'yyyy-MM-dd'),
    priority: 'high',
    distance: '1.8 km',
  },
  {
    id: '4',
    siteName: 'Port Sudan Clinic',
    locality: 'Port Sudan',
    status: 'completed',
    dueDate: format(addDays(new Date(), -2), 'yyyy-MM-dd'),
    priority: 'low',
    completedAt: format(addDays(new Date(), -2), 'yyyy-MM-dd HH:mm'),
  },
  {
    id: '5',
    siteName: 'Kassala Rural Health Post',
    locality: 'Kassala',
    status: 'completed',
    dueDate: format(addDays(new Date(), -3), 'yyyy-MM-dd'),
    priority: 'medium',
    completedAt: format(addDays(new Date(), -3), 'yyyy-MM-dd HH:mm'),
  },
];

const DEMO_TRANSACTIONS = [
  { id: '1', type: 'earning', amount: 1500, description: 'Site visit completion bonus', date: format(new Date(), 'MMM dd') },
  { id: '2', type: 'earning', amount: 2000, description: 'Weekly performance bonus', date: format(addDays(new Date(), -3), 'MMM dd') },
  { id: '3', type: 'withdrawal', amount: -1000, description: 'Mobile money transfer', date: format(addDays(new Date(), -5), 'MMM dd') },
];

export default function DemoDataCollector() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('my-visits');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  const todaysVisits = DEMO_VISITS.filter(v => v.dueDate === format(new Date(), 'yyyy-MM-dd'));
  const inProgressVisits = DEMO_VISITS.filter(v => v.status === 'inProgress');
  const completedVisits = DEMO_VISITS.filter(v => v.status === 'completed');
  const overdueVisits = DEMO_VISITS.filter(v => v.status !== 'completed' && new Date(v.dueDate) < new Date());

  const totalAssigned = DEMO_VISITS.length;
  const completionRate = Math.round((completedVisits.length / totalAssigned) * 100);
  const walletBalance = 12500;
  const thisMonthEarnings = 3500;
  const streak = 5;
  const averageVisitTime = 45;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Assigned</Badge>;
      case 'inProgress':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">In Progress</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  const containerClass = viewMode === 'mobile' 
    ? 'max-w-[390px] mx-auto border-x border-border shadow-xl min-h-screen' 
    : 'w-full';

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Mode Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-b backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/login')}
              data-testid="button-back-login"
              aria-label="Back to login"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Login
            </Button>
            <Badge variant="secondary" className="bg-primary/20 text-primary">
              Demo Mode
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">View:</span>
            <Button
              variant={viewMode === 'desktop' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('desktop')}
              data-testid="button-view-desktop"
              aria-label="Desktop view"
            >
              <Monitor className="h-4 w-4 mr-1" />
              Desktop
            </Button>
            <Button
              variant={viewMode === 'mobile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('mobile')}
              data-testid="button-view-mobile"
              aria-label="Mobile view"
            >
              <Smartphone className="h-4 w-4 mr-1" />
              Mobile
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={containerClass}>
        <div className={`p-4 ${viewMode === 'mobile' ? 'p-3' : 'md:p-8'} space-y-6`}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className={`font-bold ${viewMode === 'mobile' ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
                  Data Collector Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage your site visits and track your performance
                </p>
              </div>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className={`grid gap-3 ${viewMode === 'mobile' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'} sm:gap-4`}>
            <GradientStatCard
              title="Assigned"
              value={totalAssigned}
              subtitle="Total visits"
              icon={Target}
              color="blue"
            />
            <GradientStatCard
              title="Today"
              value={todaysVisits.length}
              subtitle="Due today"
              icon={Calendar}
              color="orange"
            />
            <GradientStatCard
              title="In Progress"
              value={inProgressVisits.length}
              subtitle="Active now"
              icon={Play}
              color="cyan"
            />
            <GradientStatCard
              title="Completed"
              value={completedVisits.length}
              subtitle={`${completionRate}% rate`}
              icon={CheckCircle2}
              color="green"
            />
            <GradientStatCard
              title="Overdue"
              value={overdueVisits.length}
              subtitle={overdueVisits.length > 0 ? "Needs attention" : "All on time"}
              icon={AlertCircle}
              color={overdueVisits.length > 0 ? "orange" : "green"}
            />
            <GradientStatCard
              title="Earnings"
              value={`${walletBalance.toLocaleString()} SDG`}
              subtitle={`${thisMonthEarnings.toLocaleString()} this month`}
              icon={Wallet}
              color="purple"
            />
          </div>

          {/* Location Update Card */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">Location Sharing</h3>
                      <Badge variant="default" className="bg-green-600 w-fit">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    </div>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      Share your location to appear on the team map and receive nearby site visit assignments.
                    </p>
                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      <div>
                        <span className="font-medium">Current Location:</span> Lat: 15.5007, Lng: 32.5599
                      </div>
                      <div>
                        <span className="font-medium">Last Updated:</span> {format(new Date(), 'MMM dd, yyyy h:mm:ss a')}
                      </div>
                    </div>
                  </div>
                </div>
                <Button className="flex-shrink-0 gap-2 min-h-[44px] px-4">
                  <RefreshCw className="h-4 w-4" />
                  Update Location
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Streak & Performance Banner */}
          <Card className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-600" />
                    <div>
                      <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        {streak} Day Streak
                      </div>
                      <div className="text-xs text-orange-700 dark:text-orange-300">
                        Keep it up!
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Avg: {averageVisitTime} min
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Per visit
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center sm:text-right">
                  <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                    {completionRate}%
                  </div>
                  <div className="text-xs text-orange-700 dark:text-orange-300">
                    Completion Rate
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Tabs */}
          <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
            <CardContent className="p-2">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className={`grid w-full h-auto p-0.5 bg-transparent border border-border/30 gap-1 ${viewMode === 'mobile' ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-5'}`}>
                  <TabsTrigger 
                    value="my-visits" 
                    className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
                  >
                    <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-primary" />
                    </div>
                    <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Visits</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="schedule" 
                    className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
                  >
                    <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Schedule</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="wallet" 
                    className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
                  >
                    <div className="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Wallet</span>
                  </TabsTrigger>
                  {viewMode !== 'mobile' && (
                    <>
                      <TabsTrigger 
                        value="performance" 
                        className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
                      >
                        <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Stats</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="help" 
                        className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-gray-500/10 data-[state=active]:border-gray-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
                      >
                        <div className="w-5 h-5 rounded bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                          <HelpCircle className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Help</span>
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>

                <TabsContent value="my-visits" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">My Site Visits</h3>
                    <Badge variant="outline">{DEMO_VISITS.length} total</Badge>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 pr-2">
                      {DEMO_VISITS.map((visit) => (
                        <Card key={visit.id} className="hover-elevate cursor-pointer">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">{visit.siteName}</h4>
                                <p className="text-xs text-muted-foreground">{visit.locality}</p>
                              </div>
                              {getStatusBadge(visit.status)}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(visit.dueDate), 'MMM dd')}
                                </span>
                                {visit.distance && (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Navigation className="h-3 w-3" />
                                    {visit.distance}
                                  </span>
                                )}
                              </div>
                              {getPriorityBadge(visit.priority)}
                            </div>
                            {visit.status === 'assigned' && (
                              <div className="mt-3 flex gap-2">
                                <Button size="sm" className="flex-1 h-9">
                                  <Play className="h-3 w-3 mr-1" />
                                  Start Visit
                                </Button>
                                <Button size="sm" variant="outline" className="h-9">
                                  <Navigation className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="schedule" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        This Week's Schedule
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
                          <div key={day} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                            <span className="text-sm font-medium">{day}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant={i < 2 ? 'default' : 'outline'} className="text-xs">
                                {i < 2 ? '2 visits' : i === 2 ? '1 visit' : 'No visits'}
                              </Badge>
                              {i < 2 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="wallet" className="mt-4 space-y-4">
                  <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-purple-200">Available Balance</span>
                        <Wallet className="h-5 w-5 text-purple-200" />
                      </div>
                      <div className="text-3xl font-bold mb-1">
                        {walletBalance.toLocaleString()} SDG
                      </div>
                      <div className="text-sm text-purple-200">
                        +{thisMonthEarnings.toLocaleString()} this month
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Recent Transactions</h4>
                    {DEMO_TRANSACTIONS.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'earning' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {tx.type === 'earning' ? <TrendingUp className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">{tx.date}</p>
                          </div>
                        </div>
                        <span className={`font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} SDG
                        </span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="performance" className="mt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Award className="h-4 w-4 text-amber-500" />
                          Performance Score
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-amber-600">87%</div>
                        <Progress value={87} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-2">Above average</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-500" />
                          Monthly Target
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-600">12/20</div>
                        <Progress value={60} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-2">8 more to reach target</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="help" className="mt-4">
                  <div className="space-y-3">
                    <Card className="hover-elevate cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Phone className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Call Support</h4>
                          <p className="text-xs text-muted-foreground">Get help from your supervisor</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="hover-elevate cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                          <Mail className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Send Message</h4>
                          <p className="text-xs text-muted-foreground">Chat with your team</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="hover-elevate cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                          <HelpCircle className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">FAQs</h4>
                          <p className="text-xs text-muted-foreground">Common questions answered</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
