
import React from 'react';
import { User } from '@/types';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock, User as UserIcon, Mail, Phone } from 'lucide-react';

interface PendingApprovalsListProps {
  pendingUsers: User[];
  onApprove: (userId: string) => Promise<void>;
  onReject: (userId: string) => Promise<void>;
  isLoadingApproval: string | null;
}

const PendingApprovalsList: React.FC<PendingApprovalsListProps> = ({ 
  pendingUsers, 
  onApprove, 
  onReject, 
  isLoadingApproval 
}) => {
  
  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase();
  };

  if (pendingUsers.length === 0) {
    return (
      <Card className="bg-gray-50 dark:bg-gray-950">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">No Pending Approvals</h3>
            <p className="text-muted-foreground max-w-md">
              All users have been approved. New users will appear here when they register.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pending Approvals ({pendingUsers.length})</h2>
          <p className="text-muted-foreground">Users waiting for account approval</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pendingUsers.map((user) => (
          <Card key={user.id} className="overflow-hidden border-amber-200 dark:border-amber-800">
            <CardHeader className="bg-amber-50 dark:bg-amber-900/20 pb-2">
              <div className="flex justify-between items-start">
                <Badge variant="outline" className="bg-amber-100 text-amber-800 mb-2">
                  <Clock className="h-3 w-3 mr-1" /> Pending Approval
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(user.createdAt || Date.now()).toLocaleDateString()}
                </span>
              </div>
              <CardTitle className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user.name ? getInitials(user.name) : <UserIcon className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                {user.name || 'Unnamed User'}
              </CardTitle>
              <CardDescription>{user.role || 'No role assigned'}</CardDescription>
            </CardHeader>
            
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate">{user.email}</span>
                </div>
                
                {user.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.phone}</span>
                  </div>
                )}
                
                {user.employeeId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Employee ID:</span>
                    <span className="text-sm">{user.employeeId}</span>
                  </div>
                )}
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between pt-2 gap-2">
              <Button 
                variant="default" 
                className="w-full" 
                size="sm"
                onClick={() => onApprove(user.id)}
                disabled={isLoadingApproval === user.id}
              >
                <Check className="h-4 w-4 mr-1" />
                {isLoadingApproval === user.id ? "Processing..." : "Approve"}
              </Button>
              <Button 
                variant="outline" 
                className="w-full" 
                size="sm"
                onClick={() => onReject(user.id)}
                disabled={isLoadingApproval === user.id}
              >
                <X className="h-4 w-4 mr-1" />
                {isLoadingApproval === user.id ? "Processing..." : "Reject"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PendingApprovalsList;
