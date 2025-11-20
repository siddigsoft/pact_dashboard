
import React from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { addMonths, format, isSameMonth, setMonth, setYear } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Map } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ArchiveCalendarView: React.FC = () => {
  const { archives, currentArchive, selectMonth, loading } = useArchive();
  const [date, setDate] = React.useState<Date>(new Date());
  
  // Create a date object for the currently selected archive month
  React.useEffect(() => {
    if (currentArchive) {
      const newDate = new Date();
      newDate.setFullYear(currentArchive.year);
      newDate.setMonth(currentArchive.month - 1); // JavaScript months are 0-indexed
      setDate(newDate);
    }
  }, [currentArchive]);
  
  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate);
      selectMonth(selectedDate.getFullYear(), selectedDate.getMonth() + 1);
    }
  };
  
  // Get the list of years with archives
  const years = React.useMemo(() => {
    const uniqueYears = Array.from(new Set(archives.map(a => a.year)));
    return uniqueYears.sort((a, b) => b - a); // Sort newest first
  }, [archives]);

  // Handler for when year is changed in dropdown
  const handleYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10);
    const newDate = new Date(date);
    newDate.setFullYear(year);
    setDate(newDate);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const monthsWithArchives = archives.map(archive => {
    const archiveDate = new Date();
    archiveDate.setFullYear(archive.year);
    archiveDate.setMonth(archive.month - 1);
    return archiveDate;
  });

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Archive Calendar</CardTitle>
          <Select value={date.getFullYear().toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder={date.getFullYear().toString()} />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          className="rounded-md border"
          modifiers={{
            archived: (day) => 
              monthsWithArchives.some(archiveDate => 
                isSameMonth(day, archiveDate) && day.getFullYear() === archiveDate.getFullYear()
              )
          }}
          modifiersClassNames={{
            archived: "bg-primary/10 font-medium text-primary"
          }}
        />
        
        {currentArchive && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Archive Summary: {currentArchive.label}</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {currentArchive.mmpsCount} MMPs
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Map className="h-3 w-3" />
                {currentArchive.siteVisitsCount} Site Visits
              </Badge>
              <Badge variant="secondary" className="flex items-center">
                {currentArchive.documentsCount} Documents
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ArchiveCalendarView;
