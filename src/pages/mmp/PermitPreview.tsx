import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { Button } from '@/components/ui/button';

const PermitPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMMPById, updateMMP } = useMMP();
  const mmp = id ? getMMPById(id) : null;
  const permitDocs = mmp?.permits?.documents || [];

  const handleApprove = () => {
    if (!mmp) return;
    updateMMP(mmp.id, { permits: { ...mmp.permits, approved: true } });
    navigate(`/mmp/${mmp.id}/preview`);
  };

  const handleChange = () => {
    if (!mmp) return;
    navigate(`/mmp/${mmp.id}/verification`);
  };

  if (!mmp) return <div>Permit not found.</div>;

  return (
    <div className="max-w-xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-4">Preview Attached Permits</h2>
      <ul className="mb-6">
        {permitDocs.map((doc: any, idx: number) => (
          <li key={idx} className="mb-2">
            <span className="font-semibold capitalize">{doc.type} Permit:</span> {doc.fileName}
            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 underline">View</a>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-4">
        <Button onClick={handleApprove}>
          Approve Permit
        </Button>
        <Button variant="outline" onClick={handleChange}>
          Change Permit
        </Button>
      </div>
    </div>
  );
};

export default PermitPreview;
