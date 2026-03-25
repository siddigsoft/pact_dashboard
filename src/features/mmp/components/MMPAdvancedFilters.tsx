import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  BadgeDollarSign,
  MapPin,
  Users,
  BarChart3,
  RotateCcw,
  Tag,
  GitBranch,
  Building,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowDownUp
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-range-picker"; 
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { sudanStates, getLocalitiesByState, hubs } from "@/data/sudanStates";

interface MMPAdvancedFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  dateRangeFilter: { start: Date | null; end: Date | null };
  setDateRangeFilter: (range: { start: Date | null; end: Date | null }) => void;
  projectNameFilter: string;
  setProjectNameFilter: (value: string) => void;
  locationFilter: string;
  setLocationFilter: (value: string) => void;
  assignedUserFilter: string;
  setAssignedUserFilter: (value: string) => void;
  budgetRangeFilter: { min: number | null; max: number | null };
  setBudgetRangeFilter: (range: { min: number | null; max: number | null }) => void;
  complexityFilter: string;
  setComplexityFilter: (value: string) => void;
  resetFilters: () => void;
  activeFilters: number;
  regionFilter?: string;
  setRegionFilter?: (value: string) => void;
  versionFilter?: string;
  setVersionFilter?: (value: string) => void;
  hubFilter?: string;
  setHubFilter?: (value: string) => void;
}

const users = [
  "John Smith", "Sarah Ahmed", "Mohammed Ali", "David Wilson", 
  "Fatima Hassan", "Omar Ibrahim", "Amina Mohamed", "James Brown",
  "Aisha Khalid", "Robert Taylor", "Zainab Osman", "Michael Carter"
];

const projects = [
  "Clean Water Initiative", 
  "Food Security Program",
  "Healthcare Access Project", 
  "Education for All",
  "Sustainable Agriculture",
  "Infrastructure Rehabilitation",
  "Emergency Response Network",
  "Women Empowerment Program",
  "Youth Skills Development",
  "Vaccination Campaign",
  "Community Resilience Building",
  "Digital Literacy Initiative"
];

