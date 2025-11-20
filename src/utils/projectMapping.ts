
import { Project } from "@/types/project";

export function mapProjectToDbProject(project: Project): Record<string, any> {
  // Ensure all dates are in ISO format
  const formattedDates = {
    start_date: project.startDate ? new Date(project.startDate).toISOString() : undefined,
    end_date: project.endDate ? new Date(project.endDate).toISOString() : undefined
  };

  // Map the project data to database structure
  return {
    name: project.name,
    project_code: project.projectCode,
    description: project.description,
    project_type: project.projectType,
    status: project.status,
    ...formattedDates,
    budget: project.budget ? {
      ...project.budget,
      updated_at: new Date().toISOString()
    } : null,
    location: project.location ? {
      ...project.location,
      updated_at: new Date().toISOString()
    } : null,
    team: project.team ? {
      ...project.team,
      updated_at: new Date().toISOString()
    } : null
  };
}

export function mapDbProjectToProject(dbProject: Record<string, any>): Project {
  return {
    id: dbProject.id,
    name: dbProject.name,
    projectCode: dbProject.project_code,
    description: dbProject.description,
    projectType: dbProject.project_type,
    status: dbProject.status,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    budget: dbProject.budget,
    location: dbProject.location,
    team: dbProject.team,
    activities: dbProject.activities || [],
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at
  };
}
