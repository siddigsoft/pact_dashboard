
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export const EnhancedRiskManagement = () => {
  return (
    <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-all duration-300">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent flex flex-row justify-between items-center">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Risk Management Center
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium">Wallet module still in development</p>
              <p className="text-sm text-muted-foreground">
                Transaction, fraud detection, prevention, and monitoring features will be available soon.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
