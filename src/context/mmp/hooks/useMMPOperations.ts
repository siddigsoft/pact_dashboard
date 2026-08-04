
import { useState } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadMMPFile } from '@/utils/mmpFileUpload';
import { logDeletionAudit } from '@/services/mmpAudit.service';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';

export const useMMPOperations = (mmpFiles: MMPFile[], setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const [currentMMP, setCurrentMMP] = useState<MMPFile | null>(null);

  const getMmpById = (id: string): MMPFile | undefined => {
    if (!id || !mmpFiles?.length) {
      console.log('No ID provided or no MMP files available');
      return undefined;
    }
    
    console.log('Current ID from URL:', id);
    console.log('Available MMP files:', mmpFiles?.length || 0);
    
    const mmp = mmpFiles.find(m => m.id === id);
    console.log('Found MMP file:', mmp ? 'Found' : 'Not found');
    
    return mmp;
  };

  const addMMPFile = (mmp: MMPFile) => {
    try {
      console.log('Adding new MMP file:', mmp);
      setMMPFiles((prev: MMPFile[]) => [...(prev || []), mmp]);
      // Do not insert here; upload flow handles DB insert
      toast.success('MMP file added');
    } catch (error) {
      console.error('Error adding MMP file:', error);
      toast.error('Failed to add MMP file');
    }
  };

  const updateMMPFile = async (mmp: MMPFile) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return;
    }

    try {
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((m) => (m.id === mmp.id ? mmp : m))
      );

      const mapToDB = (m: Partial<MMPFile>) => {
        const map: Record<string, string> = {
          uploadedAt: 'uploaded_at',
          uploadedBy: 'uploaded_by',
          processedEntries: 'processed_entries',
          mmpId: 'mmp_id',
          filePath: 'file_path',
          originalFilename: 'original_filename',
          fileUrl: 'file_url',
          approvalWorkflow: 'approval_workflow',
          siteEntries: 'site_entries',
          projectName: 'project_name',
          cpVerification: 'cp_verification',
          rejectionReason: 'rejection_reason',
          approvedBy: 'approved_by',
          approvedAt: 'approved_at',
          archivedBy: 'archived_by',
          archivedAt: 'archived_at',
          deletedBy: 'deleted_by',
          deletedAt: 'deleted_at',
          expiryDate: 'expiry_date',
          modificationHistory: 'modification_history',
          modifiedAt: 'modified_at',
        };
        const out: any = { updated_at: new Date().toISOString() };
        Object.entries(m).forEach(([k, v]) => {
          const dbk = (map as any)[k] || k;
          out[dbk] = v as any;
        });
        return out;
      };

      const dbPayload = mapToDB(mmp);
      const { error } = await withTimeout(
        (async () => {
          return await supabase.from('mmp_files').update(dbPayload).eq('id', mmp.id);
        })(),
        15000,
        'Update MMP file timed out'
      );

      if (error) {
        console.error('Supabase update error:', error);
        toast.error('Database update failed');
      } else {
        toast.success('MMP file updated');
      }
    } catch (error) {
      console.error('Error updating MMP file:', error);
      toast.error('Failed to update MMP file');
    }
  };

  const deleteMMPFile = async (id: string, bypassGuard = false): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
          // ── SAFETY GUARD ────────────────────────────────────────────────────
          // bypassGuard is only set by unlinkAndDeleteMMPFile AFTER it has
          // already cleared all FK references — it is never exposed to the UI.
          if (!bypassGuard) {
            try {
              // 1a. Check via site entries → down_payment_requests
              const { data: entryIds } = await supabase
                .from('mmp_site_entries')
                .select('id')
                .eq('mmp_file_id', id);
              if (entryIds && entryIds.length > 0) {
                const ids = entryIds.map((e: any) => e.id as string);
                const { data: linkedDPs } = await supabase
                  .from('down_payment_requests')
                  .select('id')
                  .in('mmp_site_entry_id', ids)
                  .limit(1);
                if (linkedDPs && linkedDPs.length > 0) {
                  toast.error(
                    'Blocked: this MMP has linked advance requests. Use "Unlink & Delete" in the delete dialog to detach them first, or use "Archive MMP" to hide the MMP without losing any data.'
                  );
                  return false;
                }
              }
              // 1b. Check operational_cost_submissions directly
              const { data: linkedCosts } = await supabase
                .from('operational_cost_submissions')
                .select('id')
                .eq('mmp_id', id)
                .limit(1);
              if (linkedCosts && linkedCosts.length > 0) {
                toast.error(
                  'Blocked: this MMP has linked cost submissions. Use "Unlink & Delete" in the delete dialog to detach them first, or use "Archive MMP" to hide the MMP without losing any data.'
                );
                return false;
              }
            } catch (guardErr) {
              console.warn('[MMP Delete] Safety guard check failed — blocking delete as a precaution:', guardErr);
              toast.error('Could not verify submission links. Delete blocked for safety. Use Archive instead.');
              return false;
            }
          }
          // ── END SAFETY GUARD ────────────────────────────────────────────────

          // Get MMP details before deletion for audit logging
          const mmpToDelete = mmpFiles.find(m => m.id === id);
          const mmpName = mmpToDelete?.name || mmpToDelete?.mmpId || 'Unknown MMP';
          const mmpStorage = mmpToDelete?.filePath;

          // Get current user for audit
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUser = sessionData?.session?.user;

          console.log('[MMP Delete] Starting cascade delete for MMP:', { id, name: mmpName });

          // 1. Get list of storage paths to delete from document_index before deleting records
          let storagePaths: string[] = [];
          try {
            const { data: docs } = await supabase
              .from('document_index')
              .select('storage_path, file_url')
              .eq('mmp_id', id);
            
            if (docs?.length) {
              storagePaths = docs
                .map(d => d.storage_path || (d.file_url ? new URL(d.file_url).pathname.split('/').pop() : null))
                .filter((p): p is string => !!p);
              console.log('[MMP Delete] Found', storagePaths.length, 'storage paths to clean');
            }
          } catch (err) {
            console.warn('[MMP Delete] Could not fetch storage paths:', err);
          }

          // 2. Delete associated documents from document_index (permits, receipts, photos, files)
          try {
            const { error: docError, data: docData } = await supabase
              .from('document_index')
              .delete()
              .eq('mmp_id', id)
              .select();
            if (docError) {
              console.error('[MMP Delete] CRITICAL - Failed to delete document_index entries:', {
                error: docError.message,
                details: docError.details,
                mmp_id: id
              });
              // Try alternative approach using mmp_name if mmp_id fails
              if (mmpToDelete?.mmpId) {
                console.log('[MMP Delete] Attempting fallback delete using mmp_name...');
                const { error: fallbackErr } = await supabase
                  .from('document_index')
                  .delete()
                  .eq('mmp_name', mmpToDelete.mmpId);
                if (fallbackErr) {
                  console.error('[MMP Delete] Fallback delete also failed:', fallbackErr.message);
                } else {
                  console.log('[MMP Delete] Fallback delete succeeded');
                }
              }
            } else {
              const deletedCount = docData?.length || 0;
              console.log('[MMP Delete] Cleaned up', deletedCount, 'document_index entries for MMP', id);
            }
          } catch (docDelError) {
            console.error('[MMP Delete] Exception deleting document_index:', docDelError);
          }

          // 3. Delete storage files for permits and documents
          if (storagePaths.length > 0) {
            try {
              // Try permits bucket first
              const { error: permitStorageErr } = await supabase.storage
                .from('permits')
                .remove(storagePaths);
              if (permitStorageErr) {
                console.warn('[MMP Delete] Some permit files may not have been deleted:', permitStorageErr.message);
              }
              // Also try site-photos bucket
              const { error: photoStorageErr } = await supabase.storage
                .from('site-photos')
                .remove(storagePaths);
              if (photoStorageErr) {
                console.warn('[MMP Delete] Some photo files may not have been deleted:', photoStorageErr.message);
              }
              console.log('[MMP Delete] Attempted storage cleanup for', storagePaths.length, 'files');
            } catch (storageErr) {
              console.warn('[MMP Delete] Storage cleanup error:', storageErr);
            }
          }

          // 4. Delete associated site photos from site_visit_photos table
          try {
            const { data: sitePhotos, error: photoFetchError } = await supabase
              .from('site_visit_photos')
              .select('id, storage_path')
              .eq('mmp_id', id);
            
            if (photoFetchError) {
              console.error('[MMP Delete] Failed to fetch site photos:', photoFetchError);
            } else if (sitePhotos?.length) {
              const photoIds = sitePhotos.map(p => p.id);
              const photoPaths = sitePhotos.map(p => p.storage_path).filter(Boolean);
              
              // Delete from storage
              if (photoPaths.length > 0) {
                await supabase.storage.from('site-photos').remove(photoPaths as string[]);
              }
              
              // Delete from database
              const { error: photoDelError, data: photoDelData } = await supabase
                .from('site_visit_photos')
                .delete()
                .in('id', photoIds)
                .select();
              
              if (photoDelError) {
                console.error('[MMP Delete] CRITICAL - Failed to delete site photos:', {
                  error: photoDelError.message,
                  details: photoDelError.details,
                  photoCount: photoIds.length,
                  mmp_id: id
                });
              } else {
                const deletedPhotoCount = photoDelData?.length || photoIds.length;
                console.log('[MMP Delete] Deleted', deletedPhotoCount, 'site photos for MMP', id);
              }
            }
          } catch (photoError) {
            console.error('[MMP Delete] Exception deleting site photos:', photoError);
          }

          // 4.5. Defensively nullify NO-ACTION FK columns before deleting site entries.
          //
          // Migration 20260803_mmp_fk_set_null_on_delete.sql converts these to SET NULL
          // at the DB level, but that migration must be run manually in Supabase SQL Editor.
          // This pre-clearing step is kept as a belt-and-suspenders guard so the delete
          // works whether or not the migration has been applied yet.
          //
          //   a) site_visit_costs.mmp_site_entry_id → mmp_site_entries  (blocks step 5)
          //   b) site_visits.mmp_site_entry_id       → mmp_site_entries  (blocks step 5)
          //   c) site_visits.mmp_id                  → mmp_files         (blocks step 7)
          //
          // down_payment_requests.mmp_site_entry_id is already SET NULL in the DB — skip.
          try {
            const { data: entryIds } = await supabase
              .from('mmp_site_entries')
              .select('id')
              .eq('mmp_file_id', id);

            const ids = (entryIds ?? []).map((e: any) => e.id as string).filter(Boolean);
            console.log('[MMP Delete] Pre-clearing FK refs for', ids.length, 'site entries');

            await Promise.allSettled([
              // (a) site_visit_costs.mmp_site_entry_id
              ids.length > 0
                ? supabase.from('site_visit_costs' as any).update({ mmp_site_entry_id: null }).in('mmp_site_entry_id', ids)
                : Promise.resolve(),
              // (b) site_visits.mmp_site_entry_id
              ids.length > 0
                ? supabase.from('site_visits' as any).update({ mmp_site_entry_id: null }).in('mmp_site_entry_id', ids)
                : Promise.resolve(),
              // (c) site_visits.mmp_id
              supabase.from('site_visits' as any).update({ mmp_id: null } as any).eq('mmp_id', id),
            ]);

            console.log('[MMP Delete] FK pre-clear complete — delete chain unblocked');
          } catch (fkClearErr) {
            console.warn('[MMP Delete] FK pre-clear failed (continuing anyway):', fkClearErr);
          }

          // 5. Explicitly delete mmp_site_entries (in case CASCADE is not set)
          try {
            const { error: siteEntriesDelError, data: deletedEntries } = await supabase
              .from('mmp_site_entries')
              .delete()
              .eq('mmp_file_id', id)
              .select();
            
            if (siteEntriesDelError) {
              console.error('[MMP Delete] Failed to delete mmp_site_entries:', {
                error: siteEntriesDelError.message,
                details: siteEntriesDelError.details,
                mmp_id: id
              });
            } else {
              console.log('[MMP Delete] Deleted', deletedEntries?.length || 0, 'site entries for MMP', id);
            }
          } catch (siteEntriesErr) {
            console.error('[MMP Delete] Exception deleting site entries:', siteEntriesErr);
          }

          // 6. Delete MMP file from storage
          if (mmpStorage) {
            try {
              const { error: mmpStorageErr } = await supabase.storage
                .from('mmp-files')
                .remove([mmpStorage]);
              if (mmpStorageErr) {
                console.warn('[MMP Delete] Failed to delete MMP file from storage:', mmpStorageErr.message);
              } else {
                console.log('[MMP Delete] Deleted MMP file from storage:', mmpStorage);
              }
            } catch (storageErr) {
              console.warn('[MMP Delete] Storage cleanup error for MMP file:', storageErr);
            }
          }

          // 7. Delete main MMP record from DB
          const { error } = await supabase
            .from('mmp_files')
            .delete()
            .eq('id', id);

          if (error) {
            console.error('[MMP Delete] Database delete error:', error);
            toast.error('Database delete failed. Check permissions/RLS and try again.');
            return false;
          }

          // Log deletion audit with timestamp
          try {
            await logDeletionAudit(
              'mmp',
              id,
              mmpName,
              currentUser?.id || 'unknown',
              currentUser?.user_metadata?.full_name || currentUser?.email,
              currentUser?.email,
              'MMP file deleted',
              undefined,
              {
                mmpStatus: mmpToDelete?.status,
                deletedAt: new Date().toISOString()
              }
            );
          } catch (auditError) {
            console.warn('[MMP Delete] Audit log failed:', auditError);
          }

          // Only update local state after successful DB delete
          console.log('[MMP Delete] Successfully deleted MMP:', id, mmpName);
          setMMPFiles((prev: MMPFile[]) => (prev || []).filter((mmp) => mmp.id !== id));
          toast.success('MMP file deleted');
          return true;
        })(),
        30000, // Increased timeout for comprehensive cleanup
        'Delete MMP file timed out'
      );
    } catch (error) {
      console.error('Error deleting MMP file:', error);
      toast.error('Failed to delete MMP file');
      return false;
    }
  };

  // ── Unlink & Delete ────────────────────────────────────────────────────────
  // Sets mmp_site_entry_id = NULL on all linked down_payment_requests and
  // mmp_id = NULL on all operational_cost_submissions, then proceeds with the
  // normal delete.  Submissions survive; only the MMP + site entries are removed.
  const unlinkAndDeleteMMPFile = async (id: string): Promise<{ unlinked: { downPayments: number; costSubmissions: number }; deleted: boolean }> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return { unlinked: { downPayments: 0, costSubmissions: 0 }, deleted: false };
    }
    try {
      // 1. Get site entry IDs
      const { data: entryRows } = await supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('mmp_file_id', id);
      const entryIds = (entryRows || []).map((r: any) => r.id as string);

      // 2. Unlink down_payment_requests
      let downPaymentCount = 0;
      if (entryIds.length > 0) {
        const { data: dpRows } = await supabase
          .from('down_payment_requests')
          .select('id')
          .in('mmp_site_entry_id', entryIds);
        downPaymentCount = dpRows?.length ?? 0;
        if (downPaymentCount > 0) {
          const { error: dpErr } = await supabase
            .from('down_payment_requests')
            .update({ mmp_site_entry_id: null } as any)
            .in('mmp_site_entry_id', entryIds);
          if (dpErr) {
            console.error('[MMP UnlinkAndDelete] Failed to unlink down_payment_requests:', dpErr);
            toast.error('Could not unlink advance requests: ' + dpErr.message);
            return { unlinked: { downPayments: 0, costSubmissions: 0 }, deleted: false };
          }
        }
      }

      // 3. Unlink operational_cost_submissions
      const { data: costRows } = await supabase
        .from('operational_cost_submissions')
        .select('id')
        .eq('mmp_id', id);
      const costCount = costRows?.length ?? 0;
      if (costCount > 0) {
        const { error: costErr } = await supabase
          .from('operational_cost_submissions')
          .update({ mmp_id: null } as any)
          .eq('mmp_id', id);
        if (costErr) {
          console.error('[MMP UnlinkAndDelete] Failed to unlink operational_cost_submissions:', costErr);
          toast.error('Could not unlink cost submissions: ' + costErr.message);
          return { unlinked: { downPayments: 0, costSubmissions: 0 }, deleted: false };
        }
      }

      // 4. Bypass the guard — we just cleared all FK references above
      const deleted = await deleteMMPFile(id, true);
      return { unlinked: { downPayments: downPaymentCount, costSubmissions: costCount }, deleted };
    } catch (err) {
      console.error('[MMP UnlinkAndDelete] Error:', err);
      toast.error('Failed to unlink and delete MMP. Please try again.');
      return { unlinked: { downPayments: 0, costSubmissions: 0 }, deleted: false };
    }
  };

  // ── Count linked submissions (for UI preview) ───────────────────────────────
  const getMMPLinkedCounts = async (id: string): Promise<{ downPayments: number; costSubmissions: number }> => {
    try {
      const { data: entryRows } = await supabase
        .from('mmp_site_entries').select('id').eq('mmp_file_id', id);
      const entryIds = (entryRows || []).map((r: any) => r.id as string);

      let dpCount = 0;
      if (entryIds.length > 0) {
        const { count } = await supabase
          .from('down_payment_requests')
          .select('id', { count: 'exact', head: true })
          .in('mmp_site_entry_id', entryIds);
        dpCount = count ?? 0;
      }
      const { count: costCount } = await supabase
        .from('operational_cost_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('mmp_id', id);
      return { downPayments: dpCount, costSubmissions: costCount ?? 0 };
    } catch {
      return { downPayments: 0, costSubmissions: 0 };
    }
  };

  return {
    currentMMP,
    setCurrentMMP,
    getMmpById,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
    unlinkAndDeleteMMPFile,
    getMMPLinkedCounts,
  };
};
