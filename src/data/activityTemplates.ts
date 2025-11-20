
import { ProjectType, ProjectActivity } from '@/types/project';

export interface ActivityTemplate {
  name: string;
  description: string;
  defaultSubActivities: {
    name: string;
    description: string;
  }[];
}

export const activityTemplatesByProjectType: Record<ProjectType, ActivityTemplate[]> = {
  infrastructure: [
    {
      name: 'Site Assessment',
      description: 'Initial assessment of the infrastructure site',
      defaultSubActivities: [
        { name: 'Location Survey', description: 'Survey of the proposed location' },
        { name: 'Environmental Assessment', description: 'Assessment of environmental impact' },
        { name: 'Safety Inspection', description: 'Initial safety inspection of the site' }
      ]
    },
    {
      name: 'Construction Planning',
      description: 'Planning phase for construction activities',
      defaultSubActivities: [
        { name: 'Resource Allocation', description: 'Planning of required resources' },
        { name: 'Timeline Development', description: 'Development of construction timeline' }
      ]
    }
  ],
  survey: [
    {
      name: 'Field Survey',
      description: 'Comprehensive field data collection',
      defaultSubActivities: [
        { name: 'Initial Data Collection', description: 'First round of data collection' },
        { name: 'Data Verification', description: 'Verification of collected data' },
        { name: 'Follow-up Survey', description: 'Additional data collection if needed' }
      ]
    }
  ],
  compliance: [
    {
      name: 'Compliance Audit',
      description: 'Regulatory compliance assessment',
      defaultSubActivities: [
        { name: 'Document Review', description: 'Review of compliance documentation' },
        { name: 'Field Inspection', description: 'On-site compliance inspection' }
      ]
    }
  ],
  monitoring: [
    {
      name: 'Project Monitoring',
      description: 'Ongoing project monitoring activities',
      defaultSubActivities: [
        { name: 'Progress Tracking', description: 'Track project milestones' },
        { name: 'Performance Evaluation', description: 'Evaluate project performance' }
      ]
    }
  ],
  training: [
    {
      name: 'Training Program',
      description: 'Training and capacity building activities',
      defaultSubActivities: [
        { name: 'Needs Assessment', description: 'Assessment of training needs' },
        { name: 'Training Delivery', description: 'Conduct training sessions' },
        { name: 'Evaluation', description: 'Post-training evaluation' }
      ]
    }
  ],
  other: [
    {
      name: 'General Project Activities',
      description: 'Standard project management activities',
      defaultSubActivities: [
        { name: 'Planning', description: 'Activity planning' },
        { name: 'Implementation', description: 'Activity implementation' },
        { name: 'Review', description: 'Activity review and documentation' }
      ]
    }
  ]
};
