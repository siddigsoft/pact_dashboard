/**
 * useProjectChat — find or create a project-scoped group chat room.
 *
 * On first call for a project it:
 *   1. Checks whether a `chats` row with pair_key='project:<projectId>' already exists.
 *   2. Creates one if missing (group type, related_entity_type='project').
 *   3. Syncs participants so every current team member is in the room.
 *   4. Navigates to the Communication Hub with that chat pre-selected.
 *
 * Duplicate-safety: the deterministic pair_key means even if two users click
 * "Message Team" simultaneously, `ChatService.createChat` will catch the unique
 * violation and return the already-created room instead of creating a second one.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ChatService } from '@/services/ChatService';
import { useChat } from '@/context/chat/ChatContextSupabase';
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

/** Deterministic pair_key used to identify a project's group chat room. */
function projectChatKey(projectId: string) {
  return `project:${projectId}`;
}

/**
 * Silently provisions a project group chat room immediately after project
 * creation — no navigation, no UI side-effects, safe to fire-and-forget.
 *
 * Idempotent: if the room already exists (pair_key match) it just syncs
 * any participants that are missing and returns.
 */
export async function provisionProjectChat(
  project: Project,
  creatorUserId: string,
): Promise<void> {
  const memberIds = getTeamMemberIds(project);
  if (creatorUserId && !memberIds.includes(creatorUserId)) {
    memberIds.push(creatorUserId);
  }
  if (memberIds.length === 0) return;

  const pairKey = projectChatKey(project.id);

  // ── 1. Find or create the room ──
  let chatId: string | null = null;
  const existing = await ChatService.getProjectChat(project.id);
  if (existing) {
    chatId = existing.id;
  } else {
    const newChat = await ChatService.createChat({
      name: `${project.name} Team`,
      type: 'group',
      is_group: true,
      created_by: creatorUserId,
      related_entity_id: project.id,
      related_entity_type: 'project',
      pair_key: pairKey,
    });
    if (!newChat) throw new Error('Failed to create project chat room');
    chatId = newChat.id;
  }

  // ── 2. Add any participants not yet in the room ──
  const existingParticipants = await ChatService.getChatParticipants(chatId);
  const existingIds = new Set((existingParticipants ?? []).map(p => p.user_id));
  const toAdd = memberIds.filter(id => !existingIds.has(id));

  await Promise.allSettled(
    toAdd.map(uid => ChatService.addParticipant(chatId!, uid)),
  );
}

/**
 * Diffs the project chat room's current participant list against a new team
 * composition and adds / removes participants accordingly.
 *
 * Safe to fire-and-forget: if no chat room exists yet (project was created
 * before auto-provisioning), or the room is unreachable, this is a silent no-op.
 *
 * @param projectId  The project whose chat room to sync
 * @param addedIds   User IDs newly added to the team
 * @param removedIds User IDs removed from the team
 */
export async function syncProjectChatParticipants(
  projectId: string,
  addedIds: string[],
  removedIds: string[],
): Promise<void> {
  if (addedIds.length === 0 && removedIds.length === 0) return;

  const chat = await ChatService.getProjectChat(projectId);
  if (!chat) return; // No room provisioned yet — nothing to sync

  await Promise.allSettled([
    ...addedIds.map(uid => ChatService.addParticipant(chat.id, uid)),
    ...removedIds.map(uid => ChatService.removeParticipant(chat.id, uid)),
  ]);
}

/**
 * Manages the open/close state for an inline project chat drawer.
 *
 * On open:
 *   1. Finds or provisions the project chat room.
 *   2. Fetches its participant list.
 *   3. Sets `activeChat` in the global chat context so `<ChatWindow>` renders it.
 *   4. Opens the drawer.
 *
 * On close: clears `activeChat` and closes the drawer.
 */