const MMPAdvancedFilters: React.FC<MMPAdvancedFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  dateRangeFilter,
  setDateRangeFilter,
  projectNameFilter,
  setProjectNameFilter,
  locationFilter,
  setLocationFilter,
  assignedUserFilter,
  setAssignedUserFilter,
  budgetRangeFilter,
  setBudgetRangeFilter,
  complexityFilter,
  setComplexityFilter,
  resetFilters,
  activeFilters,
  regionFilter = "",
  setRegionFilter = () => {},
  versionFilter = "",
  setVersionFilter = () => {},
  hubFilter = "all",
  setHubFilter = () => {},
}) => {
  const [availableLocalities, setAvailableLocalities] = useState<{ id: string; name: string }[]>([]);
  const [availableStates, setAvailableStates] = useState<{ id: string; name: string; code: string }[]>(sudanStates);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);

  // Update available states when hub changes
  useEffect(() => {
    if (hubFilter && hubFilter !== "all") {
      const selectedHub = hubs.find(hub => hub.id === hubFilter);
      
      if (selectedHub) {
        // Filter states based on hub
        const statesInHub = sudanStates.filter(state => 
          selectedHub.states.includes(state.id)
        );
        
        setAvailableStates(statesInHub);
        
        // Reset state filter when hub changes to avoid invalid state selections
        if (regionFilter && regionFilter !== "all" && !selectedHub.states.includes(regionFilter)) {
          setRegionFilter("all");
        }
      } else {
        setAvailableStates(sudanStates);
      }
    } else {
      setAvailableStates(sudanStates);
    }
  }, [hubFilter, regionFilter, setRegionFilter]);

  // Update available localities when region changes
  useEffect(() => {
    if (regionFilter && regionFilter !== "all") {
      const localities = getLocalitiesByState(regionFilter);
      setAvailableLocalities(localities);
      setLocationFilter("all");
    } else {
      if (hubFilter && hubFilter !== "all") {
        const selectedHub = hubs.find(hub => hub.id === hubFilter);
        if (selectedHub) {
          const hubStates = selectedHub.states;
          const hubLocalities = hubStates.flatMap(stateId => {
            const state = sudanStates.find(s => s.id === stateId);
            return state ? state.localities : [];
          });
          setAvailableLocalities(hubLocalities);
        } else {
          const allLocalities = sudanStates.flatMap(state => state.localities);
          setAvailableLocalities(allLocalities);
        }
      } else {
        const allLocalities = sudanStates.flatMap(state => state.localities);
        setAvailableLocalities(allLocalities);
      }
    }
  }, [regionFilter, setLocationFilter, hubFilter]);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRangeFilter({
      start: range?.from || null,
      end: range?.to || null
    });
  };

  const handleBudgetMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : null;
    setBudgetRangeFilter({ ...budgetRangeFilter, min: value });
  };

  const handleBudgetMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : null;
    setBudgetRangeFilter({ ...budgetRangeFilter, max: value });
  };

  // Handle reset manually
  const handleReset = () => {
    resetFilters();
    // Force reset state selector status
    setAvailableStates(sudanStates);
    setIsLocationOpen(false);
    setIsProjectOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, ID, or uploader..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">
                    <div className="flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 mr-2 text-amber-500" />
                      Pending
                    </div>
                  </SelectItem>
                  <SelectItem value="approved">
                    <div className="flex items-center">
                      <CheckCircle className="h-3.5 w-3.5 mr-2 text-green-500" />
                      Approved
                    </div>
                  </SelectItem>
                  <SelectItem value="rejected">
                    <div className="flex items-center">
                      <XCircle className="h-3.5 w-3.5 mr-2 text-red-500" />
                      Rejected
                    </div>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            
            {activeFilters > 0 && (
              <Button 
                variant="outline" 
                onClick={handleReset} 
                className="flex items-center whitespace-nowrap"
                size="sm"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset 
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {activeFilters}
                </Badge>
              </Button>
            )}
            
            <Button 
              variant={isFilterExpanded ? "default" : "outline"} 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Filter className="h-4 w-4" />
              {isFilterExpanded ? "Less filters" : "More filters"}
              {isFilterExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {statusFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Status: {statusFilter}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setStatusFilter("all")}>×</Button>
              </Badge>
            )}
            
            {dateRangeFilter.start && dateRangeFilter.end && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Date Range
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setDateRangeFilter({ start: null, end: null })}>×</Button>
              </Badge>
            )}
            
            {projectNameFilter && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Project: {projectNameFilter.length > 10 ? `${projectNameFilter.substring(0, 10)}...` : projectNameFilter}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setProjectNameFilter("")}>×</Button>
              </Badge>
            )}
            
            {regionFilter && regionFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                State: {availableStates.find(s => s.id === regionFilter)?.name || ""}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setRegionFilter("all")}>×</Button>
              </Badge>
            )}
            
            {locationFilter && locationFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Locality: {availableLocalities.find(l => l.id === locationFilter)?.name || ""}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setLocationFilter("all")}>×</Button>
              </Badge>
            )}
            
            {assignedUserFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                User: {assignedUserFilter}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setAssignedUserFilter("all")}>×</Button>
              </Badge>
            )}
            
            {versionFilter && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Version: {versionFilter}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setVersionFilter("")}>×</Button>
              </Badge>
            )}
            
            {(budgetRangeFilter.min !== null || budgetRangeFilter.max !== null) && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Budget: {budgetRangeFilter.min || "0"} - {budgetRangeFilter.max || "∞"}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setBudgetRangeFilter({ min: null, max: null })}>×</Button>
              </Badge>
            )}
            
            {complexityFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Complexity: {complexityFilter}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setComplexityFilter("all")}>×</Button>
              </Badge>
            )}
            
            {hubFilter && hubFilter !== "all" && (
              <Badge variant="outline" className="flex items-center gap-1 bg-slate-50">
                Hub: {hubs.find(h => h.id === hubFilter)?.name || ""}
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setHubFilter("all")}>×</Button>
              </Badge>
            )}
          </div>
        )}
      </div>

      <Collapsible open={isFilterExpanded} onOpenChange={setIsFilterExpanded}>
        <CollapsibleContent className="space-y-4">
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-2" />
                Date Range
              </Label>
              <DatePickerWithRange 
                dateRange={{ 
                  from: dateRangeFilter.start || undefined,
                  to: dateRangeFilter.end || undefined
                }}
                onDateRangeChange={handleDateRangeChange} 
              />
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <Building className="h-4 w-4 mr-2" />
                Hub Office
              </Label>
              <Select value={hubFilter} onValueChange={setHubFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select hub office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Hub Offices</SelectItem>
                    {hubs.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <Tag className="h-4 w-4 mr-2" />
                State
              </Label>
              <Select 
                value={regionFilter} 
                onValueChange={setRegionFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All States</SelectItem>
                    {availableStates.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name} ({state.code})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <MapPin className="h-4 w-4 mr-2" />
                Locality
              </Label>
              <Select 
                value={locationFilter} 
                onValueChange={setLocationFilter}
                disabled={!availableLocalities.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select locality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Localities</SelectItem>
                    {availableLocalities.map((locality) => (
                      <SelectItem key={locality.id} value={locality.id}>
                        {locality.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm" htmlFor="projectName">
                <BarChart3 className="h-4 w-4 mr-2" />
                Project Name
              </Label>
              <Popover open={isProjectOpen} onOpenChange={setIsProjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isProjectOpen}
                    className="w-full justify-between text-left font-normal"
                  >
                    {projectNameFilter || "Select project..."}
                    <ArrowDownUp className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search projects..." />
                    <CommandEmpty>No project found.</CommandEmpty>
                    <CommandGroup className="max-h-[200px] overflow-y-auto">
                      <CommandItem
                        onSelect={() => {
                          setProjectNameFilter("");
                          setIsProjectOpen(false);
                        }}
                        className="text-sm"
                      >
                        <CheckCircle
                          className={cn(
                            "mr-2 h-4 w-4",
                            !projectNameFilter ? "opacity-100" : "opacity-0"
                          )}
                        />
                        All Projects
                      </CommandItem>
                      {projects.map((project) => (
                        <CommandItem
                          key={project}
                          onSelect={() => {
                            setProjectNameFilter(projectNameFilter === project ? "" : project);
                            setIsProjectOpen(false);
                          }}
                          className="text-sm"
                        >
                          <CheckCircle
                            className={cn(
                              "mr-2 h-4 w-4",
                              projectNameFilter === project ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {project}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <Users className="h-4 w-4 mr-2" />
                Assigned User
              </Label>
              <Select value={assignedUserFilter} onValueChange={setAssignedUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Users</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user} value={user}>{user}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <BadgeDollarSign className="h-4 w-4 mr-2" />
                Budget Range
              </Label>
              <div className="flex space-x-2">
                <Input
                  placeholder="Min"
                  type="number"
                  value={budgetRangeFilter.min || ""}
                  onChange={handleBudgetMinChange}
                />
                <Input
                  placeholder="Max"
                  type="number"
                  value={budgetRangeFilter.max || ""}
                  onChange={handleBudgetMaxChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm" htmlFor="version">
                <GitBranch className="h-4 w-4 mr-2" />
                Version (x.y)
              </Label>
              <Input
                id="version"
                placeholder="Filter by version (e.g. 1.2)"
                value={versionFilter}
                onChange={(e) => setVersionFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center text-sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Complexity
              </Label>
              <Select value={complexityFilter} onValueChange={setComplexityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select complexity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Complexities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MMPAdvancedFilters;
