
import React from 'react';
import { User } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import {
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Award,
  Clock,
  UserCheck,
  AlertCircle
} from 'lucide-react';

interface UserProfileProps {
  user: User;
  showActions?: boolean;
}

const UserProfile: React.FC<UserProfileProps> = ({ user, showActions = true }) => {
  const navigate = useNavigate();
  const { approveUser, rejectUser, hasRole } = useAppContext();
  const [isLoading, setIsLoading] = React.useState(false);
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };
  
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'busy':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const handleApprove = async () => {
    setIsLoading(true);
    await approveUser(user.id);
    setIsLoading(false);
  };

  const handleReject = async () => {
    setIsLoading(true);
    await rejectUser(user.id);
    setIsLoading(false);
  };

  // Check if the current user is an admin
  const isAdmin = hasRole('Admin');
  
  return (
    <Card className="overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-primary/20 to-secondary/20"></div>
      <div className="relative px-4">
        <Avatar className="h-20 w-20 border-4 border-background absolute -top-10">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </div>
      
      <CardHeader className="pt-12">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{user.name}</CardTitle>
            <div className="flex items-center mt-1">
              <Badge className="mr-2 capitalize">{user.role}</Badge>
              <div className="flex items-center">
                <span className={`h-2 w-2 rounded-full ${getStatusColor(user.availability)} mr-1`}></span>
                <span className="text-xs text-muted-foreground">
                  {user.availability === 'online' ? 'Available' : 
                   user.availability === 'busy' ? 'Busy' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          
          {!user.isApproved && (
            <Badge variant="destructive">Pending Approval</Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm">{user.email}</span>
          </div>
          
          {user.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm">{user.phone}</span>
            </div>
          )}
          
          {user.employeeId && (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <span className="text-sm">ID: {user.employeeId}</span>
            </div>
          )}
          
          {user.location?.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm">{user.location.address}</span>
            </div>
          )}
          
          {user.performance?.rating > 0 && (
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <div className="text-sm">
                Rating: {user.performance.rating.toFixed(1)}/5
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div 
                    className="bg-primary h-1.5 rounded-full" 
                    style={{ width: `${(user.performance.rating / 5) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          
          {user.lastActive && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Last active: {new Date(user.lastActive).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        
        {showActions && (
          <div className="flex justify-end mt-4 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="mr-2"
              onClick={() => navigate(`/users/${user.id}`)}
            >
              View Details
            </Button>
            {!user.isApproved && isAdmin && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="mr-2"
                  onClick={handleApprove}
                  disabled={isLoading}
                >
                  <UserCheck className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={isLoading}
                >
                  <AlertCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UserProfile;
