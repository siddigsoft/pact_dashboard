import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Plus, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { RoleWithPermissions, AssignRoleRequest } from '@/types/roles';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface UserRoleAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleWithPermissions | null;
  users: User[];
  assignedUsers: User[];
  availableRoles: RoleWithPermissions[];
  onAssignRole: (data: AssignRoleRequest) => Promise<void>;
  onRemoveRole: (userId: string, roleId: string) => Promise<void>;
  isLoading: boolean;
}

export const UserRoleAssignment: React.FC<UserRoleAssignmentProps> = ({
  open,
  onOpenChange,
  role,
  users,
  assignedUsers,
  availableRoles,
  onAssignRole,
  onRemoveRole,
  isLoading
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [makePrimary, setMakePrimary] = useState(false);

  const unassignedUsers = users.filter(user => 
    !assignedUsers.some(assigned => assigned.id === user.id)
  );

  const filteredUsers = unassignedUsers.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAssignRole = async () => {
    if (!selectedUserId || !role || isAssigning) return;

    setIsAssigning(true);
    try {
      const assignData: AssignRoleRequest = { user_id: selectedUserId, role_id: role.id, make_primary: makePrimary };

      await onAssignRole(assignData);
      setSelectedUserId('');
      setSearchTerm('');
      setMakePrimary(false);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveRole = async (userId: string) => {
    if (!role) return;

    await onRemoveRole(userId, role.id);
  };

  const handleMakePrimary = async (userId: string) => {
    if (!role || isAssigning) return;

    setIsAssigning(true);
    try {
      await onAssignRole({
        user_id: userId,
        role_id: role.id,
        make_primary: true,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(part => part[0]).join('').toUpperCase().substring(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* make dialog vertically scrollable when content is tall */}
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Users for {role?.display_name}</DialogTitle>
          <DialogDescription>
            Assign or remove users from this role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Assign New User */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Assign New User</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                {/* allow a taller dropdown and scrolling for long user lists */}
                <SelectContent className="max-h-[40vh]">
                  {filteredUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAssignRole} 
                disabled={!selectedUserId || isAssigning || isLoading}
              >
                {isAssigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign
                  </>
                )}
              </Button>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <Checkbox checked={makePrimary} onCheckedChange={(checked) => setMakePrimary(checked === true)} className="mt-0.5" />
              <span>
                <span className="font-semibold">Make {role?.display_name ?? role?.name ?? 'this role'} the primary display role</span>
                <span className="mt-0.5 block text-amber-800">This changes the role shown in the user header. Existing role assignments are kept.</span>
              </span>
            </label>
          </div>

          {/* Assigned Users */}
          <div className="space-y-4">
            {assignedUsers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No users assigned to this role</p>
            ) : (
              <div className="border rounded-lg">
                <div className="max-h-[50vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-44">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} alt={user.name} />
                              <AvatarFallback className="text-xs">
                                {getInitials(user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500">{user.email}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMakePrimary(user.id)}
                            disabled={isAssigning || isLoading}
                          >
                            Make primary
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRole(user.id)}
                            disabled={isAssigning || isLoading}
                            aria-label={`Remove ${user.name} from ${role?.display_name ?? role?.name ?? 'this role'}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                  </div>
                </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
