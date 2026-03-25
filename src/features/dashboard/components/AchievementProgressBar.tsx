
import React from 'react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Trophy, ArrowUp, Star } from 'lucide-react';

interface AchievementProgressBarProps {
  title: string;
  progress: number;
  target: number;
  unit?: string;
  category?: string;
}

export const AchievementProgressBar = ({
  title,
  progress,
  target,
  unit = '',
  category = 'Default'
}: AchievementProgressBarProps) => {
  const percentage = Math.min(Math.round((progress / target) * 100), 100);
  
  const getColorByCategory = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'visits': return { bg: 'bg-emerald-500', light: 'bg-emerald-100' };
      case 'compliance': return { bg: 'bg-blue-500', light: 'bg-blue-100' };
      case 'team': return { bg: 'bg-violet-500', light: 'bg-violet-100' };
      case 'fraud': return { bg: 'bg-amber-500', light: 'bg-amber-100' };
      default: return { bg: 'bg-primary', light: 'bg-primary/20' };
    }
  };
  
  const colors = getColorByCategory(category);
  
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full ${colors.light} flex items-center justify-center`}>
            {category.toLowerCase() === 'visits' && <MapPin className={`h-3 w-3 text-emerald-600`} />}
            {category.toLowerCase() === 'compliance' && <Check className={`h-3 w-3 text-blue-600`} />}
            {category.toLowerCase() === 'team' && <Users className={`h-3 w-3 text-violet-600`} />}
            {category.toLowerCase() === 'fraud' && <ShieldCheck className={`h-3 w-3 text-amber-600`} />}
            {!['visits', 'compliance', 'team', 'fraud'].includes(category.toLowerCase()) && 
              <Star className={`h-3 w-3 text-primary`} />
            }
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {percentage >= 80 && (
            <Trophy className="h-4 w-4 text-amber-400" />
          )}
          {percentage >= 50 && percentage < 80 && (
            <ArrowUp className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-sm font-medium">
            {progress}{unit} / {target}{unit}
          </span>
        </div>
      </div>
      
      <div className="relative">
        <Progress 
          value={percentage}
          className="h-2"
          indicatorClassName={colors.bg}
        />
        {percentage >= 100 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.5 }}
            className="absolute -right-1 -top-1 bg-amber-400 rounded-full h-4 w-4 flex items-center justify-center"
          >
            <Check className="h-2.5 w-2.5 text-white" />
          </motion.div>
        )}
      </div>
    </div>
  );
};

// Import the necessary icons
import { MapPin, Check, Users, ShieldCheck } from 'lucide-react';
