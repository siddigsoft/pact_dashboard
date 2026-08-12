/**
 * InlineAccessManager
 * Renders UnifiedAccessManager as a full-page panel (not inside a dialog).
 * Used by SuperAdminHub's "User Access" tab so the manager fills the hub
 * content area without the dialog chrome or fixed-height dialog maths.
 */
import { UnifiedAccessManager } from '@/components/role-management/UnifiedAccessManager';

export default function InlineAccessManager() {
  return (
    <div className="p-4 h-full">
      <UnifiedAccessManager containerClassName="flex h-[calc(100vh-200px)] min-h-[560px] border rounded-xl overflow-hidden bg-background" />
    </div>
  );
}
