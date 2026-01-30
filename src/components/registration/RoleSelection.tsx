
import React from 'react';
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AppRole } from "@/types";
import { Users2 } from "lucide-react";  // Ensure this import is present

interface RoleSelectionProps {
  role: string;
  onRoleChange: (value: string) => void;
  isManagementTab: boolean;
}

const RoleSelection = ({ role, onRoleChange, isManagementTab }: RoleSelectionProps) => {
  const roles = isManagementTab ? [
    {
      value: 'Admin',
      title: 'System Administrator',
      description: [
        'Full system access and configuration control',
        'Manage user roles and permissions',
        'Oversee system updates and maintenance'
      ]
    },
    {
      value: 'CountryDirector',
      title: 'Country Director',
      description: [
        'Senior leadership oversight across all operations',
        'Monitor field activities, finances, and team performance',
        'Submit operational costs for admin approval'
      ]
    },
    {
      value: 'ICT',
      title: 'ICT Team Member',
      description: [
        'Maintain technical infrastructure and security',
        'Manage system integrations and APIs',
        'Support application deployment'
      ]
    },
    {
      value: 'Supervisor',
      title: 'Regional Supervisor',
      description: [
        'Oversee operations within assigned hub region',
        'Manage and coordinate field teams',
        'Review and validate collected data'
      ]
    },
    {
      value: 'Field Operation Manager (FOM)',
      title: 'Field Operations Manager',
      description: [
        'Strategic planning of field operations',
        'Quality control and performance monitoring',
        'Submit operational costs and reports'
      ]
    },
    {
      value: 'FinancialAdmin',
      title: 'Financial Administrator',
      description: [
        'Manage budgets and financial operations',
        'Process payments and approve expenses',
        'Generate financial analytics'
      ]
    },
    {
      value: 'DataTeam',
      title: 'Data Team',
      description: [
        'Analytics and reporting focus',
        'View projects, MMPs, site visits, and finances',
        'Create and export reports for analysis'
      ]
    }
  ] : [
    {
      value: 'DataCollector',
      title: 'Data Collector',
      description: [
        'Conduct on-site data collection and verification',
        'Use mobile tools for real-time data capture',
        'Submit site visit reports and cost submissions'
      ]
    },
    {
      value: 'Coordinator',
      title: 'Coordinator',
      description: [
        'Manage and oversee data collection teams',
        'Coordinate site visit schedules and assignments',
        'Submit operational costs and reports'
      ]
    }
  ];

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Users2 className="h-5 w-5" />
        Select Your Role
      </h3>
      <div className="space-y-4">
        <RadioGroup
          value={role}
          onValueChange={onRoleChange}
          className="grid grid-cols-1 gap-3"
        >
          {roles.map((roleOption) => (
            <Label
              key={roleOption.value}
              className={`flex flex-col space-y-2 border p-4 rounded-md cursor-pointer transition-colors ${
                role === roleOption.value ? 'bg-primary/5 border-primary' : ''
              }`}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={roleOption.value} id={roleOption.value} />
                <span className="font-semibold">{roleOption.title}</span>
              </div>
              <div className="text-sm text-muted-foreground pl-6">
                <ul className="list-disc space-y-1">
                  {roleOption.description.map((desc, idx) => (
                    <li key={idx}>{desc}</li>
                  ))}
                </ul>
              </div>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
};

export default RoleSelection;
