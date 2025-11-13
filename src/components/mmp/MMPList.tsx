
import { MMPFile } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { MMPStatusBadge } from './MMPStatusBadge';
import { useNavigate } from 'react-router-dom';

interface MMPListProps {
  mmpFiles: MMPFile[];
}

export const MMPList = ({ mmpFiles }: MMPListProps) => {
  const navigate = useNavigate();

  if (!mmpFiles.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No MMP files uploaded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {mmpFiles.map((mmp) => (
        <Card
          key={mmp.id}
          className="cursor-pointer hover:bg-accent/5 transition-colors"
          onClick={() => navigate(`/mmp/${mmp.id}/view`)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">{mmp.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    MMP ID: {mmp.mmpId}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      Uploaded {format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}
                    </span>
                    <span>•</span>
                    <span>by {mmp.uploadedBy || 'Unknown (User)'}</span>
                    <span>•</span>
                    <span>{mmp.entries} entries</span>
                  </div>
                </div>
              </div>
              <MMPStatusBadge status={mmp.status} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
