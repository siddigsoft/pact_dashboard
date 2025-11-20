import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface PermitUploadProps {
  onSubmit: (permits: { federal: File | null; state?: File | null; local?: File | null }) => void;
  submitting: boolean;
}

const PermitUpload: React.FC<PermitUploadProps> = ({ onSubmit, submitting }) => {
  const [federal, setFederal] = useState<File | null>(null);
  const [state, setState] = useState<File | null>(null);
  const [local, setLocal] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!federal) {
      setError('Federal permit is required.');
      return;
    }
    setError(null);
    onSubmit({ federal, state, local });
  };

  return (
    <Card className="max-w-lg mx-auto mt-8">
      <CardHeader>
        <CardTitle>Attach Permits</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-medium mb-1">Federal Permit <span className="text-red-500">*</span></label>
            <input type="file" accept="application/pdf,image/*" required onChange={e => setFederal(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="block font-medium mb-1">State Permit (optional)</label>
            <input type="file" accept="application/pdf,image/*" onChange={e => setState(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="block font-medium mb-1">Local Permit (optional)</label>
            <input type="file" accept="application/pdf,image/*" onChange={e => setLocal(e.target.files?.[0] || null)} />
          </div>
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Uploading...' : 'Attach Permits'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PermitUpload;
