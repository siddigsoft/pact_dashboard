import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import EditSiteEntryForm from '@/components/site-visit/EditSiteEntryForm';
import { updateSiteVisitInDb } from '@/context/siteVisit/supabase';

interface FormSiteEntry {
  id: string;
  siteCode: string;
  siteName: string;
  inMoDa: boolean;
  visitedBy: string;
  mainActivity: string;
  visitDate: string;
  status: string;
  locality?: string;
  state?: string;
  address?: string;
  coordinates?: { latitude?: number; longitude?: number };
  description?: string;
  notes?: string;
  permitDetails?: { federal: boolean; state: boolean; local: boolean; lastVerified?: string; verifiedBy?: string };
}

const EditSiteVisit: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setRow(data);
      } catch (e) {
        toast({ title: 'Error', description: 'Failed to load site visit.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, toast]);

  const formSite: FormSiteEntry | null = useMemo(() => {
    if (!row) return null;
    const vd = row.visit_data || {};
    const loc = row.location || {};
    return {
      id: row.id,
      siteCode: row.site_code || '',
      siteName: row.site_name || '',
      inMoDa: false,
      visitedBy: '',
      mainActivity: row.main_activity || vd.mainActivity || '',
      visitDate: vd.visitDate || (row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : ''),
      status: row.status || 'assigned',
      locality: row.locality || '',
      state: row.state || '',
      address: loc.address || '',
      coordinates: { latitude: loc.latitude, longitude: loc.longitude },
      description: row.notes || '',
      notes: row.notes || '',
      permitDetails: vd.permitDetails || { federal: false, state: false, local: false },
    };
  }, [row]);

  const handleSave = async (_siteId: string, updated: Partial<FormSiteEntry>) => {
    if (!id) return;
    try {
      await updateSiteVisitInDb(id, {
        siteName: updated.siteName,
        siteCode: updated.siteCode,
        mainActivity: updated.mainActivity,
        state: updated.state,
        locality: updated.locality,
        notes: updated.notes ?? updated.description,
        status: updated.status,
        ...(updated.visitDate ? { visitDate: updated.visitDate } as any : {}),
        ...(updated.permitDetails ? { permitDetails: updated.permitDetails } : {}),
      } as any);
      toast({ title: 'Saved', description: 'Site visit updated.' });
      navigate(-1);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to save changes.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!formSite) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground">Site visit not found.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Edit Site Visit</CardTitle>
        </CardHeader>
        <CardContent>
          <EditSiteEntryForm
            siteEntry={formSite}
            onSave={handleSave}
            onCancel={() => navigate(-1)}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditSiteVisit;
