
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useAppContext } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLocalityPermitStatus } from '@/hooks/use-coordinator-permits';
import { LocalityPermitUpload } from '@/components/LocalityPermitUpload';
import { Badge } from '@/components/ui/badge';
import { MapPin, FileCheck, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const SitesForVerification: React.FC = () => {
  const { currentUser, siteVisits } = useAppContext();
  const navigate = useNavigate();
  const { localitiesWithPermitStatus, totalLocalities, localitiesWithPermits, localitiesWithoutPermits } = useLocalityPermitStatus(siteVisits);

  // Debug logging
  React.useEffect(() => {
    console.log('SitesForVerification Debug:', {
      currentUser: currentUser?.id,
      siteVisitsCount: siteVisits?.length || 0,
      localitiesWithPermitStatusCount: localitiesWithPermitStatus.length,
      totalLocalities,
      localitiesWithPermitsCount: localitiesWithPermits.length,
      localitiesWithoutPermitsCount: localitiesWithoutPermits.length,
      localitiesWithPermitStatus: localitiesWithPermitStatus.map(l => ({
        state: l.state,
        locality: l.locality,
        hasPermit: l.hasPermit,
        siteCount: l.siteCount
      }))
    });
  }, [currentUser, siteVisits, localitiesWithPermitStatus, totalLocalities, localitiesWithPermits, localitiesWithoutPermits]);

  const handlePermitUploaded = () => {
    // The hook will automatically refresh the data
    window.location.reload(); // Simple refresh for now
  };

  const getLocalityStatusIcon = (hasPermit: boolean) => {
    return hasPermit ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    ) : (
      <AlertTriangle className="h-5 w-5 text-orange-600" />
    );
  };

  const getLocalityStatusBadge = (hasPermit: boolean) => {
    return hasPermit ? (
      <Badge className="bg-green-100 text-green-800 border-green-300">
        Permit Uploaded
      </Badge>
    ) : (
      <Badge className="bg-orange-100 text-orange-800 border-orange-300">
        Permit Required
      </Badge>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Sites for Verification
          </CardTitle>
          <div className="text-sm text-gray-600">
            {totalLocalities > 0 ? (
              <>
                You have sites assigned in {totalLocalities} localit{totalLocalities !== 1 ? 'ies' : 'y'}.
                {localitiesWithPermits.length > 0 && (
                  <span className="text-green-600 font-medium ml-2">
                    {localitiesWithPermits.length} with permits uploaded.
                  </span>
                )}
                {localitiesWithoutPermits.length > 0 && (
                  <span className="text-orange-600 font-medium ml-2">
                    {localitiesWithoutPermits.length} requiring permits.
                  </span>
                )}
              </>
            ) : (
              "No sites currently assigned to you for verification."
            )}
          </div>
        </CardHeader>
        <CardContent>
          {localitiesWithPermitStatus.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No sites assigned</p>
              <p className="text-sm text-gray-400">
                Sites will appear here once assigned to you for verification.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Localities without permits - show upload prompts */}
              {localitiesWithoutPermits.map((locality) => (
                <LocalityPermitUpload
                  key={`${locality.stateId}-${locality.localityId}`}
                  locality={locality}
                  onPermitUploaded={handlePermitUploaded}
                />
              ))}

              {/* Localities with permits - show site access */}
              {localitiesWithPermits.map((locality) => (
                <Card key={`${locality.stateId}-${locality.localityId}`} className="border-green-300 bg-green-50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getLocalityStatusIcon(locality.hasPermit)}
                        <div>
                          <CardTitle className="text-lg text-green-800">
                            {locality.state} / {locality.locality}
                          </CardTitle>
                          <p className="text-sm text-green-600 mt-1">
                            {locality.siteCount} site{locality.siteCount !== 1 ? 's' : ''} available for verification
                          </p>
                        </div>
                      </div>
                      {getLocalityStatusBadge(locality.hasPermit)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        <p>Permit uploaded: {new Date(locality.permit?.uploadedAt || '').toLocaleDateString()}</p>
                        <p className="text-xs mt-1">
                          File: {locality.permit?.permitFileName}
                        </p>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-green-600 hover:bg-green-700">
                            <Eye className="h-4 w-4 mr-2" />
                            View Sites ({locality.siteCount})
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              Sites in {locality.locality}, {locality.state}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            {locality.sites.map((site) => (
                              <div key={site.id} className="border rounded-lg p-4 bg-white">
                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                  <div className="flex-1 space-y-2">
                                    <div>
                                      <div className="font-bold text-lg text-gray-900">
                                        {site.siteName}
                                        <span className="text-sm font-normal text-gray-500 ml-2">
                                          ({site.siteCode})
                                        </span>
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        📍 {site.state} / {site.locality}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <span className="font-medium text-gray-700">Project:</span>
                                        <span className="ml-2 text-gray-900">
                                          {site.mmpDetails?.projectName || 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-medium text-gray-700">Assigned:</span>
                                        <span className="ml-2 text-gray-900">
                                          {site.assignedAt ? new Date(site.assignedAt).toLocaleDateString() : 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-medium text-gray-700">Due Date:</span>
                                        <span className="ml-2 text-gray-900">
                                          {site.dueDate ? new Date(site.dueDate).toLocaleDateString() : 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-medium text-gray-700">Status:</span>
                                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                                          site.status === 'assigned'
                                            ? 'bg-blue-100 text-blue-800'
                                            : site.status === 'inProgress'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                        }`}>
                                          {site.status === 'assigned' ? 'Assigned' : site.status === 'inProgress' ? 'In Progress' : site.status}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex-shrink-0">
                                    <Button
                                      size="sm"
                                      onClick={() => navigate(`/mmp/${site.mmpDetails?.mmpId}/verification`)}
                                    >
                                      Review & Verify
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SitesForVerification;
