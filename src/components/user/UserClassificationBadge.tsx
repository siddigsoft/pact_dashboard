import { useMemo } from 'react';
import ClassificationBadge from './ClassificationBadge';
import { useClassification } from '@/context/classification/ClassificationContext';
import { Badge } from '@/components/ui/badge';

interface UserClassificationBadgeProps {
  userId: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showUnassigned?: boolean;
}

export default function UserClassificationBadge({ 
  userId, 
  showTooltip = true, 
  size = 'sm',
  className,
  showUnassigned = false,
}: UserClassificationBadgeProps) {
  const { getUserClassification } = useClassification();

  const classification = useMemo(() => {
    return getUserClassification(userId);
  }, [userId, getUserClassification]);

  if (!classification) {
    if (showUnassigned) {
      return (
        <Badge 
          variant="outline" 
          className={`text-muted-foreground ${className || ''}`}
          data-testid={`badge-classification-none-${userId}`}
        >
          No Classification
        </Badge>
      );
    }
    return null;
  }

  return (
    <ClassificationBadge
      level={classification.classificationLevel}
      roleScope={classification.roleScope}
      showTooltip={showTooltip}
      size={size}
      className={className}
    />
  );
}
