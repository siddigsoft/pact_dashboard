
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DownloadCloud, Filter, Calendar } from 'lucide-react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { format } from 'date-fns';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface ArchiveHeaderProps {
  onFilterOpen: () => void;
  onBackClick: () => void;
}

const ArchiveHeader: React.FC<ArchiveHeaderProps> = ({ onFilterOpen, onBackClick }) => {
  const { currentArchive, archives, selectMonth, downloadArchive } = useArchive();

  const handleMonthSelect = (value: string) => {
    const [year, month] = value.split('-').map(Number);
    selectMonth(year, month);
  };

  const handleDownload = async (format: 'excel' | 'csv' | 'pdf') => {
    await downloadArchive(format);
  };

  return (
    <div className="flex flex-col space-y-4 md:space-y-0 md:flex-row md:justify-between md:items-center p-4 bg-gradient-to-r from-background to-muted rounded-lg shadow-sm">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBackClick}
          className="hover:bg-background/50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Archives & Documentation
          </h1>
          <p className="text-muted-foreground">
            {currentArchive ? `Viewing ${currentArchive.label}` : 'Browse all archived records'}
          </p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Select onValueChange={handleMonthSelect} defaultValue={currentArchive ? `${currentArchive.year}-${currentArchive.month}` : undefined}>
          <SelectTrigger className="w-[180px] bg-background/80">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {archives.map((archive) => (
              <SelectItem key={`${archive.year}-${archive.month}`} value={`${archive.year}-${archive.month}`}>
                {archive.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button variant="outline" onClick={onFilterOpen} className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <DownloadCloud className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleDownload('excel')}>
              Export as Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('csv')}>
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('pdf')}>
              Export as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ArchiveHeader;
