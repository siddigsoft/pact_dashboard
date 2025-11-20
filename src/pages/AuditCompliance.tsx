import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Shield, ChartBar, Download, Bell, Filter, Calendar, Clock } from "lucide-react";
import AuditLogViewer from "@/components/AuditLogViewer";
import ComplianceTracker from "@/components/ComplianceTracker";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportAuditLogsToCSV } from "@/utils/exportUtils";

const AuditCompliancePage = () => {
  const [activeSection, setActiveSection] = useState<string>("audit-logs");
  const [timeFrame, setTimeFrame] = useState<string>("all");
  const [actionType, setActionType] = useState<string>("all");
  const { toast } = useToast();
  
  const handleGenerateReport = () => {
    toast({
      title: "Report Generation Started",
      description: "Your comprehensive audit and compliance report is being prepared."
    });
    
    setTimeout(() => {
      try {
        const mockAuditData = [
          {
            timestamp: new Date().toISOString(),
            action: "Export",
            category: "Audit",
            description: "Comprehensive audit report generated",
            user: "Current User", 
            userRole: "Admin",
            details: "Report includes all logs from selected time period",
            status: "success"
          },
        ];
        
        exportAuditLogsToCSV(mockAuditData, `comprehensive-audit-report-${new Date().toISOString().split('T')[0]}.csv`);
        
        toast({
          title: "Report Ready",
          description: "The report has been generated and downloaded to your device."
        });
      } catch (error) {
        console.error("Report generation error:", error);
        toast({
          title: "Report Generation Failed",
          description: "There was an error generating the report. Please try again.",
          variant: "destructive"
        });
      }
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
          <p className="text-muted-foreground">
            Comprehensive audit logs and compliance tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateReport}>
            <ChartBar className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <Button onClick={() => {
            const mockAuditData = [];
            exportAuditLogsToCSV(mockAuditData, `audit-data-export-${new Date().toISOString().split('T')[0]}.csv`);
            toast({
              title: "Data Exported",
              description: "All audit data has been exported successfully."
            });
          }}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Audit Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Today</span>
                <span className="font-medium">24 events</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">This Week</span>
                <span className="font-medium">142 events</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">This Month</span>
                <span className="font-medium">516 events</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground">Critical Events</span>
                <Badge className="bg-red-100 text-red-800">5</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Compliance Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overall Score</span>
                <span className="font-medium">86%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Critical Issues</span>
                <span className="font-medium text-red-600">2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Warnings</span>
                <span className="font-medium text-amber-600">7</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground">Status</span>
                <Badge className="bg-amber-100 text-amber-800">Needs Attention</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  New compliance policy updated for budget validation
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  Unauthorized MMP edit attempt detected
                </span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  MMP file with validation warnings uploaded
                </span>
              </div>
              <div className="pt-2 border-t text-right">
                <Button variant="link" className="h-auto p-0 text-xs">View All Alerts</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue={activeSection} onValueChange={setActiveSection} className="w-full">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="audit-logs">
            <FileText className="h-4 w-4 mr-2" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Shield className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="audit-logs" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Audit Log History</CardTitle>
                  <CardDescription>
                    Track all user interactions and system events
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>Time Range</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="grid gap-2">
                        <Select value={timeFrame} onValueChange={setTimeFrame}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select time range" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="h-8 w-[130px]">
                      <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="approve">Approve</SelectItem>
                      <SelectItem value="reject">Reject</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="upload">Upload</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="ghost" size="sm" className="h-8">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <AuditLogViewer standalone={true} actionFilter={actionType} timeFilter={timeFrame} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Tracking</CardTitle>
              <CardDescription>
                Monitor compliance status and policy adherence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComplianceTracker standalone={true} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditCompliancePage;
