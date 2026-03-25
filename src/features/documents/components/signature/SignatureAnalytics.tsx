/**
 * SignatureAnalytics Component
 * Dashboard showing signature completion rates, trends, and insights
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileSignature, 
  TrendingUp,
  TrendingDown,
  Pen,
  Type,
  Fingerprint,
  Clock,
  CheckCircle2,
  Smartphone,
  Globe,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

interface SignatureAnalyticsProps {
  className?: string;
}

interface AnalyticsData {
  overview: {
    totalSignatures: number;
    completionRate: number;
    avgTimeToSign: number;
    biometricUsage: number;
    trend: number;
  };
  byModule: {
    module: string;
    total: number;
    completed: number;
    rate: number;
  }[];
  byMethod: {
    method: string;
    count: number;
    percentage: number;
  }[];
  byDevice: {
    platform: string;
    count: number;
  }[];
  timeline: {
    date: string;
    signatures: number;
    biometric: number;
  }[];
  topSigners: {
    userId: string;
    userName: string;
    count: number;
    avgTime: number;
  }[];
}

const COLORS = ['#000000', '#404040', '#808080', '#c0c0c0'];

export function SignatureAnalytics({ className }: SignatureAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mock analytics data
      const mockData: AnalyticsData = {
        overview: {
          totalSignatures: 1247,
          completionRate: 94.2,
          avgTimeToSign: 12,
          biometricUsage: 68,
          trend: 12.5,
        },
        byModule: [
          { module: 'Site Visits', total: 520, completed: 498, rate: 95.8 },
          { module: 'Cost Submissions', total: 380, completed: 352, rate: 92.6 },
          { module: 'Handovers', total: 180, completed: 175, rate: 97.2 },
          { module: 'Retainers', total: 95, completed: 88, rate: 92.6 },
          { module: 'Wallet Transactions', total: 72, completed: 70, rate: 97.2 },
        ],
        byMethod: [
          { method: 'drawn', count: 780, percentage: 62.5 },
          { method: 'typed', count: 320, percentage: 25.7 },
          { method: 'biometric', count: 147, percentage: 11.8 },
        ],
        byDevice: [
          { platform: 'Android', count: 720 },
          { platform: 'iOS', count: 412 },
          { platform: 'Web', count: 115 },
        ],
        timeline: [
          { date: 'Week 1', signatures: 280, biometric: 180 },
          { date: 'Week 2', signatures: 310, biometric: 205 },
          { date: 'Week 3', signatures: 295, biometric: 195 },
          { date: 'Week 4', signatures: 362, biometric: 268 },
        ],
        topSigners: [
          { userId: '1', userName: 'Ahmed Hassan', count: 45, avgTime: 8 },
          { userId: '2', userName: 'Fatima Ali', count: 42, avgTime: 10 },
          { userId: '3', userName: 'Mohamed Osman', count: 38, avgTime: 12 },
          { userId: '4', userName: 'Sara Ibrahim', count: 35, avgTime: 9 },
          { userId: '5', userName: 'Omar Khalil', count: 32, avgTime: 14 },
        ],
      };

      setData(mockData);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const methodIcons = {
    drawn: Pen,
    typed: Type,
    biometric: Fingerprint,
  };

  const methodLabels = {
    drawn: 'Hand Drawn',
    typed: 'Typed',
    biometric: 'Biometric',
  };

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Signature Analytics</h2>
          <p className="text-muted-foreground">Insights and trends for digital signatures</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[150px]" data-testid="select-period" aria-label="Select time period">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-signatures">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Signatures</p>
                <p className="text-2xl font-bold">{data.overview.totalSignatures.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1">
                  {data.overview.trend > 0 ? (
                    <TrendingUp className="h-4 w-4 text-black dark:text-white" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-black dark:text-white" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {data.overview.trend > 0 ? '+' : ''}{data.overview.trend}% vs last period
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <FileSignature className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-completion-rate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">{data.overview.completionRate}%</p>
                <Progress value={data.overview.completionRate} className="h-1 mt-2 w-24" />
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-time">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Time to Sign</p>
                <p className="text-2xl font-bold">{data.overview.avgTimeToSign}s</p>
                <p className="text-xs text-muted-foreground mt-1">seconds per signature</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-biometric-usage">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Biometric Usage</p>
                <p className="text-2xl font-bold">{data.overview.biometricUsage}%</p>
                <Progress value={data.overview.biometricUsage} className="h-1 mt-2 w-24" />
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <Fingerprint className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature Trend</CardTitle>
            <CardDescription>Weekly signature volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="signatures" 
                    stroke="#000000" 
                    strokeWidth={2}
                    name="Total"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="biometric" 
                    stroke="#808080" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Biometric"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Module */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatures by Module</CardTitle>
            <CardDescription>Completion rates across modules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byModule} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="module" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="completed" fill="#000000" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Method & Device Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* By Method */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.byMethod.map((item) => {
                const Icon = methodIcons[item.method as keyof typeof methodIcons];
                return (
                  <div key={item.method} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium">
                        {methodLabels[item.method as keyof typeof methodLabels]}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{item.count}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({item.percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* By Device */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.byDevice.map((item, index) => (
                <div key={item.platform} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                      {item.platform === 'Web' ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <Smartphone className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{item.platform}</span>
                  </div>
                  <span className="font-bold">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Signers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Signers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topSigners.slice(0, 5).map((signer, index) => (
                <div key={signer.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {signer.userName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">{signer.count}</span>
                    <span className="text-xs text-muted-foreground block">
                      {signer.avgTime}s avg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SignatureAnalytics;
