
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { MMPFile } from '@/types';
import { useMMP } from '@/context/mmp/MMPContext';
import PermitPreviewDialog from '@/components/permits/PermitPreviewDialog';
import MMPBasicInfo from '@/components/verification/overview/MMPBasicInfo';
import MMPProcessingStatus from '@/components/verification/overview/MMPProcessingStatus';
import MMPSiteEntriesTable from '@/components/verification/overview/MMPSiteEntriesTable';
import { getActualSiteCount } from '@/utils/mmpUtils';

interface MMPVerificationOverviewProps {
  mmpFile: MMPFile;
}

const MMPVerificationOverview: React.FC<MMPVerificationOverviewProps> = ({ mmpFile }) => {
  const { updateMMP } = useMMP();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url?: string; name: string }>({ name: '' });
  
  // Get the actual site entries count
  const siteEntriesCount = getActualSiteCount(mmpFile);
  
  // Log the MMP file and site entries for debugging
  console.log('MMPVerificationOverview - MMP file:', mmpFile);
  console.log('MMPVerificationOverview - Site entries:', mmpFile.siteEntries);
  console.log('MMPVerificationOverview - Site entries count:', siteEntriesCount);
  
  const handlePreviewDocument = (site: any) => {
    // Generate a more realistic placeholder for PDF document
    // In a real implementation, you would get the document URL from the site object
    let documentUrl = null;
    
    // Check if permits exist and is an array before trying to access its properties
    if (mmpFile.permits && Array.isArray(mmpFile.permits.documents) && mmpFile.permits.documents.length > 0) {
      // If there are permits documents available, use the first one's URL
      documentUrl = mmpFile.permits.documents[0].fileUrl;
    } else if (mmpFile.permits && Array.isArray(mmpFile.permits.statePermits)) {
      // Alternatively, check for state permits documents
      const statePermitsDocs = mmpFile.permits.statePermits
        .flatMap(statePermit => statePermit.documents)
        .filter(doc => doc && doc.fileUrl);
        
      if (statePermitsDocs.length > 0) {
        documentUrl = statePermitsDocs[0].fileUrl;
      }
    }
    
    // If no real document URL is found, use a placeholder PDF data URL 
    // instead of an example domain which doesn't contain a real document
    if (!documentUrl) {
      // Base64 encoded tiny PDF (just a 1x1 pixel) as a fallback
      documentUrl = "data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nDPQM1Qo5ypUMABCM0MjBQsLEz1DPQtDoEgSF5euk58HhMucFAr5AFr0BvIKZW5kc3RyZWFtCmVuZG9iagoKMyAwIG9iago0OAplbmRvYmoKCjUgMCBvYmoKPDwKPj4KZW5kb2JqCgo2IDAgb2JqCjw8L0ZvbnQgNSAwIFIKL1Byb2NTZXRbL1BERi9UZXh0XT4+CmVuZG9iagoKMSAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDQgMCBSL1Jlc291cmNlcyA2IDAgUi9NZWRpYUJveFswIDAgMzYwIDM2MF0vR3JvdXA8PC9TL1RyYW5zcGFyZW5jeS9DUy9EZXZpY2VSR0IvSSB0cnVlPj4vQ29udGVudHMgMiAwIFI+PgplbmRvYmoKCjQgMCBvYmoKPDwvVHlwZS9QYWdlcy9SZXNvdXJjZXMgNiAwIFIvTWVkaWFCb3hbIDAgMCAzNjAgMzYwIF0vS2lkc1sgMSAwIFIgXS9Db3VudCAxPj4KZW5kb2JqCgo3IDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyA0IDAgUgovTWV0YWRhdGEgOCAwIFIKPj4KZW5kb2JqCgo4IDAgb2JqCjw8L0xlbmd0aCAyMzk+PnN0cmVhbQogCmVuZHN0cmVhbQplbmRvYmoKCjkgMCBvYmoKPDwvVHlwZS9YUmVmCi9CYXNlIDAKL0xlbmd0aCAzNwovU2l6ZSAxMAovRmlsdGVyL0ZsYXRlRGVjb2RlCj4+c3RyZWFtCnicY2AAgv//GRgYGll1GZg2MzCYOwoxMH9jYPBjAACv6wR+CmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo2NDEKJSVFT0YK";
    }
    
    setPreviewFile({
      url: documentUrl,
      name: `Site ${site.siteCode || 'Unknown'} - ${site.siteName || 'Unnamed Site'} Document`
    });
    setPreviewOpen(true);
  };

  const handleUpdateMMP = (id: string, updatedMMP: Partial<MMPFile>) => {
    if (updateMMP) {
      updateMMP(id, updatedMMP);
    }
  };

  return (
    <Card className="border-blue-100 dark:border-blue-800 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <CardTitle className="text-blue-800 dark:text-blue-300">MMP Overview</CardTitle>
        <CardDescription className="text-blue-600/80 dark:text-blue-300/80">
          Review basic MMP information before verification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        {/* MMP Basic Info Section */}
        <MMPBasicInfo 
          mmpFile={mmpFile} 
          onUpdateMMP={handleUpdateMMP} 
        />
        
        {/* MMP Processing Status Section */}
        <MMPProcessingStatus mmpFile={mmpFile} />
        
        {/* MMP Site Entries Table with Pagination */}
        {mmpFile.siteEntries && mmpFile.siteEntries.length > 0 ? (
          <MMPSiteEntriesTable 
            siteEntries={mmpFile.siteEntries} 
            onPreviewDocument={handlePreviewDocument}
            itemsPerPage={5}
          />
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-6 rounded-lg text-center">
            <p className="text-amber-800 dark:text-amber-300 font-medium">No site entries found</p>
            <p className="text-amber-700 dark:text-amber-400 mt-2">
              This MMP has {mmpFile.entries || 0} declared entries but no site data is available yet.
              You may need to edit the MMP to add site information.
            </p>
          </div>
        )}
      </CardContent>

      {/* Document Preview Dialog */}
      <PermitPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={previewFile.url}
        fileName={previewFile.name}
      />
    </Card>
  );
};

export default MMPVerificationOverview;
