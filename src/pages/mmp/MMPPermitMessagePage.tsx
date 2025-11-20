import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Upload } from 'lucide-react';

const MMPPermitMessagePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const handleUploadClick = () => {
    if (id) {
      navigate(`/mmp/${id}/verification`);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Upload the required Permits to Continue</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-4 text-muted-foreground">
            You need to upload the required permits before proceeding with this MMP.
          </p>
          <Button onClick={handleUploadClick} className="w-full">
            <Upload className="h-4 w-4 mr-2" />
            Upload Permits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MMPPermitMessagePage;
