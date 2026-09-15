/**
 * Legacy Screen Permissions editor — retired (Phase 2 item 4).
 * Runtime authorization uses page_access_overrides + role union only.
 * This page is a redirect stub so old bookmarks land on User Access.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Shield } from 'lucide-react';

export default function PermissionsManagement() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate('/super-admin-hub?tab=user-access', { replace: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Screen Permissions retired
          </CardTitle>
          <CardDescription>
            Legacy <code>user_screen_permissions</code> JSON is read-only and no longer used for
            authorization. Manage access in User Access (typed overrides) or Roles (baselines).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/super-admin-hub?tab=user-access')} data-testid="btn-go-user-access">
            <Shield className="h-4 w-4 mr-2" />
            Open User Access
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button variant="outline" onClick={() => navigate('/super-admin-hub?tab=roles')}>
            Open Roles
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
