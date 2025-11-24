import React from 'react';
import { cn } from '@/lib/utils';
import { Shield, UserCog, Eye, Briefcase, Users, Laptop, DollarSign, LineChart } from 'lucide-react';

type RoleType = string;

interface RoleBadgeProps {
  role: RoleType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'text-xs px-2 py-1 gap-1',
  md: 'text-sm px-2.5 py-1.5 gap-1.5',
  lg: 'text-base px-3 py-2 gap-2',
};

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
};

const getRoleConfig = (role: string) => {
  const normalizedRole = role.toLowerCase();
  
  switch (normalizedRole) {
    case 'admin':
      return {
        gradient: 'bg-gradient-to-r from-red-500 to-pink-500',
        border: 'border-red-400/50',
        glow: 'shadow-lg shadow-red-500/20',
        icon: Shield,
        iconColor: 'text-red-100',
        label: 'Admin'
      };
    case 'ict':
      return {
        gradient: 'bg-gradient-to-r from-purple-500 to-indigo-500',
        border: 'border-purple-400/50',
        glow: 'shadow-lg shadow-purple-500/20',
        icon: Laptop,
        iconColor: 'text-purple-100',
        label: 'ICT'
      };
    case 'fom':
      return {
        gradient: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        border: 'border-blue-400/50',
        glow: 'shadow-lg shadow-blue-500/20',
        icon: Briefcase,
        iconColor: 'text-blue-100',
        label: 'Field Operations Manager'
      };
    case 'financialadmin':
      return {
        gradient: 'bg-gradient-to-r from-green-500 to-emerald-500',
        border: 'border-green-400/50',
        glow: 'shadow-lg shadow-green-500/20',
        icon: DollarSign,
        iconColor: 'text-green-100',
        label: 'Financial Admin'
      };
    case 'supervisor':
      return {
        gradient: 'bg-gradient-to-r from-amber-500 to-orange-500',
        border: 'border-amber-400/50',
        glow: 'shadow-lg shadow-amber-500/20',
        icon: LineChart,
        iconColor: 'text-amber-100',
        label: 'Supervisor'
      };
    case 'coordinator':
      return {
        gradient: 'bg-gradient-to-r from-teal-500 to-cyan-500',
        border: 'border-teal-400/50',
        glow: 'shadow-lg shadow-teal-500/20',
        icon: UserCog,
        iconColor: 'text-teal-100',
        label: 'Coordinator'
      };
    case 'datacollector':
      return {
        gradient: 'bg-gradient-to-r from-sky-500 to-blue-500',
        border: 'border-sky-400/50',
        glow: 'shadow-lg shadow-sky-500/20',
        icon: Users,
        iconColor: 'text-sky-100',
        label: 'Data Collector'
      };
    case 'reviewer':
      return {
        gradient: 'bg-gradient-to-r from-violet-500 to-purple-500',
        border: 'border-violet-400/50',
        glow: 'shadow-lg shadow-violet-500/20',
        icon: Eye,
        iconColor: 'text-violet-100',
        label: 'Reviewer'
      };
    default:
      return {
        gradient: 'bg-gradient-to-r from-gray-500 to-slate-500',
        border: 'border-gray-400/50',
        glow: 'shadow-lg shadow-gray-500/20',
        icon: Users,
        iconColor: 'text-gray-100',
        label: role.charAt(0).toUpperCase() + role.slice(1)
      };
  }
};

const RoleBadge: React.FC<RoleBadgeProps> = ({ 
  role, 
  size = 'sm',
  className
}) => {
  const config = getRoleConfig(role);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border text-white font-semibold transition-all hover:scale-105',
        config.gradient,
        config.border,
        config.glow,
        sizeClasses[size],
        className
      )}
      data-testid={`badge-role-${role.toLowerCase()}`}
    >
      <Icon className={cn(iconSizeClasses[size], config.iconColor)} />
      <span>{config.label}</span>
    </div>
  );
};

export default RoleBadge;
