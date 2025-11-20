import React from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const MMPOverviewCard = () => {
  const { mmpFiles } = useMMP();
  const navigate = useNavigate();
  // Get last 3 months' MMPs
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const filtered = (mmpFiles || []).filter(mmp => {
    const dt = new Date(mmp.uploadedAt || 0);
    return dt >= threeMonthsAgo;
  });

  // Group by month
  const grouped = filtered.reduce((acc, mmp) => {
    const dt = new Date(mmp.uploadedAt || 0);
    const key = format(dt, 'yyyy-MM');
    if (!acc[key]) acc[key] = [];
    acc[key].push(mmp);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent MMPs (Last 3 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        {Object.entries(grouped).map(([month, mmps]) => (
          <div key={month} className="mb-3">
            <div className="font-semibold">{format(new Date(month + '-01'), 'MMMM yyyy')}</div>
            <ul className="ml-4 mt-1">
              {mmps.map(mmp => (
                <li key={mmp.id} className="flex items-center gap-2">
                  <span className="text-sm">{mmp.name || mmp.mmpId}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${mmp.status === 'approved' ? 'bg-green-100 text-green-800' : mmp.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                    {mmp.status}
                  </span>
                  <Button size="sm" variant="link" onClick={() => navigate(`/mmp/${mmp.id}`)}>
                    View
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-muted-foreground text-sm">No MMPs uploaded in the last 3 months.</div>}
      </CardContent>
    </Card>
  );
};
