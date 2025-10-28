
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MMPPermitsData, MMPStatePermitDocument, MMPLocalPermit } from '@/types/mmp/permits';
import { MMPPermitFileUpload } from './MMPPermitFileUpload';
import { PermitVerificationCard } from './permits/PermitVerificationCard';
import { Progress } from '@/components/ui/progress';
import { Upload, FileCheck } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

interface MMPPermitVerificationProps {
  mmpFile: any;
  onVerificationComplete?: (verificationData: any) => void;
}

const MMPPermitVerification: React.FC<MMPPermitVerificationProps> = ({
  mmpFile,
  onVerificationComplete
}) => {
  const [permits, setPermits] = useState<MMPStatePermitDocument[]>([]);
  const [localPermits, setLocalPermits] = useState<MMPStatePermitDocument[]>([]);
  const { toast } = useToast();
  const { updateMMP } = useMMP();
  const { currentUser } = useAppContext();

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
      if (!cancelled && storageDocs.length > 0) {
        setPermits(storageDocs.filter(d => d.permitType === 'federal' || d.permitType === 'state'));
        setLocalPermits(storageDocs.filter(d => d.permitType === 'local'));
        return;
      }

      // Fallback to value on the MMP record
      const raw = mmpFile?.permits;
      const docs = normalizeDocs(raw);
      if (!cancelled) {
        setPermits(docs.filter(d => d.permitType === 'federal' || d.permitType === 'state'));
        setLocalPermits(docs.filter(d => d.permitType === 'local'));
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [mmpFile?.id, mmpFile?.mmpId, mmpFile?.permits]);

  const persistPermits = (docs: MMPStatePermitDocument[], localDocs: MMPStatePermitDocument[] = []) => {
    const now = new Date().toISOString();
    const allDocs = [...docs, ...localDocs];
    const permitsData: MMPPermitsData = {
      federal: docs.some(d => d.permitType === 'federal'),
      state: docs.some(d => d.permitType === 'state'),
      local: localDocs.some(d => d.permitType === 'local'),
      lastVerified: allDocs.some(d => d.status) ? now : undefined,
      verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || undefined,
      // Cast to MMPDocument[] for compatibility; downstream code handles extended fields safely
      documents: allDocs as unknown as any,
    };

    if (onVerificationComplete) {
      onVerificationComplete(permitsData);
    } else if (mmpFile?.id) {
      // Directly persist if no callback provided
      updateMMP(mmpFile.id, { permits: permitsData } as any);
    }
  };

  const handleUploadSuccess = (newPermit: MMPStatePermitDocument) => {
    if (newPermit.permitType === 'local') {
      const updatedLocalPermits = [...localPermits, newPermit];
      setLocalPermits(updatedLocalPermits);
      persistPermits(permits, updatedLocalPermits);
    } else {
      const updatedPermits = [...permits, newPermit];
      setPermits(updatedPermits);
      persistPermits(updatedPermits, localPermits);
    }
    
    toast({
      title: "Permit Uploaded",
      description: `${newPermit.fileName} has been uploaded successfully.`,
    });
  };

  const handleVerifyPermit = (permitId: string, status: 'verified' | 'rejected', notes?: string) => {
    // Check if it's a local permit
    const localPermitIndex = localPermits.findIndex(p => p.id === permitId);
    if (localPermitIndex !== -1) {
      const updatedLocalPermits = localPermits.map(permit => {
        if (permit.id === permitId) {
          return {
            ...permit,
            status,
            verificationNotes: notes,
            verifiedAt: new Date().toISOString(),
            verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
          };
        }
        return permit;
      });
      setLocalPermits(updatedLocalPermits);
      persistPermits(permits, updatedLocalPermits);
    } else {
      const updatedPermits = permits.map(permit => {
        if (permit.id === permitId) {
          return {
            ...permit,
            status,
            verificationNotes: notes,
            verifiedAt: new Date().toISOString(),
            verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System'
          };
        }
        return permit;
      });
      setPermits(updatedPermits);
      persistPermits(updatedPermits, localPermits);
    }
  };

  const calculateProgress = () => {
    const allPermits = [...permits, ...localPermits];
    if (allPermits.length === 0) return 0;
    const verifiedCount = allPermits.filter(p => p.status === 'verified' || p.status === 'rejected').length;
    return Math.round((verifiedCount / allPermits.length) * 100);
  };

  const progress = calculateProgress();
  const siteCount = mmpFile?.siteEntries?.length || mmpFile?.entries || 0;

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload New Permit
          </CardTitle>
          <CardDescription>
            Add a new permit document for verification
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

      {/* Federal/State Permits Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Federal & State Permits
          </CardTitle>
          <CardDescription>
            Track and manage federal and state permit verifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {permits.length > 0 ? (
              permits.map((permit) => (
                <PermitVerificationCard
                  key={permit.id}
                  permit={permit}
                  onVerify={handleVerifyPermit}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium mb-1">No federal/state permits uploaded yet</p>
                <p className="text-xs">Upload federal or state permits to begin verification</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Local Permits Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Local Permits
          </CardTitle>
          <CardDescription>
            Track and manage local permit verifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {localPermits.length > 0 ? (
              localPermits.map((permit) => (
                <PermitVerificationCard
                  key={permit.id}
                  permit={permit}
                  onVerify={handleVerifyPermit}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium mb-1">No local permits uploaded yet</p>
                <p className="text-xs">Upload local permits to begin verification</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Overall Progress Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Overall Verification Progress
          </CardTitle>
          <CardDescription>
            Combined progress for all permit types
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
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-medium text-blue-600">{permits.filter(p => p.permitType === 'federal').length}</div>
              <div className="text-muted-foreground">Federal</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-green-600">{permits.filter(p => p.permitType === 'state').length}</div>
              <div className="text-muted-foreground">State</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-purple-600">{localPermits.length}</div>
              <div className="text-muted-foreground">Local</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MMPPermitVerification;
