import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Server, Users, Activity, Database, Shield, MonitorCheck, HardDrive, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppContext } from '@/context/AppContext';

export const ICTZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('health');
  const { roles } = useAppContext();

  const isICTOrAdmin = roles?.some(r => 
    r.toLowerCase() === 'admin' || r.toLowerCase() === 'ict'
  );

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Server className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">ICT Operations</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">System health, user management, and infrastructure</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 h-7 text-xs">
            <MonitorCheck className="h-3 w-3" />
            All Systems Operational
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md h-auto p-1 bg-muted/30">
          <TabsTrigger value="health" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MonitorCheck className="h-3.5 w-3.5" />
            <span className="text-xs">Health</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">Users</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Shield className="h-3.5 w-3.5" />
            <span className="text-xs">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Online</div>
                <p className="text-xs text-muted-foreground">Connection healthy</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Status</CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Active</div>
                <p className="text-xs text-muted-foreground">All endpoints responding</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">45%</div>
                <Progress value={45} className="mt-2 h-1" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Performance</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">Good</div>
                <p className="text-xs text-muted-foreground">Response time normal</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-600" />
                System Activity
              </CardTitle>
              <CardDescription>Recent system events and activity logs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm">System running normally</span>
                  <span className="text-xs text-muted-foreground ml-auto">Now</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                User Statistics
              </CardTitle>
              <CardDescription>Platform user registrations and activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-lg bg-muted/30 text-center">
                  <div className="text-3xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Total Users</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 text-center">
                  <div className="text-3xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Active Today</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 text-center">
                  <div className="text-3xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">New This Week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security Overview
              </CardTitle>
              <CardDescription>Authentication and access control status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm">Two-Factor Authentication</span>
                  </div>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm">Row Level Security</span>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm">SSL/TLS Encryption</span>
                  </div>
                  <Badge variant="secondary">Enforced</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
