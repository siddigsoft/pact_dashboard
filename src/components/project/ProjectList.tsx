
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isValid, parseISO } from 'date-fns';
import { 
  Calendar, 
  BarChart, 
  Tag,
  FileText, 
  ArrowRight,
  Search,
  CheckCircle,
  AlertCircle,
  Clock3,
  MapPin,
  UserCircle,
  DollarSign,
  Eye
} from 'lucide-react';

import { Project } from '@/types/project';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectListProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
  loading?: boolean;
}

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onViewProject,
  loading = false
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Format date safely - handles invalid dates
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return 'Invalid date';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  };
  
  // Filter projects based on search and filters
  const filteredProjects = projects.filter(project => {
    const matchesSearch = search === '' || 
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.projectCode.toLowerCase().includes(search.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(search.toLowerCase()));
      
    const matchesType = typeFilter === 'all' || project.projectType === typeFilter;
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="flex items-center gap-1"><FileText className="h-3 w-3" /> Draft</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Active</Badge>;
      case 'onHold':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> On Hold</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-blue-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'infrastructure':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">{type}</Badge>;
      case 'survey':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{type}</Badge>;
      case 'compliance':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{type}</Badge>;
      case 'monitoring':
        return <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200">{type}</Badge>;
      case 'training':
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">{type}</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">{type}</Badge>;
    }
  };
  
  if (loading) {
    return (
      <div className="w-full">
        <div className="flex flex-col md:flex-row gap-4 mb-4 items-start md:items-center justify-between">
          <div className="w-full md:w-96 h-9 bg-muted animate-pulse rounded-md"></div>
          <div className="flex gap-3">
            <div className="w-40 h-9 bg-muted animate-pulse rounded-md"></div>
            <div className="w-40 h-9 bg-muted animate-pulse rounded-md"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card key={item} className="overflow-hidden">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="w-3/4 h-5 bg-muted animate-pulse rounded-md"></div>
                    <div className="flex gap-1.5">
                      <div className="w-16 h-5 bg-muted animate-pulse rounded-md"></div>
                      <div className="w-20 h-5 bg-muted animate-pulse rounded-md"></div>
                    </div>
                  </div>
                  <div className="w-16 h-5 bg-muted animate-pulse rounded-md"></div>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <div className="w-full h-4 bg-muted animate-pulse rounded-md"></div>
                <div className="w-2/3 h-4 bg-muted animate-pulse rounded-md"></div>
                <div className="w-3/4 h-4 bg-muted animate-pulse rounded-md"></div>
              </CardContent>
              <CardFooter className="p-3 pt-0">
                <div className="w-full h-8 bg-muted animate-pulse rounded-md"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row gap-3 mb-4 items-start md:items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Project Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="infrastructure">Infrastructure</SelectItem>
              <SelectItem value="survey">Survey</SelectItem>
              <SelectItem value="compliance">Compliance</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="onHold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <Card 
              key={project.id} 
              className="overflow-hidden hover-elevate flex flex-col"
              data-testid={`card-project-${project.id}`}
            >
              {/* Zone 1: Header - Status badge + project code */}
              <CardHeader className="p-3 pb-2 space-y-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base leading-tight truncate" title={project.name}>
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 font-mono">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        {project.projectCode}
                      </Badge>
                      {getTypeBadge(project.projectType)}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(project.status)}
                  </div>
                </div>
              </CardHeader>

              {/* Zone 2: Body - Key meta rows with icons */}
              <CardContent className="p-3 pt-1 flex-grow space-y-2">
                {/* Dates */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground truncate">
                    {formatDate(project.startDate)} - {formatDate(project.endDate)}
                  </span>
                </div>

                {/* Project Manager */}
                {project.team?.projectManager && (
                  <div className="flex items-center gap-2 text-sm">
                    <UserCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <span className="text-muted-foreground">PM:</span>{' '}
                      <span className="font-medium">{project.team.projectManager}</span>
                    </span>
                  </div>
                )}

                {/* Location */}
                {project.location?.region && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground truncate">
                      {project.location.region}
                      {project.location.state && `, ${project.location.state}`}
                    </span>
                  </div>
                )}

                {/* Budget */}
                {project.budget && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground truncate">
                      {project.budget.total.toLocaleString()} {project.budget.currency}
                    </span>
                  </div>
                )}

                {/* Description preview */}
                {project.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
                    {project.description}
                  </p>
                )}
              </CardContent>

              {/* Zone 3: Footer - Quick actions */}
              <CardFooter className="p-3 pt-0 mt-auto">
                <Button 
                  className="w-full"
                  variant="default"
                  size="sm"
                  onClick={() => onViewProject(project.id)}
                  data-testid={`button-view-project-${project.id}`}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  View Details
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No projects found</h3>
          <p className="text-muted-foreground mt-2">
            {search || typeFilter !== 'all' || statusFilter !== 'all' 
              ? "Try adjusting your search filters" 
              : "Create a new project to get started"}
          </p>
          <Button className="mt-4" onClick={() => navigate("/projects/create")}>
            Create Project
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
