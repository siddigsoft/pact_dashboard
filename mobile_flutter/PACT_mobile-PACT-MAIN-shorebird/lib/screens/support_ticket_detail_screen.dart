import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/help_enhancements_service.dart';
import '../widgets/app_widgets.dart';

class SupportTicketDetailScreen extends StatefulWidget {
  final String ticketId;

  const SupportTicketDetailScreen({
    super.key,
    required this.ticketId,
  });

  @override
  State<SupportTicketDetailScreen> createState() =>
      _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  final HelpEnhancementsService _helpService = HelpEnhancementsService();
  final TextEditingController _replyController = TextEditingController();

  SupportTicket? _ticket;
  List<TicketMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  StreamSubscription<List<TicketMessage>>? _messageSubscription;

  @override
  void initState() {
    super.initState();
    _loadTicket();
    _messageSubscription = _helpService
        .subscribeToTicketMessages(widget.ticketId)
        .listen((messages) {
      if (mounted) setState(() => _messages = messages);
    });
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _loadTicket() async {
    setState(() => _loading = true);
    final ticket = await _helpService.getTicketById(widget.ticketId);
    if (mounted) {
      setState(() {
        _ticket = ticket;
        _messages = ticket?.messages ?? [];
        _loading = false;
      });
    }
  }

  Future<void> _sendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    final ok = await _helpService.addTicketMessage(widget.ticketId, text);
    if (mounted) {
      setState(() => _sending = false);
      if (ok) {
        _replyController.clear();
        AppSnackBar.show(
          context,
          message: 'Reply sent',
          type: SnackBarType.success,
        );
      } else {
        AppSnackBar.show(
          context,
          message: 'Failed to send reply',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _closeTicket() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Close ticket?'),
        content: const Text(
          'This will mark the ticket as closed. You can still view the conversation.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Close ticket'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final ok = await _helpService.closeTicket(widget.ticketId);
    if (mounted) {
      if (ok) {
        AppSnackBar.show(
          context,
          message: 'Ticket closed',
          type: SnackBarType.success,
        );
        _loadTicket();
      } else {
        AppSnackBar.show(
          context,
          message: 'Failed to close ticket',
          type: SnackBarType.error,
        );
      }
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'open':
        return Colors.blue;
      case 'in_progress':
      case 'waiting':
        return Colors.orange;
      case 'resolved':
        return Colors.green;
      case 'closed':
        return Colors.grey;
      default:
        return Colors.blue;
    }
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        return '${diff.inMinutes}m ago';
      }
      return '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    }
    return '${date.day}/${date.month}/${date.year}';
  }

  bool get _canReply =>
      _ticket != null &&
      _ticket!.status != 'closed' &&
      _ticket!.status != 'resolved';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _ticket?.subject ?? 'Ticket',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          if (_ticket != null &&
              _ticket!.status != 'closed' &&
              _ticket!.status != 'resolved')
            TextButton(
              onPressed: _closeTicket,
              child: const Text('Close'),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _ticket == null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text(
                        'Ticket not found',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          color: AppColors.textDark,
                        ),
                      ),
                    ],
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header card
                    Container(
                      margin: const EdgeInsets.all(16),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: _statusColor(_ticket!.status)
                                      .withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  _ticket!.status
                                      .replaceAll('_', ' ')
                                      .toUpperCase(),
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: _statusColor(_ticket!.status),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _ticket!.category,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                _ticket!.priority.toUpperCase(),
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _ticket!.description,
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              color: AppColors.textDark,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        'Conversation',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Messages list
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          return _buildMessageBubble(msg);
                        },
                      ),
                    ),
                    // Reply input
                    if (_canReply) _buildReplyBar(),
                  ],
                ),
    );
  }

  Widget _buildMessageBubble(TicketMessage msg) {
    final isStaff = msg.isStaffReply;
    return Align(
      alignment: isStaff ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        decoration: BoxDecoration(
          color: isStaff
              ? Colors.grey.shade200
              : AppColors.primaryBlue.withOpacity(0.15),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              msg.senderName,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isStaff ? Colors.grey.shade700 : AppColors.primaryBlue,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              msg.content,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _formatDate(msg.createdAt),
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReplyBar() {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: 12 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: _replyController,
              decoration: InputDecoration(
                hintText: 'Type a reply...',
                hintStyle: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey.shade500,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
              ),
              maxLines: 3,
              minLines: 1,
              onSubmitted: (_) => _sendReply(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _sending ? null : _sendReply,
            icon: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            color: Colors.white,
            style: IconButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
            ),
          ),
        ],
      ),
    );
  }
}
