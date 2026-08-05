/**
 * useProjectChat — find or create a project-scoped group chat room.
 *
 * On first call for a project it:
 *   1. Checks whether a `chats` row with
 *      `related_entity_type='project'` and `related_entity_id=projectId` already exists.
 *   2. Creates one if missing (group type, name = "<project name> Team").
 *   3. Syncs participants so every current team member is in the room.
 *   4. Returns the chat ID and navigates the user to the Communication Hub
 *      with that chat pre-selected.
 *
 * Subsequent calls reuse the same room and only add newly-joined members.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { ChatService } from '@/services/ChatService';
import type { Project } from '@/types/project';

/** Gather all unique member user-IDs from a project's team field. */
function getTeamMemberIds(project: Project): string[] {
  const ids = new Set<string>();
  if (project.team?.projectManager) ids.add(project.team.projectManager);
  (project.team?.teamComposition ?? []).forEach(m => {
    if (m.userId) ids.add(m.userId);
  });
  return Array.from(ids);
}

export function useProjectChat() {
  const { chats, setActiveChat } = useChat();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  /**
   * Open (or create) the project chat room and navigate to the Chat page.
   * @param project   Full project object (needs `.id`, `.name`, `.team`)
   * @param currentUserId  The logged-in user's ID so they are always included
   */
  const openProjectChat = useCallback(async (
    project: Project,
    currentUserId: string,
  ) => {
    if (busy) return;
    setBusy(true);

    try {
      const memberIds = getTeamMemberIds(project);
      // Always include the current user even if they're not in the team object yet
      if (currentUserId && !memberIds.includes(currentUserId)) {
        memberIds.push(currentUserId);
      }

      /* ── 1. Check local state first (already loaded chats) ── */
      let chatId: string | null = null;

      const localChat = chats.find(
        c => c.relatedEntityType === 'project' && c.relatedEntityId === project.id,
      );

      if (localChat) {
        chatId = localChat.id;
      } else {
        /* ── 2. Query DB for existing project chat ── */
        const dbChat = await ChatService.getProjectChat(project.id);
        if (dbChat) {
          chatId = dbChat.id;
        }
      }

      if (chatId) {
        /* ── 3. Sync participants (idempotent addParticipant ignores duplicates) ── */
        const existing = await ChatService.getChatParticipants(chatId);
        const existingIds = (existing ?? []).map(p => p.user_id);
        const toAdd = memberIds.filter(id => !existingIds.includes(id));
        await Promise.all(toAdd.map(uid => ChatService.addParticipant(chatId!, uid).catch(() => {})));
      } else {
        /* ── 4. Create a brand-new project group chat ── */
        const newDbChat = await ChatService.createChat({
          name: `${project.name} Team`,
          type: 'group',
          is_group: true,
          created_by: currentUserId,
          related_entity_id: project.id,
          related_entity_type: 'project',
        });

        if (!newDbChat) throw new Error('Failed to create project chat');
        chatId = newDbChat.id;

        // Add all team members as participants
        await Promise.all(
          memberIds.map(uid => ChatService.addParticipant(chatId!, uid).catch(() => {})),
        );
      }

      /* ── 5. Navigate to Communication Hub with chat pre-selected ── */
      navigate(`/communication-hub?tab=chat&chatId=${chatId}`);
    } catch (err) {
      console.error('[useProjectChat] Error opening project chat:', err);
    } finally {
      setBusy(false);
    }
  }, [busy, chats, navigate]);

  return { openProjectChat, busy };
}
