
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProjectForm from '@/components/project/ProjectForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Project } from '@/types/project';

const CreateProject = () => {
  const navigate = useNavigate();
  const { addProject } = useProjectContext();

  const handleSubmit = async (project: Project) => {
    const createdProject = await addProject(project);
    if (createdProject) {
      navigate(`/projects/${createdProject.id}`);
    } else {
      // If creation failed, stay on the form page
      // Error toast is already shown by addProject
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/projects")}
          className="hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <p className="text-muted-foreground">
            Set up a new project in the planning system
          </p>
        </div>
      </div>

      <ProjectForm onSubmit={handleSubmit} />
    </div>
  );
};

export default CreateProject;
