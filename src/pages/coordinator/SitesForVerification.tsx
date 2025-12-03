
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useAppContext } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLocalityPermitStatus } from '@/hooks/use-coordinator-permits';
import { LocalityPermitStatus } from '@/types/coordinator-permits';
import { Badge } from '@/components/ui/badge';
import { MapPin, FileCheck, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCoordinatorLocalityPermits } from '@/hooks/use-coordinator-permits';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Simple upload component for coordinator locality permits
const CoordinatorLocalityPermitUpload: React.FC<{
  locality: LocalityPermitStatus;
  onPermitUploaded: () => void;
}> = ({ locality, onPermitUploaded }) => {
  const { uploadPermit } = useCoordinatorLocalityPermits();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF or image file (JPG, PNG).",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !locality.stateId || !locality.localityId) return;

    setUploading(true);
    try {
      const result = await uploadPermit(locality.stateId, locality.localityId, selectedFile);
      if (result) {
        toast({
          title: "Permit uploaded successfully",
          description: `Local permit for ${locality.locality}, ${locality.state} has been uploaded.`,
        });
        onPermitUploaded();
        setSelectedFile(null);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the permit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/30 to-slate-50/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-orange-800 text-base sm:text-lg">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
          Local Permit Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Upload the local permit for <strong>{locality.locality}, {locality.state}</strong> to verify all sites in this locality.
          </AlertDescription>
        </Alert>

        {!selectedFile ? (
          <div className="border-2 border-dashed border-orange-300 rounded-lg p-4 sm:p-6 text-center bg-gradient-to-br from-orange-50/50 to-white">
            <FileCheck className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500 mx-auto mb-2" />
            <p className="text-sm text-orange-700 mb-3">
              Click to select your local permit file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400 min-h-[44px] py-3 px-4 active:scale-95"
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Select File
            </Button>
          </div>
        ) : (
          <div className="border border-emerald-300 bg-emerald-50/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="font-medium text-emerald-800">{selectedFile.name}</p>
                  <p className="text-sm text-emerald-600">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="text-red-600 hover:text-red-800 hover:bg-red-50"
              >
                ✕
              </Button>
            </div>
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full mt-4 bg-orange-600 hover:bg-orange-700 min-h-[44px] py-3 active:scale-95"
            >
              {uploading ? 'Uploading...' : 'Upload Permit'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

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
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
            Sites for Verification
          </CardTitle>
          <div className="text-sm text-gray-600 leading-relaxed">
            {totalLocalities > 0 ? (
              <>
                You have sites assigned in {totalLocalities} localit{totalLocalities !== 1 ? 'ies' : 'y'}.
                {localitiesWithPermits.length > 0 && (
                  <span className="text-green-600 font-medium ml-2 block sm:inline">
                    {localitiesWithPermits.length} with permits uploaded.
                  </span>
                )}
                {localitiesWithoutPermits.length > 0 && (
                  <span className="text-orange-600 font-medium ml-2 block sm:inline">
                    {localitiesWithoutPermits.length} requiring permits.
                  </span>
                )}
              </>
            ) : (
              "No sites currently assigned to you for verification."
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {localitiesWithPermitStatus.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <MapPin className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2 text-base sm:text-lg">No sites assigned</p>
              <p className="text-sm text-gray-400 px-4">
                Sites will appear here once assigned to you for verification.
              </p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Localities without permits - show upload prompts */}
              {localitiesWithoutPermits.map((locality) => (
                <CoordinatorLocalityPermitUpload
                  key={`${locality.stateId}-${locality.localityId}`}
                  locality={locality}
                  onPermitUploaded={handlePermitUploaded}
                />
              ))}

              {/* Localities with permits - show site access */}
              {localitiesWithPermits.map((locality) => (
                <Card key={`${locality.stateId}-${locality.localityId}`} className="border-green-300 bg-green-50 overflow-hidden">
                  <CardHeader className="pb-3 px-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {getLocalityStatusIcon(locality.hasPermit)}
                        <div>
                          <CardTitle className="text-base sm:text-lg text-green-800 leading-tight">
                            {locality.state} / {locality.locality}
                          </CardTitle>
                          <p className="text-sm text-green-600 mt-1">
                            {locality.siteCount} site{locality.siteCount !== 1 ? 's' : ''} available for verification
                          </p>
                        </div>
                      </div>
                      <div className="self-start sm:self-center">
                        {getLocalityStatusBadge(locality.hasPermit)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Permit uploaded: {new Date(locality.permit?.uploadedAt || '').toLocaleDateString()}</p>
                        <p className="text-xs">
                          File: {locality.permit?.permitFileName}
                        </p>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-green-600 hover:bg-green-700 w-full sm:w-auto min-h-[44px] py-3 px-4 active:scale-95 transition-all shadow-sm hover:shadow-md">
                            <Eye className="h-4 w-4 mr-2" />
                            View Sites ({locality.siteCount})
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto mx-4 sm:mx-auto">
                          <DialogHeader className="pb-4">
                            <DialogTitle className="text-lg sm:text-xl">
                              Sites in {locality.locality}, {locality.state}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 sm:space-y-4 mt-4">
                            {locality.sites.map((site) => (
                              <div key={site.id} className="border rounded-lg p-3 sm:p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                  <div className="flex-1 space-y-3">
                                    <div>
                                      <div className="font-bold text-base sm:text-lg text-gray-900 leading-tight">
                                        {site.siteName}
                                        <span className="text-sm font-normal text-gray-500 ml-2">
                                          ({site.siteCode})
                                        </span>
                                      </div>
                                      <div className="text-sm text-gray-600 flex items-center mt-1">
                                        <MapPin className="h-3 w-3 mr-1 text-primary/70 flex-shrink-0" />
                                        {site.state} / {site.locality}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                      <div className="flex flex-col sm:flex-row sm:justify-between">
                                        <span className="font-medium text-gray-700 text-xs sm:text-sm">Project:</span>
                                        <span className="text-gray-900 text-sm sm:text-base mt-0.5 sm:mt-0">
                                          {site.mmpDetails?.projectName || 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:justify-between">
                                        <span className="font-medium text-gray-700 text-xs sm:text-sm">Assigned:</span>
                                        <span className="text-gray-900 text-sm sm:text-base mt-0.5 sm:mt-0">
                                          {site.assignedAt ? new Date(site.assignedAt).toLocaleDateString() : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:justify-between">
                                        <span className="font-medium text-gray-700 text-xs sm:text-sm">Due Date:</span>
                                        <span className="text-gray-900 text-sm sm:text-base mt-0.5 sm:mt-0">
                                          {site.dueDate ? new Date(site.dueDate).toLocaleDateString() : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:justify-between">
                                        <span className="font-medium text-gray-700 text-xs sm:text-sm">Status:</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium self-start sm:self-center mt-0.5 sm:mt-0 ${
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

                                  <div className="flex-shrink-0 w-full sm:w-auto">
                                    <Button
                                      size="sm"
                                      onClick={() => navigate(`/mmp/${site.mmpDetails?.mmpId}/verification`)}
                                      className="w-full sm:w-auto min-h-[40px] py-2 px-4 active:scale-95 transition-all shadow-sm hover:shadow-md"
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
        <CardFooter className="px-4 sm:px-6 py-4 sm:py-6">
          <Button variant="outline" onClick={() => navigate(-1)} className="w-full sm:w-auto min-h-[44px] py-3 px-6 active:scale-95">
            Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};


export default SitesForVerification;
