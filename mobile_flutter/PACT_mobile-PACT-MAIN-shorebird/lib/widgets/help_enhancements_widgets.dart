import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../services/help_enhancements_service.dart';

class SupportTicketCard extends StatelessWidget {
  final SupportTicket ticket;
  final VoidCallback? onTap;
  final String locale;

  const SupportTicketCard({
    super.key,
    required this.ticket,
    this.onTap,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    ticket.subject,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _buildStatusBadge(ticket.status, isArabic),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              ticket.description,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  Icons.category_outlined,
                  size: 14,
                  color: Colors.grey.shade500,
                ),
                const SizedBox(width: 4),
                Text(
                  _getCategoryLabel(ticket.category, isArabic),
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(width: 16),
                Icon(Icons.schedule, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  _formatDate(ticket.createdAt),
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                if (ticket.messages.isNotEmpty) ...[
                  const Spacer(),
                  Icon(
                    Icons.message_outlined,
                    size: 14,
                    color: Colors.grey.shade500,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${ticket.messages.length}',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status, bool isArabic) {
    Color color;
    String label;

    switch (status) {
      case 'open':
        color = Colors.blue;
        label = isArabic ? 'مفتوح' : 'Open';
        break;
      case 'in_progress':
        color = Colors.orange;
        label = isArabic ? 'قيد المعالجة' : 'In Progress';
        break;
      case 'resolved':
        color = Colors.green;
        label = isArabic ? 'تم الحل' : 'Resolved';
        break;
      case 'closed':
        color = Colors.grey;
        label = isArabic ? 'مغلق' : 'Closed';
        break;
      default:
        color = Colors.grey;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _getCategoryLabel(String category, bool isArabic) {
    final labels = {
      'general': isArabic ? 'عام' : 'General',
      'technical': isArabic ? 'تقني' : 'Technical',
      'account': isArabic ? 'الحساب' : 'Account',
      'billing': isArabic ? 'الفوترة' : 'Billing',
      'feature': isArabic ? 'ميزة جديدة' : 'Feature Request',
    };
    return labels[category] ?? category;
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays > 0) {
      return '${diff.inDays}d ago';
    } else if (diff.inHours > 0) {
      return '${diff.inHours}h ago';
    } else if (diff.inMinutes > 0) {
      return '${diff.inMinutes}m ago';
    }
    return 'Just now';
  }
}

class TicketMessageBubble extends StatelessWidget {
  final TicketMessage message;
  final bool isCurrentUser;
  final String locale;

  const TicketMessageBubble({
    super.key,
    required this.message,
    required this.isCurrentUser,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isCurrentUser
              ? AppColors.primaryBlue
              : (message.isStaffReply
                    ? Colors.green.shade50
                    : Colors.grey.shade100),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isCurrentUser ? 16 : 4),
            bottomRight: Radius.circular(isCurrentUser ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.isStaffReply) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.support_agent,
                    size: 14,
                    color: Colors.green.shade700,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    message.senderName,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.green.shade700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],
            Text(
              message.content,
              style: TextStyle(
                fontSize: 14,
                color: isCurrentUser ? Colors.white : Colors.black87,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _formatTime(message.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: isCurrentUser
                    ? Colors.white.withOpacity(0.7)
                    : Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime date) {
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}

class HelpArticleCard extends StatelessWidget {
  final HelpArticle article;
  final VoidCallback? onTap;
  final String locale;

  const HelpArticleCard({
    super.key,
    required this.article,
    this.onTap,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.article_outlined,
                color: AppColors.primaryBlue,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.getTitle(locale),
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (article.tags.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 4,
                      children: article.tags.take(3).map((tag) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            tag,
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }
}

class ContextualHelpTooltip extends StatelessWidget {
  final ContextualHelpTip tip;
  final VoidCallback onDismiss;
  final VoidCallback? onNext;
  final int currentStep;
  final int totalSteps;
  final String locale;

  const ContextualHelpTooltip({
    super.key,
    required this.tip,
    required this.onDismiss,
    this.onNext,
    this.currentStep = 1,
    this.totalSteps = 1,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tip.getTitle(locale),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              GestureDetector(
                onTap: onDismiss,
                child: const Icon(Icons.close, color: Colors.white70, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            tip.getContent(locale),
            style: const TextStyle(fontSize: 14, color: Colors.white70),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '$currentStep / $totalSteps',
                style: const TextStyle(fontSize: 12, color: Colors.white60),
              ),
              if (onNext != null && currentStep < totalSteps)
                TextButton(
                  onPressed: onNext,
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.2),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                  ),
                  child: Text(
                    isArabic ? 'التالي' : 'Next',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              if (currentStep == totalSteps)
                TextButton(
                  onPressed: onDismiss,
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                  ),
                  child: Text(
                    isArabic ? 'تم' : 'Got it',
                    style: TextStyle(color: AppColors.primaryBlue),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class FeedbackForm extends StatefulWidget {
  final Function(String type, String message) onSubmit;
  final String locale;

  const FeedbackForm({super.key, required this.onSubmit, this.locale = 'en'});

  @override
  State<FeedbackForm> createState() => _FeedbackFormState();
}

class _FeedbackFormState extends State<FeedbackForm> {
  final TextEditingController _messageController = TextEditingController();
  String _type = 'general';

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.locale == 'ar';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          isArabic ? 'نوع الملاحظات' : 'Feedback Type',
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _type,
          decoration: InputDecoration(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 8,
            ),
          ),
          items: [
            DropdownMenuItem(
              value: 'general',
              child: Text(isArabic ? 'ملاحظات عامة' : 'General Feedback'),
            ),
            DropdownMenuItem(
              value: 'bug',
              child: Text(isArabic ? 'تقرير خطأ' : 'Bug Report'),
            ),
            DropdownMenuItem(
              value: 'feature',
              child: Text(isArabic ? 'طلب ميزة' : 'Feature Request'),
            ),
          ],
          onChanged: (value) => setState(() => _type = value ?? 'general'),
        ),
        const SizedBox(height: 16),
        Text(
          isArabic ? 'رسالتك' : 'Your Message',
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _messageController,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: isArabic
                ? 'اكتب ملاحظاتك هنا...'
                : 'Write your feedback here...',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _messageController.text.isEmpty
                ? null
                : () => widget.onSubmit(_type, _messageController.text),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              isArabic ? 'إرسال الملاحظات' : 'Submit Feedback',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class EmergencySOSButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String locale;

  const EmergencySOSButton({
    super.key,
    required this.onPressed,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';

    return GestureDetector(
      onLongPress: onPressed,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.red.withOpacity(0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.sos, color: Colors.white, size: 48),
            const SizedBox(height: 8),
            Text(
              isArabic ? 'اضغط مطولاً للطوارئ' : 'Long press for SOS',
              style: const TextStyle(fontSize: 12, color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }
}

class LiveChatBubble extends StatelessWidget {
  final VoidCallback onTap;
  final int unreadCount;
  final String locale;

  const LiveChatBubble({
    super.key,
    required this.onTap,
    this.unreadCount = 0,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.primaryBlue,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryBlue.withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Icon(Icons.chat_bubble, color: Colors.white, size: 28),
          ),
          if (unreadCount > 0)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                child: Center(
                  child: Text(
                    unreadCount > 9 ? '9+' : '$unreadCount',
                    style: const TextStyle(
                      fontSize: 10,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
