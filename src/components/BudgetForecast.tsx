
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ArrowUpRight, TrendingUp, TrendingDown, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from "recharts";

export const BudgetForecast: React.FC = () => {
  // Mock data for the forecast charts
  const forecastData = [
    { name: 'May', actual: 8500, predicted: 9000 },
    { name: 'Jun', actual: 9200, predicted: 9500 },
    { name: 'Jul', actual: 0, predicted: 10200 },
    { name: 'Aug', actual: 0, predicted: 11000 },
    { name: 'Sep', actual: 0, predicted: 10500 },
    { name: 'Oct', actual: 0, predicted: 11800 },
  ];

  const siteVisitCosts = [
    { id: 'SV001', location: 'North District', actual: 1200, predicted: 1350, variance: 12.5 },
    { id: 'SV002', location: 'Central Area', actual: 1500, predicted: 1450, variance: -3.3 },
    { id: 'SV003', location: 'Eastern Region', actual: 2200, predicted: 1950, variance: -11.4 },
    { id: 'SV004', location: 'Western Zone', actual: 1800, predicted: 2100, variance: 16.7 },
  ];

  return (
    <Card className="border-t-4 border-t-purple-600 overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="bg-slate-50 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Driven Budget Forecast
          </CardTitle>
          <Badge variant="outline" className="bg-purple-50 text-purple-700 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> Predictive
          </Badge>
        </div>
        <CardDescription>Smart budget allocation with predictive insights</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        {/* Budget Health Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Budget Health Status</h3>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Available Funds</span>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-lg font-bold">SDG 42,500</p>
                <Progress value={65} className="h-1 bg-slate-100" />
              </div>
            </Card>
            <Card className="p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Projected Costs</span>
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-lg font-bold">SDG 31,200</p>
                <Progress value={48} className="h-1 bg-slate-100" indicatorClassName="bg-amber-500" />
              </div>
            </Card>
            <Card className="p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Budget Efficiency</span>
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-lg font-bold">92.4%</p>
                <Progress value={92.4} className="h-1 bg-slate-100" indicatorClassName="bg-blue-500" />
              </div>
            </Card>
          </div>
        </div>

        {/* Budget Trend Forecast */}
        <div>
          <h3 className="text-sm font-semibold mb-2">6-Month Budget Forecast</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => [`SDG ${value}`, '']} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="actual" 
                  stroke="#10B981" 
                  name="Actual Spending" 
                  strokeWidth={2} 
                  dot={{ r: 4 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="predicted" 
                  stroke="#6366F1" 
                  name="AI Predicted" 
                  strokeWidth={2} 
                  strokeDasharray="5 5"
                  dot={{ r: 4 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Site Visit Cost Predictions */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Site Visit Cost Predictions</h3>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-2 p-2 border-b bg-slate-50 text-xs font-medium">
              <div>Site ID</div>
              <div>Location</div>
              <div>Actual Cost</div>
              <div>AI Predicted</div>
              <div>Variance</div>
            </div>
            <div className="divide-y">
              {siteVisitCosts.map((site) => (
                <div key={site.id} className="grid grid-cols-5 gap-2 p-2 text-sm hover:bg-slate-50 transition-colors">
                  <div className="font-medium">{site.id}</div>
                  <div>{site.location}</div>
                  <div>SDG {site.actual}</div>
                  <div>SDG {site.predicted}</div>
                  <div>
                    <span 
                      className={
                        site.variance > 10 
                          ? "text-red-600" 
                          : site.variance < 0 
                          ? "text-green-600" 
                          : "text-amber-600"
                      }
                    >
                      {site.variance > 0 ? '+' : ''}{site.variance}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Recommendations */}
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Smart Budget Recommendations
          </h3>
          <div className="space-y-2">
            <Card className="p-3 bg-purple-50 border-purple-100">
              <div className="flex items-start gap-2">
                <ArrowUpRight className="h-4 w-4 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Reallocate Transportation Budget</p>
                  <p className="text-xs text-purple-700">Increase Eastern Region budget by 15% to match actual spending patterns.</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 bg-purple-50 border-purple-100">
              <div className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Logistics Cost Optimization</p>
                  <p className="text-xs text-purple-700">Consolidate Western Zone visits to reduce logistics costs by approximately 12%.</p>
                </div>
              </div>
            </Card>
            <Button variant="outline" className="w-full mt-2 group">
              View All AI Recommendations
              <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
