
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isValid, parseISO } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  BarChart, 
  Tag,
  FileText, 
  ArrowRight,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock3,
  Layers,
  UserCircle
} from 'lucide-react';

import { Project } from '@/types/project';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="flex justify-between items-center mb-6">
          <div className="w-full md:w-64 h-10 bg-muted animate-pulse rounded-md"></div>
          <div className="hidden md:flex gap-2">
            <div className="w-32 h-10 bg-muted animate-pulse rounded-md"></div>
            <div className="w-32 h-10 bg-muted animate-pulse rounded-md"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card key={item} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="w-3/4 h-6 bg-muted animate-pulse rounded-md"></div>
                <div className="w-1/2 h-4 bg-muted animate-pulse rounded-md mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-muted animate-pulse rounded-md"></div>
                  <div className="w-full h-4 bg-muted animate-pulse rounded-md"></div>
                  <div className="w-3/4 h-4 bg-muted animate-pulse rounded-md"></div>
                </div>
              </CardContent>
              <CardFooter>
                <div className="w-full h-10 bg-muted animate-pulse rounded-md"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center justify-between">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col">
              <CardHeader className="pb-2 bg-muted/30 relative">
                <CardTitle className="text-lg font-medium">{project.name}</CardTitle>
                <CardDescription className="flex items-center gap-1 text-xs">
                  <Tag className="h-3 w-3" /> {project.projectCode}
                </CardDescription>
                <div className="absolute top-4 right-4">
                  {getStatusBadge(project.status)}
                </div>
              </CardHeader>
              <CardContent className="py-4 flex-grow">
                <div className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <div className="flex flex-wrap items-center space-x-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {formatDate(project.startDate)} - {formatDate(project.endDate)}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 text-sm">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Type: {getTypeBadge(project.projectType)}</span>
                    </div>
                    
                    {project.team?.projectManager && (
                      <div className="flex items-center space-x-2 text-sm">
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          PM: <span className="font-medium text-foreground">{project.team.projectManager}</span>
                        </span>
                      </div>
                    )}

                    {project.location?.region && (
                      <div className="flex items-center space-x-2 text-sm">
                        <svg className="h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="text-muted-foreground">
                          {project.location.region}
                          {project.location.state && `, ${project.location.state}`}
                        </span>
                      </div>
                    )}
                    
                    {project.budget && (
                      <div className="flex items-center space-x-2 text-sm">
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Budget: {project.budget.total.toLocaleString()} {project.budget.currency}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4 border-t border-border/50 bg-muted/10">
                <Button 
                  className="w-full flex items-center justify-center"
                  variant="default"
                  onClick={() => onViewProject(project.id)}
                >
                  View Details <ArrowRight className="ml-2 h-4 w-4" />
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
