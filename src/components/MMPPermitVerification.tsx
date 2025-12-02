
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MMPPermitsData, MMPStatePermitDocument } from '@/types/mmp/permits';
import { MMPPermitFileUpload } from './MMPPermitFileUpload';
import { PermitVerificationCard } from './permits/PermitVerificationCard';
import { Progress } from '@/components/ui/progress';
import { Upload, FileCheck, Send, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';
import { useAuthorization } from '@/hooks/use-authorization';
import { useNavigate } from 'react-router-dom';

interface MMPPermitVerificationProps {
  mmpFile: any;
  onVerificationComplete?: (verificationData: any) => void;
}

const MMPPermitVerification: React.FC<MMPPermitVerificationProps> = ({
  mmpFile,
  onVerificationComplete
}) => {
  const [permits, setPermits] = useState<MMPStatePermitDocument[]>([]);
  const { toast } = useToast();
  const { updateMMP } = useMMP();
  const { currentUser } = useAppContext();
  const [hasForwarded, setHasForwarded] = useState(false);
  const { users } = useAppContext();
  const navigate = useNavigate();
  const { hasAnyRole } = useAuthorization();

  useEffect(() => {
    let cancelled = false;

    const normalizeDocs = (raw: any): MMPStatePermitDocument[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw as MMPStatePermitDocument[];
      if (typeof raw === 'object') {
        if ('documents' in raw && Array.isArray((raw as any).documents)) {
          return (raw as any).documents as MMPStatePermitDocument[];
        }
        const stateDocs = ((raw as any).statePermits || []).flatMap((sp: any) =>
          (sp.documents || []).map((d: any) => ({ ...d, permitType: 'state' as const, state: d?.state || sp?.stateName }))
        );
        const localDocs = ((raw as any).localPermits || []).flatMap((lp: any) =>
          (lp.documents || []).map((d: any) => ({ ...d, permitType: 'local' as const, locality: d?.locality || lp?.localityName }))
        );
        return [...stateDocs, ...localDocs];
      }
      return [];
    };


    

    const fetchFromStorage = async (): Promise<MMPStatePermitDocument[]> => {
      const bucket = 'mmp-files';
      const id = mmpFile?.id || mmpFile?.mmpId;
      if (!id) return [];
      const base = `permits/${id}`;
      try {
        const list = async (path: string) => {
          const { data, error } = await supabase.storage
            .from(bucket)
            .list(path, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
          if (error) {
            console.error('Storage list error', path, error);
            return [] as any[];
          }
          return (data || []) as any[];
        };

        const toDocs = (
          path: string,
          files: any[],
          type: 'federal' | 'state' | 'local',
          extra?: { state?: string; locality?: string }
        ) => {
          return (files || [])
            .filter((f: any) => f && f.name && f.metadata && typeof f.metadata.size === 'number')
            .map((f: any) => {
              const fullPath = `${path}/${f.name}`.replace(/\/+/g, '/');
              const url = supabase.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
              return {
                id: fullPath,
                fileName: f.name,
                fileUrl: url,
                uploadedAt: f.created_at || new Date().toISOString(),
                validated: false,
                permitType: type,
                ...(extra?.state ? { state: extra.state } : {}),
                ...(extra?.locality ? { locality: extra.locality } : {}),
              } as MMPStatePermitDocument;
            });
        };

        const top = await list(base);
        const hasTypeFolders = top?.some((e: any) => !e.metadata && ['federal', 'state', 'local'].includes(e.name));
        let docs: MMPStatePermitDocument[] = [];

        if (hasTypeFolders) {
          const fedEntries = await list(`${base}/federal`);
          const fedFiles = (fedEntries || []).filter((e: any) => !!e.metadata);
          docs = docs.concat(toDocs(`${base}/federal`, fedFiles, 'federal'));

          const stateEntries = await list(`${base}/state`);
          const stateFolders = (stateEntries || []).filter((e: any) => !e.metadata);
          for (const sf of stateFolders) {
            const stateFilesEntries = await list(`${base}/state/${sf.name}`);
            const stateFiles = (stateFilesEntries || []).filter((e: any) => !!e.metadata);
            docs = docs.concat(toDocs(`${base}/state/${sf.name}`, stateFiles, 'state', { state: sf.name }));
          }
          // Also handle flat files directly under /state (no nested folders)
          const flatStateFiles = (stateEntries || []).filter((e: any) => !!e.metadata);
          if (flatStateFiles?.length) {
            docs = docs.concat(toDocs(`${base}/state`, flatStateFiles, 'state'));
          }

          const localEntries = await list(`${base}/local`);
          const localFolders = (localEntries || []).filter((e: any) => !e.metadata);
          for (const lf of localFolders) {
            const localFilesEntries = await list(`${base}/local/${lf.name}`);
            const localFiles = (localFilesEntries || []).filter((e: any) => !!e.metadata);
            docs = docs.concat(toDocs(`${base}/local/${lf.name}`, localFiles, 'local', { locality: lf.name }));
          }
          const flatLocalFiles = (localEntries || []).filter((e: any) => !!e.metadata);
          if (flatLocalFiles?.length) {
            docs = docs.concat(toDocs(`${base}/local`, flatLocalFiles, 'local'));
          }
        } else {
          // Backward compatibility: files directly under base. We default to 'federal' to at least render them.
          const entries = await list(base);
          const files = (entries || []).filter((e: any) => !!e.metadata);
          docs = docs.concat(toDocs(base, files, 'federal'));
        }

        return docs;
      } catch (e) {
        console.error('fetchFromStorage failed', e);
        return [];
      }
    };

    const load = async () => {
      const storageDocs = await fetchFromStorage();

      // Normalize DB-persisted documents
      const persistedRaw = mmpFile?.permits;
      const persistedDocs = normalizeDocs(persistedRaw);

      // Helper: merge by id or fileName, ensuring no duplicates
      const mergeLists = (a: MMPStatePermitDocument[], b: MMPStatePermitDocument[]) => {
        const aByKey = new Map<string, MMPStatePermitDocument>();
        const keyOf = (d: MMPStatePermitDocument) => (d.id || d.fileName || '').toString();
        a.forEach(d => aByKey.set(keyOf(d), d));
        const out: MMPStatePermitDocument[] = [];
        // start with storage list (has correct URLs/paths)
        a.forEach(sd => {
          const key = keyOf(sd);
          const pd = b.find(x => keyOf(x) === key) || undefined;
          out.push({
            ...sd,
            // prefer persisted decision/notes
            status: pd?.status ?? sd.status,
            verificationNotes: pd?.verificationNotes ?? sd.verificationNotes,
            verifiedAt: pd?.verifiedAt ?? sd.verifiedAt,
            verifiedBy: pd?.verifiedBy ?? sd.verifiedBy,
            // ensure geo fields remain
            state: sd.state ?? pd?.state,
            locality: sd.locality ?? pd?.locality,
          });
        });
        // include any persisted docs that aren't in storage (edge cases)
        b.forEach(pd => {
          const key = keyOf(pd);
          if (!aByKey.has(key)) out.push(pd);
        });
        // Final deduplication by key to ensure no duplicates
        const finalMap = new Map<string, MMPStatePermitDocument>();
        out.forEach(doc => finalMap.set(keyOf(doc), doc));
        return Array.from(finalMap.values());
      };

      let finalDocs: MMPStatePermitDocument[] = [];
      if (storageDocs.length > 0) {
        finalDocs = mergeLists(storageDocs, persistedDocs);
      } else {
        finalDocs = persistedDocs;
      }

      if (!cancelled) {
        const currentFederalState = permits.filter(d => d.permitType === 'federal');
        const newFederalState = finalDocs.filter(d => d.permitType === 'federal');
        
        const federalStateChanged = currentFederalState.length !== newFederalState.length || 
          !currentFederalState.every((doc, i) => doc.id === newFederalState[i]?.id);
        
        if (federalStateChanged) {
          setPermits(newFederalState);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [mmpFile?.id, mmpFile?.mmpId, mmpFile?.permits]);

  const handleDeletePermit = async (permitId: string) => {
    try {
      const doc = permits.find(p => p.id === permitId);
      if (!doc) {
        toast({ title: 'Permit not found', description: 'Could not locate the selected permit.', variant: 'destructive' });
        return;
      }

      try {
        const bucket = 'mmp-files';
        const path = typeof doc.id === 'string' && doc.id.includes('/') ? doc.id : '';
        if (path) {
          const { error: rmError } = await supabase.storage.from(bucket).remove([path]);
          if (rmError) {
            console.warn('Storage remove failed (non-fatal):', rmError);
          }
        }
      } catch (e) {
        console.warn('Storage remove threw (non-fatal):', e);
      }

      const updatedPermits = permits.filter(p => p.id !== permitId);
      setPermits(updatedPermits);
      persistPermits(updatedPermits);

      toast({ title: 'Permit deleted', description: `${doc.fileName} was removed.` });
    } catch (e) {
      console.warn('Delete permit failed:', e);
      toast({ title: 'Delete failed', description: 'Could not delete the permit. Please try again.', variant: 'destructive' });
    }
  };

  const notifyAdminsAndICT = async (doc: MMPStatePermitDocument, decision: 'verified' | 'rejected') => {
    try {
      const mmpId = mmpFile?.id || mmpFile?.mmpId;
      if (!mmpId) return;
      const { data: recipients } = await supabase
        .from('profiles')
        .select('id, role')
        .in('role', ['admin', 'ict']);
      const rows = (recipients || []).map(r => ({
        user_id: r.id,
        title: decision === 'verified' ? 'Permit accepted' : 'Permit rejected',
        message: `${mmpFile?.name || 'MMP'} • ${doc.fileName} ${decision}. ${doc.state ? `State: ${doc.state}. ` : ''}${doc.locality ? `Locality: ${doc.locality}. ` : ''}${doc.verificationNotes ? `Reason: ${doc.verificationNotes}` : ''}`.trim(),
        type: decision === 'verified' ? 'success' : 'warning',
        link: `/mmp/${mmpId}/verification`,
        related_entity_id: mmpId,
        related_entity_type: 'mmpFile'
      }));
      if (rows.length) await supabase.from('notifications').insert(rows);
    } catch (e) {
      console.warn('Failed to notify admins/ICT about permit decision:', e);
    }
  };

  const persistPermits = (docs: MMPStatePermitDocument[]) => {
    const now = new Date().toISOString();
    const permitsData: MMPPermitsData = {
      federal: docs.some(d => d.permitType === 'federal'),
      state: false,
      local: false,
      lastVerified: docs.some(d => d.status) ? now : undefined,
      verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || undefined,
      // Cast to MMPDocument[] for compatibility; downstream code handles extended fields safely
      documents: docs as unknown as any,
    };

    if (mmpFile?.id) {
      updateMMP(mmpFile.id, { permits: permitsData } as any);
    }
    if (onVerificationComplete) {
      onVerificationComplete(permitsData);
      // Also persist directly with retry to ensure DB state is updated even on transient failures
      (async () => {
        if (!mmpFile?.id) return;
        let attempt = 0;
        let delay = 500;
        while (attempt < 3) {
          try {
            const { error } = await supabase
              .from('mmp_files')
              .update({ permits: permitsData, updated_at: new Date().toISOString() })
              .eq('id', mmpFile.id);
            if (!error) return;
            console.warn('Persist permits attempt failed:', error?.message || error);
          } catch (e) {
            console.warn('Persist permits transport error:', e);
          }
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
          attempt++;
        }
        toast({
          title: 'Sync delayed',
          description: 'Could not sync permit changes to server. They remain locally and will retry shortly.',
          variant: 'destructive',
        });
      })();
    } else if (mmpFile?.id) {
      // Directly persist if no callback provided
      updateMMP(mmpFile.id, { permits: permitsData } as any);
    }
  };

  const handleUploadSuccess = (newPermit: MMPStatePermitDocument) => {
    const updatedPermits = [...permits, newPermit];
    setPermits(updatedPermits);
    persistPermits(updatedPermits);
    
    toast({
      title: "Permit Uploaded",
      description: `${newPermit.fileName} has been uploaded successfully.`,
    });

    // Notify stakeholders and share entries to coordinators
    (async () => {
      try {
        const mmpId = mmpFile?.id || mmpFile?.mmpId;
        if (!mmpId) return;

        // 1) Notify FOMs and Supervisors that a permit was uploaded
        const { data: recipients } = await supabase
          .from('profiles')
          .select('id, role, hub_id')
          .in('role', ['fom', 'supervisor']);
        const rows = (recipients || []).map(r => ({
          user_id: r.id,
          title: 'Permit uploaded',
          message: `${mmpFile?.name || 'MMP'} has a new permit uploaded`,
          type: 'info',
          link: `/mmp/${mmpId}`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile'
        }));
        if (rows.length) await supabase.from('notifications').insert(rows);

        // 2) Share entries to State Coordinators for CP review
        // Fetch entries if not present
        let entries = Array.isArray(mmpFile?.siteEntries) && mmpFile.siteEntries.length > 0
          ? mmpFile.siteEntries
          : [];
        if (!entries.length && mmpFile?.id) {
          const { data: dbEntries } = await supabase
            .from('mmp_site_entries')
            .select('state, locality')
            .eq('mmp_file_id', mmpFile.id);
          entries = dbEntries || [];
        }

        if (!entries.length) return;

        // Map entry state/locality names to ids defined in sudanStates
        const stateNameToId = new Map<string, string>();
        for (const s of sudanStates) stateNameToId.set(s.name.toLowerCase(), s.id);

        const localitiesByState = new Map<string, Map<string, string>>();
        for (const s of sudanStates) {
          const map = new Map<string, string>();
          s.localities.forEach(l => map.set(l.name.toLowerCase(), l.id));
          localitiesByState.set(s.id, map);
        }

        const targetPairs = new Set<string>(); // state_id|locality_id?
        entries.forEach((e: any) => {
          const sName = String(e.state || '').trim().toLowerCase();
          const stateId = stateNameToId.get(sName);
          if (!stateId) return;
          const locName = String(e.locality || '').trim().toLowerCase();
          const locMap = localitiesByState.get(stateId);
          const localityId = locName && locMap ? (locMap.get(locName) || '') : '';
          targetPairs.add(`${stateId}|${localityId}`);
        });

        if (targetPairs.size === 0) return;

        // Build filters and fetch coordinators
        const allStates = Array.from(new Set(Array.from(targetPairs).map(k => k.split('|')[0])));
        const { data: coords } = await supabase
          .from('profiles')
          .select('id, state_id, locality_id, role')
          .eq('role', 'coordinator')
          .in('state_id', allStates);

        const coordRows = (coords || []).filter(c => {
          // If we matched a specific locality, ensure locality match; otherwise state match is enough
          const key1 = `${c.state_id}|${c.locality_id || ''}`;
          const key2 = `${c.state_id}|`;
          return targetPairs.has(key1) || targetPairs.has(key2);
        }).map(c => ({
          user_id: c.id,
          title: 'Sites shared for CP review',
          message: `${mmpFile?.name || 'MMP'} sites have been shared for your review`,
          type: 'info',
          link: `/mmp/${mmpId}`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile'
        }));

        if (coordRows.length) await supabase.from('notifications').insert(coordRows);
      } catch (e) {
        console.warn('Permit upload notifications/share failed:', e);
      }
    })();
  };

  const handleVerifyPermit = (permitId: string, status: 'verified' | 'rejected', notes?: string) => {
    let decidedDoc: MMPStatePermitDocument | undefined;
    const updatedPermits = permits.map(permit => {
      if (permit.id === permitId) {
        const updated = {
          ...permit,
          status,
          verificationNotes: notes,
          verifiedAt: new Date().toISOString(),
          verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
        } as MMPStatePermitDocument;
        decidedDoc = updated;
        return updated;
      }
      return permit;
    });
    setPermits(updatedPermits);
    persistPermits(updatedPermits);

    // Update the corresponding mmp_site_entries record to status 'approved'
    (async () => {
      try {
        // Use decidedDoc.id as mmp_site_entry id if possible
        if (decidedDoc?.id) {
          await supabase.from('mmp_site_entries').update({ status: 'Approved' }).eq('id', decidedDoc.id);
        } else if ((decidedDoc as any)?.siteCode) {
          // Fallback: update by site_code and mmp_file_id if siteCode exists
          await supabase.from('mmp_site_entries').update({ status: 'Approved' })
            .eq('site_code', (decidedDoc as any).siteCode)
            .eq('mmp_file_id', mmpFile?.id || mmpFile?.mmpId);
        }
      } catch (e) {
        console.warn('Failed to update mmp_site_entries status to approved:', e);
      }
    })();
    if (decidedDoc) {
      (async () => { await notifyAdminsAndICT(decidedDoc!, status); })();
    }

    // As soon as any permit is verified, update MMP status/workflow to 'permitsVerified'
    if (mmpFile?.id) {
      updateMMP(mmpFile.id, {
        status: 'approved',
        workflow: {
          ...(mmpFile.workflow || {}),
          currentStage: 'permitsVerified',
        },
      });
    }
  };



  const calculateProgress = () => {
    // Progress should reflect only federal permits
    const federalPermits = permits.filter(p => p.permitType === 'federal');
    if (federalPermits.length === 0) return 0;
    const decided = federalPermits.filter(p => p.status === 'verified' || p.status === 'rejected').length;
    return Math.round((decided / federalPermits.length) * 100);
  };

  const progress = calculateProgress();
  const siteCount = mmpFile?.siteEntries?.length || mmpFile?.entries || 0;
  // Consider only federal permits for verification gating
  const allPermitsList = permits.filter(p => p.permitType === 'federal');
  const allVerified = allPermitsList.length > 0 && allPermitsList.every(p => p.status === 'verified');

  // Check permit requirements
  const isFOM = hasAnyRole(['fom', 'fieldOpManager']);
  const hasFederalPermit = permits.some(p => p.permitType === 'federal');
  // const hasStatePermit = permits.some(p => p.permitType === 'state'); // hidden
  // Only federal permit is required for all roles now
  const requiredPermitsUploaded = hasFederalPermit;
  const canReviewOrForward = allVerified && requiredPermitsUploaded && !hasForwarded;

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Federal Permit
          </CardTitle>
          <CardDescription>
            Upload the federal permit required for MMP verification
            {siteCount > 0 && (
              <span className="ml-1 text-xs font-medium text-blue-600">
                • MMP contains {siteCount} sites
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MMPPermitFileUpload 
            onUploadSuccess={handleUploadSuccess}
            bucket="mmp-files"
            pathPrefix={`permits/${mmpFile?.id || mmpFile?.mmpId || 'unknown'}`}
          />
        </CardContent>
      </Card>

      {/* Permit Status Warnings */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertTriangle className="h-5 w-5" />
            Permit Status Overview
          </CardTitle>
          <CardDescription className="text-orange-700">
            Check what permits you have uploaded and what is still required
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Federal Permit Status */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {hasFederalPermit ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Federal Permit</div>
                  <div className="text-sm text-gray-600">
                    {hasFederalPermit ? "Uploaded and ready" : "Not uploaded yet"}
                  </div>
                </div>
              </div>
              <div className="text-sm font-medium">
                {hasFederalPermit ? (
                  <span className="text-green-600">✓ Complete</span>
                ) : (
                  <span className="text-orange-600">⚠ Required</span>
                )}
              </div>
            </div>

            {/* State Permit Status hidden */}
            {/**
            <div className="flex items-center justify-between p-3 rounded-lg border">...</div>
            **/}

            {/* Summary Message */}
            <div className="mt-4 p-3 bg-white rounded-lg border">
              <div className="text-sm">
                {hasFederalPermit ? (
                  <div className="text-green-700 font-medium">
                    ✓ Federal permit uploaded. You can now review and assign coordinators.
                  </div>
                ) : (
                  <div className="text-orange-700 font-medium">
                    ⚠ Federal permit required. Upload the federal permit to proceed.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Federal Permits Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Federal Permits
          </CardTitle>
          <CardDescription>
            Track and manage federal permit verifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {permits.filter(p => p.permitType === 'federal').length > 0 ? (
              permits.filter(p => p.permitType === 'federal').map((permit) => (
                <PermitVerificationCard
                  key={permit.id}
                  permit={permit}
                  onVerify={handleVerifyPermit}
                  onDelete={handleDeletePermit}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium mb-1">No federal permits uploaded yet</p>
                <p className="text-xs">Upload federal permits to begin verification</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Local Permits Section hidden */}
      {/**
      <Card> ... </Card>
      **/}

      {/* Overall Progress Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Federal Permit Verification Progress
          </CardTitle>
          <CardDescription>
            Federal verification progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                Overall Progress
              </span>
              <span className="text-sm font-medium">
                {progress}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="text-center">
              <div className="font-medium text-blue-600">{permits.length}</div>
              <div className="text-muted-foreground">Federal</div>
            </div>
            {/** State and Local counts hidden **/}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            {canReviewOrForward ? (
              <Button onClick={() => navigate(`/mmp/${mmpFile.id}/review-assign-coordinators`)}>
                <Send className="h-4 w-4 mr-2" />
                Review & Assign Coordinators
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground text-center w-full">
                {!hasFederalPermit && "Upload federal permit to enable review and forwarding"}
                {requiredPermitsUploaded && !allVerified && "Verify all permits to enable review and forwarding"}
                {hasForwarded && "Sites have already been forwarded"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default MMPPermitVerification;
