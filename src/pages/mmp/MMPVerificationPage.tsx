
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PermitUpload from './PermitUpload';
import { useMMP } from '@/context/mmp/MMPContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const MMPVerificationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { attachPermitsToMMP, getMMPById, updateMMP } = useMMP();
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [latestDocs, setLatestDocs] = useState<any[]>([]);
  const mmp = id ? getMMPById(id) : null;

  const handlePermitSubmit = async (permits: { federal: File | null; state?: File | null; local?: File | null }) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await attachPermitsToMMP(id, permits);
      toast({ title: 'Permits attached successfully!' });
      // Get the latest docs from the updated MMP
      const updated = getMMPById(id);
      setLatestDocs(updated?.permits?.documents || []);
      setShowPreview(true);
    } catch (e) {
      toast({ title: 'Failed to attach permits', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = () => {
    if (!mmp) return;
    updateMMP(mmp.id, { permits: { ...mmp.permits, approved: true } });
    // After confirming permit, go to preview MMP (site preview/forward page)
    navigate(`/mmp/${mmp.id}/preview`);
  };

  const handleEdit = () => {
    setShowPreview(false);
  };

  // If not showing preview, show upload form
  if (!showPreview) {
    return <PermitUpload onSubmit={handlePermitSubmit} submitting={submitting} />;
  }

  // Show preview of uploaded permits with confirm/edit options
  return (
    <div className="max-w-xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-4">Preview Attached Permits</h2>
      <ul className="mb-6">
        {latestDocs.map((doc: any, idx: number) => (
          <li key={idx} className="mb-2">
            <span className="font-semibold capitalize">{doc.type} Permit:</span> {doc.fileName}
            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 underline">View</a>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-4">
        <Button onClick={handleConfirm}>
          Confirm Permit
        </Button>
        <Button variant="outline" onClick={handleEdit}>
          Edit Permit
        </Button>
      </div>
    </div>
  );
};

export default MMPVerificationPage;
