
import React, { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, Filter, TrendingUp, TrendingDown, CalendarDays, PieChart, BarChart as BarChartIcon } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock data for historical trends
const generateMockData = (months: number) => {
  const data = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = date.toLocaleString('default', { month: 'short' });
    const yearShort = date.getFullYear().toString().substr(2, 2);
    
    data.push({
      name: `${monthName} '${yearShort}`,
      completionRate: 75 + Math.random() * 20,
      budget: 5000 + Math.floor(Math.random() * 3000),
      spending: 4000 + Math.floor(Math.random() * 4000),
      tasksCompleted: 20 + Math.floor(Math.random() * 30),
      approvalTime: 2 + Math.random() * 3,
      riskScore: 10 + Math.random() * 40
    });
  }
  
  return data;
};

interface MMPHistoricalTrendsProps {
  timeFrame?: string;
  onTimeFrameChange?: (timeFrame: string) => void;
}

const MMPHistoricalTrends: React.FC<MMPHistoricalTrendsProps> = ({
  timeFrame = "6months",
  onTimeFrameChange
}) => {
  const [selectedChart, setSelectedChart] = useState("completion");
  const [selectedTimeFrame, setSelectedTimeFrame] = useState(timeFrame);
  const [predictionsEnabled, setPredictionsEnabled] = useState(false);

  const handleTimeFrameChange = (value: string) => {
    setSelectedTimeFrame(value);
    if (onTimeFrameChange) {
      onTimeFrameChange(value);
    }
  };

  const getMonthsFromTimeFrame = () => {
    switch (selectedTimeFrame) {
      case "3months": return 3;
      case "6months": return 6;
      case "1year": return 12;
      case "2years": return 24;
      default: return 6;
    }
  };

  // Generate data based on selected time frame
  const historicalData = generateMockData(getMonthsFromTimeFrame());
  
  // Separate actual and prediction data
  const actualData = [...historicalData];
  const predictionData: any[] = [];
  
  // Add prediction data points if enabled
  if (predictionsEnabled) {
    const lastEntry = historicalData[historicalData.length - 1];
    const predictMonths = 3;
    
    for (let i = 1; i <= predictMonths; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      const monthName = date.toLocaleString('default', { month: 'short' });
      const yearShort = date.getFullYear().toString().substr(2, 2);
      
      const predictionPoint = {
        name: `${monthName} '${yearShort} (pred)`,
        completionRate: lastEntry.completionRate + (Math.random() * 6 - 3),
        budget: lastEntry.budget + (Math.random() * 500 - 250),
        spending: lastEntry.spending + (Math.random() * 500 - 250),
        tasksCompleted: lastEntry.tasksCompleted + Math.floor(Math.random() * 10 - 5),
        approvalTime: lastEntry.approvalTime + (Math.random() - 0.5),
        riskScore: lastEntry.riskScore + (Math.random() * 10 - 5),
        isPrediction: true
      };
      
      predictionData.push(predictionPoint);
    }
  }
  
  // Combine data for charts that need both actual and prediction data
  const chartData = [...actualData, ...predictionData];

  // Get dynamic chart info based on selection
  const getChartInfo = () => {
    switch (selectedChart) {
      case "completion":
        return {
          title: "Task Completion Rate",
          description: "Historical trends of MMP task completion rates",
          dataKey: "completionRate",
          unit: "%",
          color: "#10b981",
          valuePrefix: "",
        };
      case "budget":
        return {
          title: "Budget vs. Spending",
          description: "Comparison of allocated budgets and actual spending",
          dataKey1: "budget",
          dataKey2: "spending",
          unit: "SDG",
          color1: "#3b82f6",
          color2: "#f97316",
          valuePrefix: "SDG ",
        };
      case "tasks":
        return {
          title: "Tasks Completed",
          description: "Number of MMP tasks completed each month",
          dataKey: "tasksCompleted",
          unit: "tasks",
          color: "#8b5cf6",
          valuePrefix: "",
        };
      case "approval":
        return {
          title: "Avg. Approval Time",
          description: "Average time for MMP approval in days",
          dataKey: "approvalTime",
          unit: "days",
          color: "#f59e0b",
          valuePrefix: "",
        };
      case "risk":
        return {
          title: "Risk Assessment Score",
          description: "Monthly risk assessment scores (lower is better)",
          dataKey: "riskScore",
          unit: "points",
          color: "#ef4444",
          valuePrefix: "",
        };
      default:
        return {
          title: "Task Completion Rate",
          description: "Historical trends of MMP task completion rates",
          dataKey: "completionRate",
          unit: "%",
          color: "#10b981",
          valuePrefix: "",
        };
    }
  };

  const chartInfo = getChartInfo();

  const handleExport = (format: string) => {
    console.log(`Exporting data as ${format}`);
    // Implementation for export functionality would go here
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Historical Data Trends
            </CardTitle>
            <CardDescription>
              Track performance metrics and financial patterns over time
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
            <Select value={selectedTimeFrame} onValueChange={handleTimeFrameChange}>
              <SelectTrigger className="w-[130px]">
                <CalendarDays className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Time Frame" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="6months">Last 6 Months</SelectItem>
                <SelectItem value="1year">Last Year</SelectItem>
                <SelectItem value="2years">Last 2 Years</SelectItem>
              </SelectContent>
            </Select>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex gap-1">
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>Export as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")}>Export as Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv")}>Export as CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="charts" className="w-full">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="charts" className="flex items-center gap-1">
                <BarChartIcon className="h-4 w-4" />
                Charts
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex items-center gap-1">
                <PieChart className="h-4 w-4" />
                Summary
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className={predictionsEnabled ? "border-primary border" : ""}
                onClick={() => setPredictionsEnabled(!predictionsEnabled)}
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Predictions
              </Button>
              
              <Select value={selectedChart} onValueChange={setSelectedChart}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completion">Completion Rate</SelectItem>
                  <SelectItem value="budget">Budget vs. Spending</SelectItem>
                  <SelectItem value="tasks">Tasks Completed</SelectItem>
                  <SelectItem value="approval">Approval Time</SelectItem>
                  <SelectItem value="risk">Risk Score</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <TabsContent value="charts" className="space-y-4">
            <div className="h-[350px] mt-4">
              {selectedChart === "budget" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [`${chartInfo.valuePrefix}${value}`, name === "budget" ? "Budget" : "Spending"]} 
                      labelFormatter={(label) => `Period: ${label}`}
                    />
                    <Legend />
                    <Bar 
                      name="Budget" 
                      dataKey={chartInfo.dataKey1} 
                      fill={chartInfo.color1} 
                      animationDuration={1000}
                    />
                    <Bar 
                      name="Spending" 
                      dataKey={chartInfo.dataKey2} 
                      fill={chartInfo.color2} 
                      animationDuration={1000} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`${chartInfo.valuePrefix}${value} ${chartInfo.unit}`, chartInfo.title]} 
                      labelFormatter={(label) => `Period: ${label}`}
                    />
                    <Legend />
                    {/* Actual data line */}
                    <Line
                      name={chartInfo.title}
                      type="monotone"
                      dataKey={chartInfo.dataKey}
                      data={actualData}
                      stroke={chartInfo.color}
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                      dot={{ strokeWidth: 2 }}
                      connectNulls
                      animationDuration={1000}
                    />
                    {/* Prediction data line (only shown when predictions are enabled) */}
                    {predictionsEnabled && (
                      <Line
                        name={`${chartInfo.title} (Predicted)`}
                        type="monotone"
                        dataKey={chartInfo.dataKey}
                        data={predictionData}
                        stroke={chartInfo.color}
                        strokeDasharray="5 5"
                        dot={{ strokeWidth: 2 }}
                        connectNulls
                        animationDuration={1000}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            
            {predictionsEnabled && (
              <div className="text-sm bg-blue-50 p-3 rounded border border-blue-100">
                <div className="flex items-start">
                  <TrendingUp className="h-4 w-4 mt-0.5 text-blue-600 mr-2" />
                  <div>
                    <p className="font-medium text-blue-700">Prediction Information</p>
                    <p className="text-blue-600">
                      Predictions are based on historical data patterns and may vary from actual results.
                      Dashed lines represent projected values for the next 3 months.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="summary" className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-green-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    Average Completion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-700">
                    {Math.round(chartData.reduce((acc, curr) => acc + curr.completionRate, 0) / chartData.length)}%
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    {Math.random() > 0.5 ? '+2.3%' : '-1.4%'} compared to previous period
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-blue-600" />
                    Budget Efficiency
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-700">
                    {Math.round(chartData.reduce((acc, curr) => acc + (curr.spending / curr.budget * 100), 0) / chartData.length)}%
                  </div>
                  <p className="text-sm text-blue-600 mt-1">
                    Average spending of allocated budget
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-amber-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-amber-600" />
                    Avg. Approval Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-700">
                    {(chartData.reduce((acc, curr) => acc + curr.approvalTime, 0) / chartData.length).toFixed(1)} days
                  </div>
                  <p className="text-sm text-amber-600 mt-1">
                    {Math.random() > 0.5 ? '-0.5 days' : '+0.3 days'} compared to previous period
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-medium">Key Insights</h3>
              
              <div className="space-y-2">
                <div className="p-3 bg-white rounded border flex items-start gap-3">
                  <div className="p-2 rounded-full bg-green-100">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Improved Efficiency</p>
                    <p className="text-sm text-muted-foreground">
                      Task completion rates have improved by 5.2% over the last quarter, 
                      potentially due to better resource allocation and streamlined processes.
                    </p>
                  </div>
                </div>
                
                <div className="p-3 bg-white rounded border flex items-start gap-3">
                  <div className="p-2 rounded-full bg-amber-100">
                    <TrendingDown className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">Budget Utilization Trends</p>
                    <p className="text-sm text-muted-foreground">
                      Spending has remained consistently under budget for the past 6 months,
                      suggesting potential for reallocation of resources to higher priority areas.
                    </p>
                  </div>
                </div>
                
                <div className="p-3 bg-white rounded border flex items-start gap-3">
                  <div className="p-2 rounded-full bg-blue-100">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Seasonal Patterns</p>
                    <p className="text-sm text-muted-foreground">
                      Data shows consistent peaks in activity during months of March-May and September-November,
                      suggesting optimal timing for future project planning and resource allocation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default MMPHistoricalTrends;
