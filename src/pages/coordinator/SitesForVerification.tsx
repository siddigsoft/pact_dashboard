
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
                <div key={site.id} className="border rounded-lg p-6 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div>
                        <div className="font-bold text-xl text-gray-900 dark:text-gray-100">
                          {site.siteName} 
                          <span className="text-sm font-normal text-gray-500 ml-2">({site.siteCode})</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          📍 {site.state} / {site.locality}
                        </div>
                      </div>

                      {/* Project and Assignment Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Project:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.mmpDetails?.projectName || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Assigned:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">
                            {site.assignedAt ? new Date(site.assignedAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Due Date:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">
                            {site.dueDate ? new Date(site.dueDate).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                          <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                            site.status === 'assigned' 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : site.status === 'inProgress'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}>
                            {site.status === 'assigned' ? 'Assigned' : site.status === 'inProgress' ? 'In Progress' : site.status}
                          </span>
                        </div>
                      </div>

                      {/* Activity and Monitoring Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Priority:</span>
                          <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                            site.priority === 'high' 
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : site.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}>
                            {site.priority?.toUpperCase() || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Complexity:</span>
                          <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                            site.complexity === 'high' 
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : site.complexity === 'medium'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}>
                            {site.complexity?.toUpperCase() || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Visit Type:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.visitType || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Main Activity:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.mainActivity || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Monitoring Type:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.monitoringType || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Hub:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.hub || site.hubOffice || 'N/A'}</span>
                        </div>
                      </div>

                      {/* Additional Info */}
                      {site.cpName && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Cooperation Partner:</span>
                          <span className="ml-2 text-gray-900 dark:text-gray-100">{site.cpName}</span>
                        </div>
                      )}

                      {/* Team Information */}
                      {site.team && (site.team.coordinator || site.team.supervisor || site.team.fieldOfficer) && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Team:</span>
                          <div className="ml-2 mt-1 space-y-1">
                            {site.team.coordinator && <div>Coordinator: {site.team.coordinator}</div>}
                            {site.team.supervisor && <div>Supervisor: {site.team.supervisor}</div>}
                            {site.team.fieldOfficer && <div>Field Officer: {site.team.fieldOfficer}</div>}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {site.notes && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Notes:</span>
                          <p className="ml-2 mt-1 text-gray-900 dark:text-gray-100 italic">{site.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="flex-shrink-0">
                      <Button 
                        size="lg" 
                        onClick={() => navigate(`/mmp/${site.mmpDetails?.mmpId}/verification`)}
                        className="w-full lg:w-auto"
                      >
                        Review & Verify
                      </Button>
                    </div>
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
