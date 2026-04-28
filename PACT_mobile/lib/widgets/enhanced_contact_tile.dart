import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

/// Enhanced contact card with online status, quick call buttons, favorites, and last call info
class EnhancedContactTile extends StatefulWidget {
  final String id;
  final String name;
  final String email;
  final String? avatarUrl;
  final String role;
  final bool isOnline;
  final String initials;
  final VoidCallback onAudioCall;
  final VoidCallback onVideoCall;
  final bool isArabic;
  final DateTime? lastCallTime;
  final String? lastCallType; // 'incoming', 'outgoing', 'missed'
  final bool isFavorite;
  final VoidCallback onToggleFavorite;

  const EnhancedContactTile({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
    required this.role,
    required this.isOnline,
    required this.initials,
    required this.onAudioCall,
    required this.onVideoCall,
    required this.isArabic,
    this.lastCallTime,
    this.lastCallType,
    required this.isFavorite,
    required this.onToggleFavorite,
  });

  @override
  State<EnhancedContactTile> createState() => _EnhancedContactTileState();
}

class _EnhancedContactTileState extends State<EnhancedContactTile> {
  String _getLastCallLabel() {
    if (widget.lastCallTime == null) return '';

    final now = DateTime.now();
    final difference = now.difference(widget.lastCallTime!);

    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inHours < 1) return '${difference.inMinutes}m ago';
    if (difference.inDays < 1) return '${difference.inHours}h ago';
    if (difference.inDays == 1) return 'Yesterday';
    if (difference.inDays < 7) return '${difference.inDays}d ago';

    return DateFormat('MMM d').format(widget.lastCallTime!);
  }

  Color _getLastCallColor() {
    switch (widget.lastCallType) {
      case 'incoming':
        return Colors.green;
      case 'outgoing':
        return AppColors.primaryBlue;
      case 'missed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  IconData _getLastCallIcon() {
    switch (widget.lastCallType) {
      case 'incoming':
        return Icons.call_received;
      case 'outgoing':
        return Icons.call_made;
      case 'missed':
        return Icons.call_missed;
      default:
        return Icons.call;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          ListTile(
            leading: Stack(
              children: [
                // Avatar
                CircleAvatar(
                  radius: 24,
                  backgroundImage: widget.avatarUrl != null
                      ? NetworkImage(widget.avatarUrl!)
                      : null,
                  backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                  child: widget.avatarUrl == null
                      ? Text(
                          widget.initials,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppColors.primaryBlue,
                          ),
                        )
                      : null,
                ),
                // Online status badge
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: widget.isOnline ? Colors.green : Colors.grey,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
              ],
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                ),
                // Favorite button
                GestureDetector(
                  onTap: widget.onToggleFavorite,
                  child: Icon(
                    widget.isFavorite ? Icons.star : Icons.star_border,
                    color: widget.isFavorite ? Colors.amber : Colors.grey,
                    size: 20,
                  ),
                ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.email,
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                // Online status and role
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: widget.isOnline
                            ? Colors.green.withOpacity(0.1)
                            : Colors.grey.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        widget.isOnline ? 'Online' : 'Offline',
                        style: TextStyle(
                          fontSize: 11,
                          color: widget.isOnline ? Colors.green : Colors.grey,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      widget.role,
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ),
            isThreeLine: true,
            trailing: null,
          ),
          // Last call info and quick call buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Last call info
                if (widget.lastCallTime != null)
                  Expanded(
                    child: Row(
                      children: [
                        Icon(
                          _getLastCallIcon(),
                          size: 16,
                          color: _getLastCallColor(),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _getLastCallLabel(),
                          style: TextStyle(
                            fontSize: 12,
                            color: _getLastCallColor(),
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  const Expanded(
                    child: Text(
                      'No call history',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ),
                const SizedBox(width: 8),
                // Quick call buttons
                ElevatedButton.icon(
                  onPressed: widget.onAudioCall,
                  icon: const Icon(Icons.phone, size: 16),
                  label: const Text('Audio'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed: widget.onVideoCall,
                  icon: const Icon(Icons.videocam, size: 16),
                  label: const Text('Video'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    visualDensity: VisualDensity.compact,
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
