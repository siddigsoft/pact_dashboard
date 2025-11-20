
import React, { useState, useEffect } from 'react';
import { Plus, UserPlus, UserMinus, X, Briefcase, Users } from 'lucide-react';
import { 
  Project, 
  ProjectRole, 
  ProjectTeamMember 
} from '@/types/project';
import { User } from '@/types';
import { useUser } from '@/context/user/UserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface TeamCompositionManagerProps {
  project: Project;
  onTeamChange: (teamMembers: ProjectTeamMember[]) => void;
}

export const TeamCompositionManager: React.FC<TeamCompositionManagerProps> = ({
  project,
  onTeamChange,
}) => {
  const { users } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('dataCollector');
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>(
    project.team?.teamComposition || []
  );

  // Calculate current workload for each user
  const calculateWorkload = (userId: string): number => {
    // In a real app, you would calculate this based on assigned tasks, activities, etc.
    // For this example, we'll use a random number between 0-100
    return Math.floor(Math.random() * 100);
  };

  const filteredUsers = users.filter(user => {
    const isAlreadyTeamMember = teamMembers.some(member => member.userId === user.id);
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.role && user.role.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return !isAlreadyTeamMember && matchesSearch;
  });

  const handleAddTeamMember = (user: User) => {
    const newMember: ProjectTeamMember = {
      userId: user.id,
      name: user.name,
      role: selectedRole,
      joinedAt: new Date().toISOString(),
      workload: user.performance?.currentWorkload || calculateWorkload(user.id),
    };

    const updatedTeam = [...teamMembers, newMember];
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    setDialogOpen(false);
  };

  const handleRemoveTeamMember = (userId: string) => {
    const updatedTeam = teamMembers.filter(member => member.userId !== userId);
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
  };

  const handleRoleChange = (userId: string, role: ProjectRole) => {
    const updatedTeam = teamMembers.map(member => 
      member.userId === userId ? { ...member, role } : member
    );
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
  };

  const getWorkloadColor = (workload?: number): string => {
    if (!workload) return "bg-gray-200";
    if (workload < 30) return "bg-green-500";
    if (workload < 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Composition</CardTitle>
          <CardDescription>
            Assign team members and roles for this project
          </CardDescription>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
        </Button>
      </CardHeader>
      
      <CardContent>
        {teamMembers.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[100px] text-right">Workload</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.name}`} alt={member.name} />
                          <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={member.role} 
                        onValueChange={(value) => handleRoleChange(member.userId, value as ProjectRole)}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="projectManager">Project Manager</SelectItem>
                          <SelectItem value="fieldAssistant">Field Assistant</SelectItem>
                          <SelectItem value="dataCollector">Data Collector</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="coordinator">Coordinator</SelectItem>
                          <SelectItem value="analyst">Analyst</SelectItem>
                          <SelectItem value="reviewer">Reviewer</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        <div className="w-full max-w-[100px] h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${getWorkloadColor(member.workload)}`} 
                            style={{ width: `${member.workload || 0}%` }}
                          ></div>
                        </div>
                        <span className="ml-2 text-xs">{member.workload || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleRemoveTeamMember(member.userId)}
                      >
                        <UserMinus className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm">No team members assigned yet</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
            </Button>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by name, email or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as ProjectRole)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projectManager">Project Manager</SelectItem>
                    <SelectItem value="fieldAssistant">Field Assistant</SelectItem>
                    <SelectItem value="dataCollector">Data Collector</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="coordinator">Coordinator</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[100px] text-right">Workload</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => {
                        const workload = user.performance?.currentWorkload || calculateWorkload(user.id);
                        const isOverloaded = workload > 80;
                        
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} />
                                  <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{user.name}</p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{user.role}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end">
                                <div className="w-full max-w-[100px] h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${getWorkloadColor(workload)}`} 
                                    style={{ width: `${workload}%` }}
                                  ></div>
                                </div>
                                <span className="ml-2 text-xs">{workload}%</span>
                              </div>
                              {isOverloaded && (
                                <Badge variant="outline" className="ml-2 text-xs bg-red-50 text-red-700 border-red-200">
                                  Overloaded
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" onClick={() => handleAddTeamMember(user)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          No users found matching your search criteria
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
