import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PAGE_DEFS } from '@/lib/access-registry';
import { accessWorkspaceUrl } from '@/lib/access-workspace-url';

interface PageAccessModalProps { open: boolean; onClose: () => void; pageSlug: string }
/** Navigation entry; access decisions are edited only in the canonical workspace. */
export function PageAccessModal({ open, onClose, pageSlug }: PageAccessModalProps) {
  const page = PAGE_DEFS.find(candidate => candidate.slug === pageSlug);
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{page?.label ?? 'Page'} access</DialogTitle>
          <DialogDescription>Manage this page's individual exceptions, action permissions and expiry in Access Control.</DialogDescription>
        </DialogHeader>
        <Button asChild><Link to={accessWorkspaceUrl({ pageSlug })} onClick={onClose}>Open Access Control</Link></Button>
      </DialogContent>
    </Dialog>
  );
}
