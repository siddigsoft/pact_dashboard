import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PAGE_DEFS } from '@/lib/access-registry';
import { accessWorkspaceUrl } from '@/lib/access-workspace-url';

interface PageAccessModalProps { open: boolean; onClose: () => void; pageSlug: string }
/** Navigation entry into role-based access admin. */
export function PageAccessModal({ open, onClose, pageSlug }: PageAccessModalProps) {
  const page = PAGE_DEFS.find(candidate => candidate.slug === pageSlug);
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{page?.label ?? 'Page'} access</DialogTitle>
          <DialogDescription>
            Page access is controlled by role baselines. Open Roles to edit defaults.
          </DialogDescription>
        </DialogHeader>
        <Button asChild>
          <Link to={accessWorkspaceUrl({ pageSlug })} onClick={onClose}>Open Roles</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
