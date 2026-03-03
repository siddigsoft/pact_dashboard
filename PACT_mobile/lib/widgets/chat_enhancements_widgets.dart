import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/message_reaction.dart';
import '../models/link_preview.dart';
import '../models/typing_indicator.dart';
import '../theme/app_colors.dart';

class ReactionPicker extends StatelessWidget {
  final Function(String emoji) onReactionSelected;

  const ReactionPicker({super.key, required this.onReactionSelected});

  static const List<String> defaultReactions = [
    '👍',
    '❤️',
    '😂',
    '😮',
    '😢',
    '🙏',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: defaultReactions.map((emoji) {
          return InkWell(
            onTap: () {
              HapticFeedback.lightImpact();
              onReactionSelected(emoji);
            },
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Text(emoji, style: const TextStyle(fontSize: 24)),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class MessageReactionsDisplay extends StatelessWidget {
  final List<ReactionSummary> reactions;
  final Function(String emoji)? onReactionTap;

  const MessageReactionsDisplay({
    super.key,
    required this.reactions,
    this.onReactionTap,
  });

  @override
  Widget build(BuildContext context) {
    if (reactions.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: reactions.map((reaction) {
        return GestureDetector(
          onTap: onReactionTap != null
              ? () => onReactionTap!(reaction.emoji)
              : null,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: reaction.currentUserReacted
                  ? AppColors.primaryBlue.withOpacity(0.2)
                  : Colors.grey.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: reaction.currentUserReacted
                  ? Border.all(color: AppColors.primaryBlue, width: 1)
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(reaction.emoji, style: const TextStyle(fontSize: 14)),
                if (reaction.count > 1) ...[
                  const SizedBox(width: 2),
                  Text(
                    '${reaction.count}',
                    style: TextStyle(
                      fontSize: 11,
                      color: reaction.currentUserReacted
                          ? AppColors.primaryBlue
                          : Colors.grey[600],
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class ReplyPreview extends StatelessWidget {
  final String replyToContent;
  final String replyToSenderName;
  final VoidCallback? onCancelReply;
  final bool isCompact;

  const ReplyPreview({
    super.key,
    required this.replyToContent,
    required this.replyToSenderName,
    this.onCancelReply,
    this.isCompact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(isCompact ? 8 : 12),
      decoration: BoxDecoration(
        color: Colors.grey.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border(
          left: BorderSide(color: AppColors.primaryBlue, width: 3),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  replyToSenderName,
                  style: TextStyle(
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryBlue,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  replyToContent,
                  maxLines: isCompact ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: isCompact ? 12 : 13,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
          if (onCancelReply != null) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onCancelReply,
              child: Icon(Icons.close, size: 18, color: Colors.grey[500]),
            ),
          ],
        ],
      ),
    );
  }
}

class TypingIndicatorWidget extends StatefulWidget {
  final List<TypingIndicator> typingUsers;
  final String locale;

  const TypingIndicatorWidget({
    super.key,
    required this.typingUsers,
    this.locale = 'en',
  });

  @override
  State<TypingIndicatorWidget> createState() => _TypingIndicatorWidgetState();
}

class _TypingIndicatorWidgetState extends State<TypingIndicatorWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeTypers = widget.typingUsers
        .where((t) => t.isStillTyping)
        .toList();
    if (activeTypers.isEmpty) return const SizedBox.shrink();

    final isArabic = widget.locale == 'ar';
    String text;

    if (activeTypers.length == 1) {
      text = isArabic
          ? '${activeTypers.first.userName} يكتب...'
          : '${activeTypers.first.userName} is typing...';
    } else if (activeTypers.length == 2) {
      text = isArabic
          ? '${activeTypers[0].userName} و ${activeTypers[1].userName} يكتبان...'
          : '${activeTypers[0].userName} and ${activeTypers[1].userName} are typing...';
    } else {
      text = isArabic ? 'عدة أشخاص يكتبون...' : 'Several people are typing...';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          _buildDots(),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDots() {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final delay = index * 0.2;
            final value = (_controller.value + delay) % 1.0;
            final opacity = (value < 0.5) ? value * 2 : (1 - value) * 2;

            return Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.3 + opacity * 0.7),
                shape: BoxShape.circle,
              ),
            );
          }),
        );
      },
    );
  }
}

class LinkPreviewCard extends StatelessWidget {
  final LinkPreview preview;
  final VoidCallback? onTap;

  const LinkPreviewCard({super.key, required this.preview, this.onTap});

  @override
  Widget build(BuildContext context) {
    if (!preview.hasContent) return const SizedBox.shrink();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(
          color: Colors.grey.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.withOpacity(0.2)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (preview.imageUrl != null)
              Image.network(
                preview.imageUrl!,
                height: 150,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (preview.siteName != null)
                    Text(
                      preview.siteName!.toUpperCase(),
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey[600],
                        letterSpacing: 0.5,
                      ),
                    ),
                  if (preview.title != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      preview.title!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  if (preview.description != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      preview.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class VoiceMessagePlayer extends StatefulWidget {
  final String audioUrl;
  final Duration duration;
  final bool isOwnMessage;

  const VoiceMessagePlayer({
    super.key,
    required this.audioUrl,
    required this.duration,
    this.isOwnMessage = false,
  });

  @override
  State<VoiceMessagePlayer> createState() => _VoiceMessagePlayerState();
}

class _VoiceMessagePlayerState extends State<VoiceMessagePlayer> {
  bool _isPlaying = false;
  double _progress = 0;

  @override
  Widget build(BuildContext context) {
    final color = widget.isOwnMessage ? Colors.white : AppColors.primaryBlue;
    final bgColor = widget.isOwnMessage
        ? Colors.white.withOpacity(0.2)
        : AppColors.primaryBlue.withOpacity(0.1);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: () => setState(() => _isPlaying = !_isPlaying),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle),
              child: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: color,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SliderTheme(
                  data: SliderThemeData(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(
                      enabledThumbRadius: 5,
                    ),
                    overlayShape: const RoundSliderOverlayShape(
                      overlayRadius: 12,
                    ),
                    activeTrackColor: color,
                    inactiveTrackColor: color.withOpacity(0.3),
                    thumbColor: color,
                  ),
                  child: Slider(
                    value: _progress,
                    onChanged: (value) => setState(() => _progress = value),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    _formatDuration(widget.duration),
                    style: TextStyle(
                      fontSize: 11,
                      color: color.withOpacity(0.7),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}

class ForwardedMessageBadge extends StatelessWidget {
  final String locale;

  const ForwardedMessageBadge({super.key, this.locale = 'en'});

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.reply, size: 12, color: Colors.grey[500]),
          const SizedBox(width: 4),
          Text(
            isArabic ? 'تم إعادة توجيهها' : 'Forwarded',
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey[500],
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}

class EditedMessageBadge extends StatelessWidget {
  final String locale;

  const EditedMessageBadge({super.key, this.locale = 'en'});

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    return Text(
      isArabic ? '(تم التعديل)' : '(edited)',
      style: TextStyle(
        fontSize: 10,
        color: Colors.grey[500],
        fontStyle: FontStyle.italic,
      ),
    );
  }
}

class MessageContextMenu extends StatelessWidget {
  final bool isOwnMessage;
  final VoidCallback? onReply;
  final VoidCallback? onForward;
  final VoidCallback? onCopy;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onReact;
  final String locale;

  const MessageContextMenu({
    super.key,
    this.isOwnMessage = false,
    this.onReply,
    this.onForward,
    this.onCopy,
    this.onEdit,
    this.onDelete,
    this.onReact,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onReact != null)
            _buildMenuItem(
              icon: Icons.emoji_emotions_outlined,
              label: isArabic ? 'إضافة رد فعل' : 'Add reaction',
              onTap: onReact!,
            ),
          if (onReply != null)
            _buildMenuItem(
              icon: Icons.reply,
              label: isArabic ? 'رد' : 'Reply',
              onTap: onReply!,
            ),
          if (onForward != null)
            _buildMenuItem(
              icon: Icons.forward,
              label: isArabic ? 'إعادة توجيه' : 'Forward',
              onTap: onForward!,
            ),
          if (onCopy != null)
            _buildMenuItem(
              icon: Icons.copy,
              label: isArabic ? 'نسخ' : 'Copy',
              onTap: onCopy!,
            ),
          if (isOwnMessage && onEdit != null)
            _buildMenuItem(
              icon: Icons.edit,
              label: isArabic ? 'تعديل' : 'Edit',
              onTap: onEdit!,
            ),
          if (isOwnMessage && onDelete != null)
            _buildMenuItem(
              icon: Icons.delete_outline,
              label: isArabic ? 'حذف' : 'Delete',
              onTap: onDelete!,
              isDestructive: true,
            ),
        ],
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isDestructive = false,
  }) {
    final color = isDestructive ? Colors.red : Colors.black87;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(width: 12),
            Text(label, style: TextStyle(fontSize: 14, color: color)),
          ],
        ),
      ),
    );
  }
}

class ReadReceiptIndicator extends StatelessWidget {
  final String status; // 'sent', 'delivered', 'read'
  final DateTime? readAt;

  const ReadReceiptIndicator({super.key, required this.status, this.readAt});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;

    switch (status) {
      case 'read':
        icon = Icons.done_all;
        color = AppColors.primaryBlue;
        break;
      case 'delivered':
        icon = Icons.done_all;
        color = Colors.grey;
        break;
      default:
        icon = Icons.done;
        color = Colors.grey;
    }

    return Icon(icon, size: 14, color: color);
  }
}
