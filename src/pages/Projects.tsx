import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProjectList from '@/components/project/ProjectList';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useAppContext } from '@/context/AppContext';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { projects, loading } = useProjectContext();
  const { roles } = useAppContext();

  const normalizedRoles = (roles || []).map(r => String(r).toLowerCase());
  const canAccessFieldOpManager =
    normalizedRoles.includes('admin') || normalizedRoles.includes('fieldopmanager');

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  return (
    <div className="space-y-10 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 py-8 px-2 md:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-600/90 to-blue-400/80 dark:from-blue-900 dark:to-blue-700 p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="hover:bg-blue-100 dark:hover:bg-blue-900/40"
          >
            <ChevronLeft className="h-5 w-5 text-white dark:text-blue-200" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">
              Projects
            </h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium">
              Manage project planning and activity management
            </p>
          </div>
        </div>
        <Button
          className="bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2 rounded-full font-semibold"
          onClick={() => navigate('/projects/create')}
        >
          <Plus className="h-5 w-5 mr-2" />
          Create Project
        </Button>
      </div>
      
      <nav className="flex gap-3 mb-10 bg-white/80 dark:bg-gray-900/80 border border-blue-100 dark:border-blue-800 rounded-xl shadow p-3 px-4">
        <button
          className="px-4 py-2 rounded-lg font-semibold transition-all duration-150 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 focus:ring-2 focus:ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
          onClick={() => navigate('/projects')}
        >
          Projects
        </button>
        <button
          className="px-4 py-2 rounded-lg font-semibold transition-all duration-150 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 focus:ring-2 focus:ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
          onClick={() => navigate('/mmp')}
        >
          MMP Management
        </button>
        <button
          className="px-4 py-2 rounded-lg font-semibold transition-all duration-150 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 focus:ring-2 focus:ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
          onClick={() => navigate('/site-visits')}
        >
          Site Visits
        </button>
        <button
          className="px-4 py-2 rounded-lg font-semibold transition-all duration-150 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 focus:ring-2 focus:ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
          onClick={() => navigate('/archive')}
        >
          Archive
        </button>
        {canAccessFieldOpManager && (
          <button
            className="px-4 py-2 rounded-lg font-semibold transition-all duration-150 bg-blue-500 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-300 dark:bg-blue-700 dark:hover:bg-blue-800"
            onClick={() => navigate('/field-operation-manager')}
          >
            Field Operation Manager
          </button>
        )}
      </nav>
      
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
        {/* Add status filter UI if needed */}
        {/* <StatusFilter ... /> */}
        <ProjectList 
          projects={projects} 
          onViewProject={handleViewProject}
          loading={loading}
          // Pass workflow status if ProjectList supports it
        />
      </div>
    </div>
  );
};

export default ProjectsPage;
