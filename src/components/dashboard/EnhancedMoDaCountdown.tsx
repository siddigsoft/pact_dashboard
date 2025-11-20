
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { MoDaDeadlineCountdown } from '@/components/MoDaDeadlineCountdown';

export const EnhancedMoDaCountdown = () => {
  return (
    <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-all duration-300 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <Clock className="h-5 w-5 text-amber-500" />
          <CardTitle>MoDa Status</CardTitle>
        </motion.div>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <MoDaDeadlineCountdown />
        </motion.div>
      </CardContent>
    </Card>
  );
};
