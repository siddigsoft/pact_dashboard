
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SiteEntryCardProps {
  site: {
    id: string;
    siteName: string;
    siteCode: string;
    mainActivity?: string;
    inMoDa?: boolean;
  };
  isSelected: boolean;
  onToggle: (siteId: string) => void;
}

export const SiteEntryCard = ({ site, isSelected, onToggle }: SiteEntryCardProps) => {
  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-md ${
        isSelected 
          ? 'bg-primary/10 border border-primary/30' 
          : 'bg-muted/50'
      }`}
    >
      <div className="flex items-center space-x-3">
        <Checkbox 
          id={`site-${site.id}`}
          checked={isSelected}
          onCheckedChange={() => onToggle(site.id)}
        />
        <div>
          <Label 
            htmlFor={`site-${site.id}`}
            className="font-medium cursor-pointer"
          >
            {site.siteName}
          </Label>
          <div className="text-xs text-muted-foreground">
            {site.siteCode} • {site.mainActivity || 'No activity specified'}
          </div>
        </div>
      </div>
      <div className={`text-xs px-2 py-1 rounded-full ${
        site.inMoDa 
          ? 'bg-green-100 text-green-800' 
          : 'bg-yellow-100 text-yellow-800'
      }`}>
        {site.inMoDa ? 'In MoDa' : 'Not in MoDa'}
      </div>
    </div>
  );
};

