
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Activity, Flag, ArrowRight, Shield, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface FraudDetectionProps {
  recentTransactions: number;
  unusualPatterns: boolean;
  highValueTransactions: boolean;
}

export const FraudDetection: React.FC<FraudDetectionProps> = ({
  recentTransactions,
  unusualPatterns,
  highValueTransactions,
}) => {
  // Add some basic animation to draw attention when patterns or high-value transactions are detected
  const [animate, setAnimate] = useState(false);
  const [riskScore, setRiskScore] = useState(0);
  
  // Calculate risk score based on props
  useEffect(() => {
    let score = 20; // Base risk score
    
    if (unusualPatterns) score += 30;
    if (highValueTransactions) score += 40;
    
    // Simulate a dynamic risk score calculation
    const interval = setInterval(() => {
      setRiskScore(prevScore => {
        if (prevScore < score) {
          return prevScore + 1;
        }
        return prevScore;
      });
    }, 30);
    
    return () => clearInterval(interval);
  }, [unusualPatterns, highValueTransactions]);
  
  // Add animation effect when fraud indicators change
  useEffect(() => {
    if (unusualPatterns || highValueTransactions) {
      setAnimate(true);
      const timeout = setTimeout(() => setAnimate(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [unusualPatterns, highValueTransactions]);
  
  // Determine risk level color based on risk score
  const getRiskLevelColor = () => {
    if (riskScore > 60) return "text-red-500";
    if (riskScore > 30) return "text-amber-500";
    return "text-green-500";
  };

  const getRiskLevelIndicator = () => {
    if (riskScore > 60) return "border-t-red-500";
    if (riskScore > 30) return "border-t-amber-500";
    return "border-t-green-500";
  };

  const getRiskLevelBg = () => {
    if (riskScore > 60) return "bg-red-100 text-red-800";
    if (riskScore > 30) return "bg-amber-100 text-amber-800";
    return "bg-green-100 text-green-800";
  };

  return (
    <Card className={`overflow-hidden border-t-4 transition-all hover:shadow-md ${getRiskLevelIndicator()} ${animate ? 'shadow-lg' : ''}`}>
      <CardHeader className="bg-slate-50 pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Shield className={`h-5 w-5 ${getRiskLevelColor()}`} />
          Fraud Detection Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          {/* Risk Score Indicator */}
          <div className="flex flex-col space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Risk Score</span>
              <span className={`text-sm font-bold ${getRiskLevelColor()}`}>{riskScore}</span>
            </div>
            <Progress 
              value={riskScore} 
              max={100} 
              className="h-2" 
              indicatorClassName={
                riskScore > 60 ? "bg-red-500" : 
                riskScore > 30 ? "bg-amber-500" : 
                "bg-green-500"
              } 
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-md">
            <Activity className="h-4 w-4 text-blue-500" />
            <span className="font-medium">Recent Transactions: {recentTransactions}</span>
          </div>
          
          {unusualPatterns && (
            <div className={`flex items-center gap-2 bg-amber-50 p-2 rounded-md ${animate ? 'animate-pulse' : ''}`}>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-medium">Unusual transaction patterns detected</span>
            </div>
          )}
          
          {highValueTransactions && (
            <div className={`flex items-center gap-2 bg-red-50 p-2 rounded-md ${animate ? 'animate-pulse' : ''}`}>
              <Flag className="h-4 w-4 text-red-500" />
              <span className="font-medium">High-value transactions requiring review</span>
            </div>
          )}
          
          {/* Add trend analysis indicator */}
          <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-md">
            <FileBarChart className="h-4 w-4 text-blue-600" />
            <span className="font-medium">
              Fraud trend: {unusualPatterns || highValueTransactions ? "↑ Increasing" : "↓ Decreasing"}
            </span>
          </div>
          
          <Button variant="outline" className="w-full group">
            View Detailed Analysis
            <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
