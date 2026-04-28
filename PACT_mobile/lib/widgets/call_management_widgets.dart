import 'package:flutter/material.dart';
import '../models/chat_participant.dart';

/// Represents a participant in an active call
class CallParticipant {
  final String id;
  final String name;
  final String? avatarUrl;
  bool isAudioMuted;
  bool isVideoMuted;
  bool isScreenSharing;
  DateTime joinedAt;

  CallParticipant({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.isAudioMuted = false,
    this.isVideoMuted = false,
    this.isScreenSharing = false,
    required this.joinedAt,
  });

  /// Get display name with mute indicator
  String getDisplayName() {
    String indicator = '';
    if (isAudioMuted) indicator += '🔇 ';
    if (isScreenSharing) indicator += '📺 ';
    return indicator + name;
  }
}

/// Bottom sheet for managing call participants
class CallParticipantsPanel extends StatefulWidget {
  final List<CallParticipant> participants;
  final Function(String participantId) onRemoveParticipant;
  final Function() onAddParticipant;
  final Function(String participantId, bool muted) onToggleAudioMute;
  final String currentUserId;

  const CallParticipantsPanel({
    super.key,
    required this.participants,
    required this.onRemoveParticipant,
    required this.onAddParticipant,
    required this.onToggleAudioMute,
    required this.currentUserId,
  });

  @override
  State<CallParticipantsPanel> createState() => _CallParticipantsPanelState();
}

