import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const MMPPreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMMPById, updateMMP } = useMMP();
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mmp, setMmp] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const mmpFile = getMMPById(id);
    setMmp(mmpFile);
    setLoading(false);
    // Only allow forwarding if federal permit is attached
    setCanForward(!!mmpFile?.permits?.federal);
    // If FOM opens a new MMP and federal permit is not attached, redirect to permit upload
    if (mmpFile && !mmpFile.permits?.federal) {
      navigate(`/mmp/${id}/verification`);
    }
  }, [id, getMMPById, navigate]);

  const handleForward = () => {
    if (!mmp) return;
    // Navigate to MMP detail view instead of forwarding
    navigate(`/mmp/${mmp.id}/view`);
  };

  if (loading) return <div>Loading...</div>;
  if (!mmp) return <div>MMP not found.</div>;

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-4">Preview Sites for MMP: {mmp.name}</h2>
         <MMPSiteEntriesTable siteEntries={mmp.siteEntries || []} />
      <div className="mt-6 flex justify-end">
        <Button onClick={handleForward} disabled={!canForward}>
          Preview MMP
        </Button>
      </div>
      {!canForward && (
        <div className="text-red-500 mt-2">Federal permit must be attached before forwarding.</div>
      )}
    </div>
  );
};

export default MMPPreviewPage;
