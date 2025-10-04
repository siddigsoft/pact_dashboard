
import React, { useState, useEffect } from "react";
import { User } from "@/types";
import { Card } from "@/components/ui/card";
import { 
  Users, 
  ShieldCheck, 
  MonitorSmartphone,
  LineChart, 
  UserCheck,
  Briefcase,
  ClipboardList,
  MapPin,
  Building,
  RotateCcw
} from "lucide-react";
import { sudanStates, hubs } from "@/data/sudanStates";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useRoleManagement } from "@/context/role-management/RoleManagementContext";

interface UserRoleDashboardProps {
  users: User[];
  onRoleClick?: (role: string) => void;
  onStateChange?: (stateId: string | null) => void;
  selectedState?: string | null;
  onHubChange?: (hubId: string | null) => void;
  selectedHub?: string | null;
}

const UserRoleDashboard: React.FC<UserRoleDashboardProps> = ({ 
  users, 
  onRoleClick,
  onStateChange,
  selectedState,
  onHubChange,
  selectedHub
}) => {
  // State for available states based on hub selection
  const [availableStates, setAvailableStates] = useState(sudanStates);

  // Role management context for dynamic roles and assignments
  const { roles: allRoles, getUserRolesByUserId } = useRoleManagement();

  // Helpers to count users including assignments stored in user_roles
  const countUsersWithSystemRole = (role: string) => {
    return users.reduce((acc, u) => {
      const has = u.role === role
        || (Array.isArray(u.roles) && (u.roles as any[]).includes(role))
        || getUserRolesByUserId(u.id).some(ur => ur.role === role);
      return acc + (has ? 1 : 0);
    }, 0);
  };

  const countUsersWithCustomRole = (roleId: string) => {
    return users.reduce((acc, u) => {
      const has = getUserRolesByUserId(u.id).some(ur => ur.role_id === roleId);
      return acc + (has ? 1 : 0);
    }, 0);
  };

  // Count users by state
  const stateUserCounts = users.reduce((acc, user) => {
    if (user.stateId) {
      acc[user.stateId] = (acc[user.stateId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Count users by hub
  const hubUserCounts = users.reduce((acc, user) => {
    if (user.stateId) {
      const userHub = hubs.find(hub => hub.states.includes(user.stateId || ""));
      if (userHub) {
        acc[userHub.id] = (acc[userHub.id] || 0) + 1;
      }
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Effect to update available states when hub changes
  useEffect(() => {
    if (selectedHub && selectedHub !== "all") {
      const hub = hubs.find(h => h.id === selectedHub);
      
      if (hub) {
        // Filter states based on hub states
        const filteredStates = sudanStates.filter(state => 
          hub.states.includes(state.id)
        );
        
        setAvailableStates(filteredStates);
        
        // Reset state selection if current state is not in this hub
        if (selectedState && !hub.states.includes(selectedState)) {
          if (onStateChange) {
            onStateChange(null);
          }
        }
      } else {
        setAvailableStates(sudanStates);
      }
    } else {
      setAvailableStates(sudanStates);
    }
  }, [selectedHub, selectedState, onStateChange]);

  // Define role cards with appropriate icons and colors
  const roleCards = [
    {
      role: "admin",
      displayName: "Admin",
      icon: ShieldCheck,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      role: "ict",
      displayName: "ICT",
      icon: MonitorSmartphone,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      role: "fom",
      displayName: "FOM",
      icon: LineChart,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      role: "supervisor",
      displayName: "Supervisor",
      icon: UserCheck,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
    {
      role: "coordinator",
      displayName: "Coordinator",
      icon: Briefcase,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
    {
      role: "dataCollector",
      displayName: "Data Collector",
      icon: ClipboardList,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
    },
  ];

  const handleRoleClick = (role: string) => {
    if (onRoleClick) {
      onRoleClick(role);
    }
  };

  const handleStateChange = (value: string) => {
    if (onStateChange) {
      onStateChange(value === "all" ? null : value);
    }
  };

  const handleHubChange = (value: string) => {
    if (onHubChange) {
      onHubChange(value === "all" ? null : value);
    }
  };

  // Reset all filters
  const handleReset = () => {
    if (onHubChange) {
      onHubChange(null);
    }
    if (onStateChange) {
      onStateChange(null);
    }
    setAvailableStates(sudanStates);
  };

  return (
    <div className="space-y-6 mb-6">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {roleCards.map((card) => {
          const count = countUsersWithSystemRole(card.role);
          const Icon = card.icon;
          
          return (
            <Card 
              key={card.role} 
              className="hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col items-center justify-center p-4 cursor-pointer"
              onClick={() => handleRoleClick(`sys:${card.role}`)}
            >
              <div 
                className={`${card.bgColor} p-4 rounded-full shadow-md flex items-center justify-center mb-3`} 
                aria-label={`${card.role} (${count} users)`}
                title={`${card.role} (${count} users)`}
              >
                <Icon 
                  className={`${card.color}`} 
                  size={32}
                  strokeWidth={1.5} 
                />
              </div>
              <p className="font-bold text-center font-sans text-sm tracking-wide">
                {card.displayName}
                <span className="block text-xs text-gray-500 font-normal mt-1">
                  {count} {count === 1 ? 'user' : 'users'}
                </span>
              </p>
            </Card>
          );
        })}

        {/* Custom role cards */}
        {allRoles.filter(r => !r.is_system_role).map(r => {
          const count = countUsersWithCustomRole(r.id);
          const Icon = ShieldCheck;
          const roleKey = `custom:${r.id}`;
          return (
            <Card
              key={roleKey}
              className="hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col items-center justify-center p-4 cursor-pointer"
              onClick={() => handleRoleClick(roleKey)}
            >
              <div
                className={`bg-slate-100 p-4 rounded-full shadow-md flex items-center justify-center mb-3`}
                aria-label={`${r.display_name || r.name} (${count} users)`}
                title={`${r.display_name || r.name} (${count} users)`}
              >
                <Icon className={`text-slate-600`} size={32} strokeWidth={1.5} />
              </div>
              <p className="font-bold text-center font-sans text-sm tracking-wide">
                {r.display_name || r.name}
                <span className="block text-xs text-gray-500 font-normal mt-1">
                  {count} {count === 1 ? 'user' : 'users'}
                </span>
              </p>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 border rounded-lg p-3 bg-gray-50 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-sm">Hub Office:</span>
          </div>
          <Select
            value={selectedHub || "all"}
            onValueChange={handleHubChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select hub office" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Hub Offices</SelectItem>
              {hubs.map((hub) => (
                <SelectItem key={hub.id} value={hub.id}>
                  {hub.name} {hubUserCounts[hub.id] ? `(${hubUserCounts[hub.id]})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 border rounded-lg p-3 bg-gray-50 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-sm">State:</span>
          </div>
          <Select
            value={selectedState || "all"}
            onValueChange={handleStateChange}
            disabled={!selectedHub || selectedHub === "all"}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {availableStates.map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  {state.name} {stateUserCounts[state.id] ? `(${stateUserCounts[state.id]})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {(selectedHub || selectedState) && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-1"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </Button>
        )}
      </div>
    </div>
  );
};

export default UserRoleDashboard;
