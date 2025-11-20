
import React from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ProjectsDataViewer = () => {
  const { mmpFiles, loading: mmpLoading } = useMMP();

  const formatDate = (date: string) => {
    try {
      return format(new Date(date), 'PPP');
    } catch {
      return 'Invalid date';
    }
  };

  if (mmpLoading) {
    return <div>Loading data...</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>MMP Files Data</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead>Region</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mmpFiles.map((mmp) => (
                <TableRow key={mmp.id}>
                  <TableCell className="font-medium">{mmp.name}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={mmp.status === 'approved' ? 'default' : 'secondary'}
                    >
                      {mmp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{mmp.entries}</TableCell>
                  <TableCell>{mmp.type || 'N/A'}</TableCell>
                  <TableCell>{formatDate(mmp.uploadedAt)}</TableCell>
                  <TableCell>{mmp.region || 'N/A'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectsDataViewer;