export function useProjectChatDrawer(project: Project, currentUserId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { setActiveChat } = useChat();
  const { toast } = useToast();

  const openDrawer = useCallback(async () => {
    if (loading || !currentUserId) return;
    setLoading(true);
    try {
      // ── 1. Find or provision the chat room ──
      let dbChat = await ChatService.getProjectChat(project.id);
      if (!dbChat) {
        await provisionProjectChat(project, currentUserId);
        dbChat = await ChatService.getProjectChat(project.id);
      }
      if (!dbChat) throw new Error('Could not create project chat room');

      // ── 2. Ensure the current user is a participant (mirror openProjectChat initiator-first logic) ──
      try {
        await ChatService.addParticipant(dbChat.id, currentUserId);
      } catch (err: any) {
        // Duplicate-key means already a member — safe to continue
        const isDuplicate =
          err?.message?.includes('duplicate') || err?.message?.includes('already exists');
        if (!isDuplicate) {
          throw new Error(`Could not join the project chat: ${err?.message ?? 'Unknown error'}`);
        }
      }

      // ── 3. Fetch the updated participant list ──
      const participants = await ChatService.getChatParticipants(dbChat.id);
      const participantIds = (participants ?? []).map(p => p.user_id);

      // ── 4. Build a Chat object and set it as active ──
      const chatObj = {
        id: dbChat.id,
        name: dbChat.name || `${project.name} Team`,
        type: dbChat.type,
        isGroup: dbChat.is_group,
        createdBy: dbChat.created_by,
        stateId: dbChat.state_id,
        relatedEntityId: dbChat.related_entity_id,
        relatedEntityType: dbChat.related_entity_type,
        createdAt: dbChat.created_at,
        updatedAt: dbChat.updated_at,
        participants: participantIds,
        status: 'active' as const,
      };
      setActiveChat(chatObj);

      // ── 5. Open the drawer ──
      setIsOpen(true);
    } catch (err: any) {
      console.error('[useProjectChatDrawer] Failed to open chat drawer:', err?.message);
      toast({
        title: 'Could not open project chat',
        description: err?.message ?? 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [project, currentUserId, loading, setActiveChat, toast]);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setActiveChat(null);
  }, [setActiveChat]);

  return { isOpen, openDrawer, closeDrawer, loading };
}

export function useProjectChat() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  /**
   * Open (or create) the project chat room and navigate to the Chat page.
   * @param project        Full project object (needs `.id`, `.name`, `.team`)
   * @param currentUserId  The logged-in user's ID — always added to the room
   */
  const openProjectChat = useCallback(async (
    project: Project,
    currentUserId: string,
  ) => {
    if (busy) return;
    setBusy(true);

    try {
      const memberIds = getTeamMemberIds(project);
      // Always include the initiating user even if not in the team object yet
      if (currentUserId && !memberIds.includes(currentUserId)) {
        memberIds.push(currentUserId);
      }

      const pairKey = projectChatKey(project.id);

      /* ── 1. Find existing room by deterministic pair_key ── */
      let chatId: string | null = null;
      const existing = await ChatService.getProjectChat(project.id);
      if (existing) {
        chatId = existing.id;
      }

      if (!chatId) {
        /* ── 2. Create a new project group chat ── */
        const newDbChat = await ChatService.createChat({
          name: `${project.name} Team`,
          type: 'group',
          is_group: true,
          created_by: currentUserId,
          related_entity_id: project.id,
          related_entity_type: 'project',
          pair_key: pairKey,
        });

        if (!newDbChat) throw new Error('Failed to create project chat room');
        chatId = newDbChat.id;
      }

      /* ── 3. Sync participants ── */
      const existingParticipants = await ChatService.getChatParticipants(chatId);
      const existingIds = new Set((existingParticipants ?? []).map(p => p.user_id));
      const toAdd = memberIds.filter(id => !existingIds.has(id));

      // Ensure the initiator is in the room first — this is critical, surface any failure
      if (toAdd.includes(currentUserId)) {
        try {
          await ChatService.addParticipant(chatId, currentUserId);
        } catch (err: any) {
          // If it's not a duplicate-key error, surface it to the user
          const isDuplicate = err?.message?.includes('duplicate') || err?.message?.includes('already exists');
          if (!isDuplicate) {
            throw new Error(`Could not add you to the project chat: ${err?.message ?? 'Unknown error'}`);
          }
        }
      }

      // Add remaining members — log failures but don't block navigation
      const otherToAdd = toAdd.filter(id => id !== currentUserId);
      const results = await Promise.allSettled(
        otherToAdd.map(uid => ChatService.addParticipant(chatId!, uid)),
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const uid = otherToAdd[i];
          const isDuplicate = result.reason?.message?.includes('duplicate') ||
            result.reason?.message?.includes('already exists');
          if (!isDuplicate) {
            console.warn(`[useProjectChat] Could not add member ${uid} to chat ${chatId}:`, result.reason);
          }
        }
      });

      /* ── 4. Navigate to Communication Hub with chat pre-selected ── */
      navigate(`/communication-hub?tab=chat&chatId=${chatId}`);
    } catch (err: any) {
      console.error('[useProjectChat] Error:', err);
      toast({
        title: 'Could not open project chat',
        description: err?.message ?? 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }, [busy, navigate, toast]);

  return { openProjectChat, busy };
}
