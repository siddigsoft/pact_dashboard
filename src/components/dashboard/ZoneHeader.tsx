import React from 'react';

interface ZoneHeaderProps {
  title: string;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'red' | 'orange';
  children?: React.ReactNode;
}

const colorMap = {
  blue: 'border-t-blue-500',
  green: 'border-t-green-500',
  purple: 'border-t-purple-500',
  red: 'border-t-red-500',
  orange: 'border-t-orange-500'
};

export const ZoneHeader: React.FC<ZoneHeaderProps> = ({
  title,
  subtitle,
  color,
  children
}) => {
  return (
    <div className={`border-t-2 ${colorMap[color]} rounded-lg border bg-card p-4`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {children && <div className="flex items-center gap-4">{children}</div>}
      </div>
    </div>
  );
};
