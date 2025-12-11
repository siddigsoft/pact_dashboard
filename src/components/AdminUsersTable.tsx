
import React from 'react';
import { User } from '@/types';
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppRole } from '@/types/roles';
import { Shield, User as UserIcon, Check, X } from 'lucide-react';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import UserClassificationBadge from '@/components/user/UserClassificationBadge';

interface AdminUsersTableProps {
  users?: User[];
}

const AdminUsersTable: React.FC<AdminUsersTableProps> = ({ users }) => {
  const { hasRole } = useAppContext();
  
  // If users are not provided, use the global users from context
  const { users: allUsers } = useAppContext();
  const displayUsers = users || allUsers;
  const { getUserRolesByUserId, roles: allRoles } = useRoleManagement();
  
  // Enhanced filtering for admin users - check both role property and roles array
  const adminUsers = displayUsers.filter(user => {
    // Check the role property
    if (user.role === 'admin') {
      return true;
    }
    
    // Check the roles array if it exists
    if (user.roles && Array.isArray(user.roles)) {
      return user.roles.includes('admin' as any);
    }
    
    return false;
  });
  
  if (adminUsers.length === 0) {
    return (
      <Card className="p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30 mb-6">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Shield size={20} />
          <p>No admin users found in the system.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border mb-6">
      <div className="bg-muted/50 p-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-medium">System Administrators ({adminUsers.length})</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Roles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adminUsers.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium flex items-center gap-2">
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon size={16} className="text-primary" />
                  </div>
                )}
                {user.name || user.fullName || user.username || 'Unknown User'}
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                {user.isApproved ? (
                  <div className="flex items-center">
                    <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-200">
                      <Check size={12} className="mr-1" /> Active
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-200">
                      <X size={12} className="mr-1" /> Pending
                    </Badge>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <UserClassificationBadge userId={user.id} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(() => {
                    const urs = getUserRolesByUserId(user.id);
                    const sysSet = new Set<string>();
                    if (user.role) sysSet.add(user.role);
                    if (Array.isArray(user.roles)) user.roles.forEach(r => sysSet.add(r));
                    urs.forEach(ur => { if (ur.role) sysSet.add(ur.role as string); });
                    const sysLabels = Array.from(sysSet);
                    const customLabels = urs
                      .filter(ur => ur.role_id)
                      .map(ur => {
                        const r = allRoles.find(rr => rr.id === ur.role_id);
                        return r?.display_name || r?.name || 'custom';
                      });
                    const labels = [...sysLabels, ...customLabels];
                    return labels.length > 0 ? labels.map((label, idx) => (
                      <Badge key={idx} variant={label === 'admin' ? 'default' : 'outline'}>
                        {label}
                      </Badge>
                    )) : (
                      <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                        {user.role}
                      </Badge>
                    );
                  })()}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export default AdminUsersTable;
