/**
 * ProjectChatDrawer — slide-in right-side Sheet that embeds <ChatWindow>
 * for a project's group chat room without navigating away.
 *
 * Usage:
 *   <ProjectChatDrawer
 *     open={isOpen}
 *     onClose={closeDrawer}
 *     projectName={project.name}
 *   />
 */
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import ChatWindow from '@/components/chat/ChatWindow';

interface ProjectChatDrawerProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
}

export const ProjectChatDrawer: React.FC<ProjectChatDrawerProps> = ({
  open,
  onClose,
  projectName,
}) => (
  <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <SheetContent
      side="right"
      className="w-full sm:max-w-lg p-0 flex flex-col"
    >
      <SheetHeader className="px-4 py-3 border-b border-border/60 shrink-0">
        <SheetTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" />
          {projectName} — Team Chat
        </SheetTitle>
        <SheetDescription className="sr-only">
          Inline chat panel for project {projectName}
        </SheetDescription>
      </SheetHeader>
      {/* ChatWindow reads activeChat from global ChatContext set by useProjectChatDrawer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatWindow hideHeader />
      </div>
    </SheetContent>
  </Sheet>
);
