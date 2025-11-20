
import React from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ArchiveFilter } from '@/types';

interface ArchiveFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ArchiveFilters: React.FC<ArchiveFiltersProps> = ({ open, onOpenChange }) => {
  const { filters, setFilters } = useArchive();
  const [localFilters, setLocalFilters] = React.useState<ArchiveFilter>(filters);
  
  // Reset local filters when the sheet opens
  React.useEffect(() => {
    if (open) {
      setLocalFilters(filters);
    }
  }, [open, filters]);
  
  const handleApplyFilters = () => {
    setFilters(localFilters);
    onOpenChange(false);
  };
  
  const handleResetFilters = () => {
    setLocalFilters({});
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full md:max-w-md">
        <SheetHeader>
          <SheetTitle>Archive Filters</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Date Range Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Date Range</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Select
                  value={localFilters.year?.toString() || ''}
                  onValueChange={(value) => setLocalFilters({...localFilters, year: parseInt(value, 10)})}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quarter">Quarter</Label>
                <Select
                  value={localFilters.quarter?.toString() || ''}
                  onValueChange={(value) => setLocalFilters({...localFilters, quarter: parseInt(value, 10)})}
                >
                  <SelectTrigger id="quarter">
                    <SelectValue placeholder="Select quarter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Document Type Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Document Types</h3>
            
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="mmp" />
                <Label htmlFor="mmp">MMP Files</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="siteVisit" />
                <Label htmlFor="siteVisit">Site Visits</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="permit" />
                <Label htmlFor="permit">Permits</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="verification" />
                <Label htmlFor="verification">Verifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="report" />
                <Label htmlFor="report">Reports</Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Status Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">MMP Status</h3>
            
            <div className="space-y-2">
              <Select
                value={localFilters.status || ''}
                onValueChange={(value) => setLocalFilters({...localFilters, status: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Separator />
          
          {/* Regional Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Location</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select
                  value={localFilters.region || ''}
                  onValueChange={(value) => setLocalFilters({...localFilters, region: value})}
                >
                  <SelectTrigger id="region">
                    <SelectValue placeholder="All regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="north">North</SelectItem>
                    <SelectItem value="east">East</SelectItem>
                    <SelectItem value="west">West</SelectItem>
                    <SelectItem value="south">South</SelectItem>
                    <SelectItem value="central">Central</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select
                  value={localFilters.state || ''}
                  onValueChange={(value) => setLocalFilters({...localFilters, state: value})}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Khartoum">Khartoum</SelectItem>
                    <SelectItem value="North Darfur">North Darfur</SelectItem>
                    <SelectItem value="Red Sea">Red Sea</SelectItem>
                    <SelectItem value="Kassala">Kassala</SelectItem>
                    <SelectItem value="Al Jazirah">Al Jazirah</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mt-8">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleResetFilters}
          >
            Reset
          </Button>
          <Button 
            className="flex-1"
            onClick={handleApplyFilters}
          >
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ArchiveFilters;
