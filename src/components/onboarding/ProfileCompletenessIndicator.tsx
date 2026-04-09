import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, User, Phone, MapPin, Briefcase, Camera, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import type { User as UserType } from "@/types";

interface ProfileField {
  key: string;
  label: string;
  icon: React.ElementType;
  settingsPath: string;
  weight: number;
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: 'name', label: 'Full name', icon: User, settingsPath: '/settings?tab=profile', weight: 15 },
  { key: 'email', label: 'Email address', icon: User, settingsPath: '/settings?tab=profile', weight: 10 },
  { key: 'phone', label: 'Phone number', icon: Phone, settingsPath: '/settings?tab=profile', weight: 15 },
  { key: 'avatar', label: 'Profile photo', icon: Camera, settingsPath: '/settings?tab=profile', weight: 10 },
  { key: 'hubId', label: 'Hub assignment', icon: MapPin, settingsPath: '/settings?tab=profile', weight: 15 },
  { key: 'emergencyContact', label: 'Emergency contact', icon: Phone, settingsPath: '/settings?tab=profile', weight: 15 },
  { key: 'employeeId', label: 'Employee ID', icon: Briefcase, settingsPath: '/settings?tab=profile', weight: 10 },
  { key: 'bankAccount', label: 'Bank account details', icon: CreditCard, settingsPath: '/settings?tab=profile', weight: 10 },
];

const getFieldValue = (user: UserType, key: string): boolean => {
  switch (key) {
    case 'name': return !!user.name && user.name.trim().length > 0;
    case 'email': return !!user.email && user.email.trim().length > 0;
    case 'phone': return !!user.phone && user.phone.trim().length > 0;
    case 'avatar': return !!user.avatar && user.avatar.length > 0;
    case 'hubId': return !!user.hubId && user.hubId.length > 0;
    case 'emergencyContact': return !!user.emergencyContact && user.emergencyContact.trim().length > 0;
    case 'employeeId': return !!user.employeeId && user.employeeId.trim().length > 0;
    case 'bankAccount': return !!user.bankAccount?.accountNumber;
    default: return false;
  }
};

interface ProfileCompletenessIndicatorProps {
  user: UserType;
  compact?: boolean;
}

export const ProfileCompletenessIndicator = ({ user, compact = false }: ProfileCompletenessIndicatorProps) => {
  const { percentage, completedFields, missingFields } = useMemo(() => {
    let totalWeight = 0;
    let completedWeight = 0;
    const completed: ProfileField[] = [];
    const missing: ProfileField[] = [];

    PROFILE_FIELDS.forEach(field => {
      totalWeight += field.weight;
      if (getFieldValue(user, field.key)) {
        completedWeight += field.weight;
        completed.push(field);
      } else {
        missing.push(field);
      }
    });

    return {
      percentage: Math.round((completedWeight / totalWeight) * 100),
      completedFields: completed,
      missingFields: missing,
    };
  }, [user]);

  const getBadgeColor = () => {
    if (percentage >= 90) return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400';
    if (percentage >= 60) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400';
    return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400';
  };

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-green-500';
    if (percentage >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2" data-testid="profile-completeness-compact">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Profile completeness</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${getBadgeColor()}`}>{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-1.5" />
        </div>
        {missingFields.length > 0 && (
          <Link to="/settings?tab=profile">
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
              Complete
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="profile-completeness-full">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Profile Completeness</h3>
          <span className={`text-sm font-bold px-2 py-0.5 rounded-full border ${getBadgeColor()}`}>{percentage}%</span>
        </div>
        <div className="relative">
          <Progress value={percentage} className="h-3 rounded-full" />
        </div>
        <p className="text-xs text-muted-foreground">
          {completedFields.length} of {PROFILE_FIELDS.length} fields completed
          {percentage < 100 && ` · ${missingFields.length} missing`}
        </p>
      </div>

      {missingFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Missing Information</p>
          <div className="grid grid-cols-1 gap-1.5">
            {missingFields.map((field) => {
              const Icon = field.icon;
              return (
                <Link key={field.key} to={field.settingsPath} className="group" data-testid={`missing-field-${field.key}`}>
                  <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{field.label}</span>
                    <span className="ml-auto text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Add →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {completedFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</p>
          <div className="grid grid-cols-2 gap-1.5">
            {completedFields.map((field) => {
              const Icon = field.icon;
              return (
                <div key={field.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`completed-field-${field.key}`}>
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                  <span className="truncate">{field.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {percentage === 100 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <p className="text-xs text-green-800 dark:text-green-200 font-medium">Your profile is complete!</p>
        </div>
      )}
    </div>
  );
};