class _CallParticipantsPanelState extends State<CallParticipantsPanel> {
  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Participants (${widget.participants.length})',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // Participants list
          Flexible(
            child: ListView.builder(
              itemCount: widget.participants.length + 1,
              itemBuilder: (context, index) {
                if (index == widget.participants.length) {
                  // Add participant button at the end
                  return Padding(
                    padding: const EdgeInsets.all(8),
                    child: ElevatedButton.icon(
                      onPressed: widget.onAddParticipant,
                      icon: const Icon(Icons.person_add),
                      label: const Text('Add Participant'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  );
                }

                final participant = widget.participants[index];
                final isCurrentUser = participant.id == widget.currentUserId;

                return _buildParticipantTile(participant, isCurrentUser);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildParticipantTile(
    CallParticipant participant,
    bool isCurrentUser,
  ) {
    return ListTile(
      leading: Stack(
        children: [
          CircleAvatar(
            backgroundImage: participant.avatarUrl != null
                ? NetworkImage(participant.avatarUrl!)
                : null,
            backgroundColor: Colors.blue.withOpacity(0.3),
            child: participant.avatarUrl == null
                ? Text(participant.name.split(' ')[0][0].toUpperCase())
                : null,
          ),
          if (participant.isAudioMuted)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1),
                ),
                child: const Icon(Icons.mic_off, color: Colors.white, size: 12),
              ),
            ),
        ],
      ),
      title: Text(
        participant.getDisplayName(),
        style: TextStyle(
          fontWeight: isCurrentUser ? FontWeight.w600 : FontWeight.normal,
        ),
      ),
      subtitle: Text(
        isCurrentUser ? '(You)' : _getParticipantStatus(participant),
        style: const TextStyle(fontSize: 12),
      ),
      trailing: isCurrentUser
          ? Chip(
              label: const Text('You', style: TextStyle(fontSize: 11)),
              avatar: const Icon(Icons.check, size: 14),
            )
          : PopupMenuButton(
              itemBuilder: (context) => [
                if (participant.isAudioMuted)
                  PopupMenuItem(
                    onTap: () =>
                        widget.onToggleAudioMute(participant.id, false),
                    child: const Row(
                      children: [
                        Icon(Icons.mic, size: 18),
                        SizedBox(width: 8),
                        Text('Unmute'),
                      ],
                    ),
                  ),
                if (!participant.isAudioMuted)
                  PopupMenuItem(
                    onTap: () => widget.onToggleAudioMute(participant.id, true),
                    child: const Row(
                      children: [
                        Icon(Icons.mic_off, size: 18),
                        SizedBox(width: 8),
                        Text('Mute'),
                      ],
                    ),
                  ),
                PopupMenuItem(
                  onTap: () => widget.onRemoveParticipant(participant.id),
                  child: const Row(
                    children: [
                      Icon(Icons.person_remove, size: 18, color: Colors.red),
                      SizedBox(width: 8),
                      Text('Remove', style: TextStyle(color: Colors.red)),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  String _getParticipantStatus(CallParticipant participant) {
    final duration = DateTime.now().difference(participant.joinedAt);
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;

    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}

/// Widget for displaying participants in grid layout during call
class CallParticipantsGrid extends StatelessWidget {
  final List<CallParticipant> participants;
  final String currentUserId;
  final bool isVideoEnabled;

  const CallParticipantsGrid({
    super.key,
    required this.participants,
    required this.currentUserId,
    required this.isVideoEnabled,
  });

  @override
  Widget build(BuildContext context) {
    if (participants.isEmpty) {
      return _buildEmptyState();
    }

    if (participants.length == 1) {
      return _buildSingleParticipantView(participants[0]);
    }

    if (participants.length == 2) {
      return _buildTwoParticipantView();
    }

    return _buildGridView();
  }

  Widget _buildEmptyState() {
    return Container(
      color: Colors.black87,
      child: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.videocam_off, color: Colors.white, size: 64),
            SizedBox(height: 16),
            Text(
              'Waiting for participants...',
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSingleParticipantView(CallParticipant participant) {
    return Container(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 60,
              backgroundImage: participant.avatarUrl != null
                  ? NetworkImage(participant.avatarUrl!)
                  : null,
              backgroundColor: Colors.blue.withOpacity(0.3),
              child: participant.avatarUrl == null
                  ? Text(
                      participant.name.split(' ')[0][0].toUpperCase(),
                      style: const TextStyle(fontSize: 36, color: Colors.white),
                    )
                  : null,
            ),
            const SizedBox(height: 16),
            Text(
              participant.name,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (participant.isAudioMuted)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Chip(
                  label: Text('Muted'),
                  avatar: Icon(Icons.mic_off, size: 14),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTwoParticipantView() {
    return Row(
      children: participants
          .map((p) => Expanded(child: _buildParticipantCard(p)))
          .toList(),
    );
  }

  Widget _buildGridView() {
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
      ),
      itemCount: participants.length,
      itemBuilder: (context, index) =>
          _buildParticipantCard(participants[index]),
    );
  }

  Widget _buildParticipantCard(CallParticipant participant) {
    return Container(
      color: Colors.black,
      child: Stack(
        children: [
          // Video frame or avatar
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundImage: participant.avatarUrl != null
                      ? NetworkImage(participant.avatarUrl!)
                      : null,
                  backgroundColor: Colors.blue.withOpacity(0.2),
                  child: participant.avatarUrl == null
                      ? Text(
                          participant.name.split(' ')[0][0].toUpperCase(),
                          style: const TextStyle(fontSize: 24),
                        )
                      : null,
                ),
                const SizedBox(height: 8),
                Text(
                  participant.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          // Indicators (muted, screen share, etc)
          Positioned(
            top: 8,
            right: 8,
            child: Row(
              children: [
                if (participant.isAudioMuted)
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.7),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.mic_off,
                      color: Colors.white,
                      size: 14,
                    ),
                  ),
                if (participant.isScreenSharing)
                  Container(
                    margin: const EdgeInsets.only(left: 4),
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.7),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.monitor,
                      color: Colors.white,
                      size: 14,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Dialog for adding participants to call
class AddParticipantDialog extends StatefulWidget {
  final List<String> availableUsers;
  final String currentUserId;
  final Function(String userId) onUserSelected;

  const AddParticipantDialog({
    super.key,
    required this.availableUsers,
    required this.currentUserId,
    required this.onUserSelected,
  });

  @override
  State<AddParticipantDialog> createState() => _AddParticipantDialogState();
}

class _AddParticipantDialogState extends State<AddParticipantDialog> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.availableUsers
        .where(
          (userId) =>
              userId.toLowerCase().contains(_searchQuery.toLowerCase()) &&
              userId != widget.currentUserId,
        )
        .toList();

    return AlertDialog(
      title: const Text('Add Participant'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              decoration: InputDecoration(
                hintText: 'Search contacts...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onChanged: (value) => setState(() => _searchQuery = value),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView.builder(
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final userId = filtered[index];
                  return ListTile(
                    title: Text(userId),
                    trailing: const Icon(Icons.add),
                    onTap: () {
                      widget.onUserSelected(userId);
                      Navigator.pop(context);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}
