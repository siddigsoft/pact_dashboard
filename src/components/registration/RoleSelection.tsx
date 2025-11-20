
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
        'Monitor system performance and security',
        'Oversee system updates and maintenance',
        'Provide technical support and troubleshooting'
      ]
    },
    {
  value: 'ICT',
      title: 'ICT Team Member',
      description: [
        'Maintain and optimize technical infrastructure',
        'Implement robust data security measures',
        'Manage system integrations and APIs',
        'Support mobile and web application deployment',
        'Handle technical incident response'
      ]
    },
    {
  value: 'Supervisor',
      title: 'Regional Supervisor',
      description: [
        'Oversee all operations within assigned hub region',
        'Manage and coordinate field teams across multiple states',
        'Ensure compliance with procedures and standards',
        'Review and validate collected data',
        'Generate comprehensive performance reports'
      ]
    },
    {
  value: 'Field Operation Manager (FOM)',
      title: 'Field Operations Manager',
      description: [
        'Strategic planning of field operations',
        'Resource allocation and team optimization',
        'Quality control and performance monitoring',
        'Stakeholder communication and reporting',
        'Process improvement and standardization'
      ]
    },
    {
  value: 'FinancialAdmin',
      title: 'Financial Administrator',
      description: [
        'Manage budgets and financial operations',
        'Process payments and expense reports',
        'Monitor financial compliance',
        'Generate financial analytics and forecasts',
        'Coordinate with external financial partners'
      ]
    }
  ] : [
    {
  value: 'DataCollector',
      title: 'Data Collector',
      description: [
        'Conduct on-site data collection and verification',
        'Document site conditions and gather required information',
        'Use mobile tools for real-time data capture',
        'Submit accurate and timely site visit reports',
        'Follow assigned schedules and location-based tasks'
      ]
    },
    {
  value: 'Coordinator',
      title: 'Coordinator',
      description: [
        'Manage and oversee data collection teams',
        'Review and validate submitted data',
        'Coordinate site visit schedules and assignments',
        'Ensure quality control of collected information',
        'Provide support and guidance to data collectors'
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
