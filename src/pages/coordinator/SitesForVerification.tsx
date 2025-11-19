
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useAppContext } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const SitesForVerification: React.FC = () => {
  const { currentUser, siteVisits } = useAppContext();
  const navigate = useNavigate();

  // Only show sites assigned to this coordinator and not yet verified
  const mySites = React.useMemo(() => {
    if (!currentUser) return [];
    return (siteVisits || []).filter(
      (site) =>
        site.assignedTo === currentUser.id &&
        (site.status === 'assigned' || site.status === 'inProgress')
    );
  }, [siteVisits, currentUser]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Sites for Verification</CardTitle>
        </CardHeader>
        <CardContent>
          {mySites.length === 0 ? (
            <p className="mb-4">No sites currently assigned to you for verification.</p>
          ) : (
            <div className="space-y-4">
              {mySites.map((site) => (
                <div key={site.id} className="border rounded p-4 flex flex-col md:flex-row md:items-center md:justify-between bg-gray-50 dark:bg-gray-800">
                  <div>
                    <div className="font-semibold text-lg">{site.siteName} <span className="text-xs text-gray-500">({site.siteCode})</span></div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{site.state} / {site.locality}</div>
                    <div className="text-xs text-gray-400">Due: {site.dueDate ? new Date(site.dueDate).toLocaleDateString() : 'N/A'}</div>
                  </div>
                  <div className="mt-2 md:mt-0 flex gap-2">
                    <Button size="sm" onClick={() => navigate(`/mmp/${site.mmpDetails?.mmpId}/verification`)}>
                      Review & Verify
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SitesForVerification;
