
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { FileText, AlertTriangle, ChevronLeft } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';

const CreateSiteVisit = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { checkPermission, hasAnyRole } = useAuthorization();

  // Check if user has permission (admin bypass)
  const canAccess = checkPermission('site_visits', 'create') || hasAnyRole(['admin']);
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/site-visits')}
              className="w-full"
            >
              Return to Site Visits
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/site-visits")}
          className="mr-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Site Visit</h1>
          <p className="text-muted-foreground">Select creation method for new site visits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
        <Card className="cursor-pointer hover:border-primary" onClick={() => navigate('/site-visits/create/urgent')}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
              Urgent Visit
            </CardTitle>
            <CardDescription>
              Create a one-off urgent site visit without an MMP
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use this option for urgent or unscheduled site visits that require immediate attention 
              and are not part of an approved MMP file.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full">
              Create Urgent Visit
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default CreateSiteVisit;
