// lib/widgets/notifications_panel.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/user_notification_service.dart';
import '../models/user_notification.dart';
import '../theme/app_colors.dart';

// ─────────────────────────────────────────────────────────────────────────────
// BroadcastPopup — animated sliding banner shown at the top of the screen
// Call BroadcastPopup.show(context, notification) from any screen.
// ─────────────────────────────────────────────────────────────────────────────
class BroadcastPopup {
  static OverlayEntry? _entry;
  static Timer? _timer;

  static void show(BuildContext context, UserNotification notification) {
    dismiss();
    final overlay = Overlay.of(context);

    _entry = OverlayEntry(
      builder: (_) => _BroadcastBannerWidget(
        notification: notification,
        onDismiss: dismiss,
        onView: () {
          dismiss();
          NotificationsPanel.show(context, initialTab: 'broadcasts');
        },
      ),
    );

    overlay.insert(_entry!);
    _timer = Timer(const Duration(seconds: 8), dismiss);
  }

  static void dismiss() {
    _timer?.cancel();
    _timer = null;
    try {
      _entry?.remove();
    } catch (_) {
      // OverlayEntry may already be detached (e.g. user navigated away).
      // Swallow the error so future popups are never blocked.
    }
    _entry = null;
  }
}

class _BroadcastBannerWidget extends StatefulWidget {
  final UserNotification notification;
  final VoidCallback onDismiss;
  final VoidCallback onView;

  const _BroadcastBannerWidget({
    required this.notification,
    required this.onDismiss,
    required this.onView,
  });

  @override
  State<_BroadcastBannerWidget> createState() => _BroadcastBannerWidgetState();
}

class _BroadcastBannerWidgetState extends State<_BroadcastBannerWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<Offset> _slide;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _slide = Tween<Offset>(begin: const Offset(0, -1.2), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fade = Tween<double>(begin: 0, end: 1).animate(_ctrl);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Color get _priorityColor {
    switch (widget.notification.priority) {
      case 'urgent': return AppColors.accentRed;
      case 'high':   return AppColors.accentYellow;
      default:       return const Color(0xFF7C3AED);
    }
  }

  String get _priorityLabel {
    switch (widget.notification.priority) {
      case 'urgent': return 'URGENT / عاجل';
      case 'high':   return 'HIGH / عالي';
      default:       return 'ANNOUNCEMENT / إعلان';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SlideTransition(
        position: _slide,
        child: FadeTransition(
          opacity: _fade,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Material(
                elevation: 12,
                borderRadius: BorderRadius.circular(16),
                color: Colors.transparent,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border(
                      left: BorderSide(color: _priorityColor, width: 5),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 20,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top bar: icon + priority label + dismiss
                      Container(
                        decoration: BoxDecoration(
                          color: _priorityColor.withValues(alpha: 0.08),
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(11),
                            topRight: Radius.circular(16),
                          ),
                        ),
                        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: _priorityColor.withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(Icons.campaign_rounded, color: _priorityColor, size: 16),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _priorityLabel,
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: _priorityColor,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const Spacer(),
                            GestureDetector(
                              onTap: widget.onDismiss,
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                child: Icon(Icons.close, size: 18, color: Colors.grey[500]),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Content
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.notification.title,
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textDark,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (widget.notification.titleAr.isNotEmpty &&
                                widget.notification.titleAr != widget.notification.title)
                              Align(
                                alignment: Alignment.centerRight,
                                child: Text(
                                  widget.notification.titleAr,
                                  textDirection: TextDirection.rtl,
                                  style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textLight,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            const SizedBox(height: 4),
                            Text(
                              widget.notification.message,
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: AppColors.textLight,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (widget.notification.messageAr.isNotEmpty &&
                                widget.notification.messageAr != widget.notification.message)
                              Align(
                                alignment: Alignment.centerRight,
                                child: Text(
                                  widget.notification.messageAr,
                                  textDirection: TextDirection.rtl,
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                        ),
                      ),

                      // Action buttons
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
                        child: Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: widget.onDismiss,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 9),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey[300]!),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    'Dismiss / تجاهل',
                                    textAlign: TextAlign.center,
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 2,
                              child: GestureDetector(
                                onTap: widget.onView,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 9),
                                  decoration: BoxDecoration(
                                    color: _priorityColor,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    'View Broadcast / عرض',
                                    textAlign: TextAlign.center,
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationsPanel — main entry point
// ─────────────────────────────────────────────────────────────────────────────
class NotificationsPanel {
  static void show(BuildContext context, {String initialTab = 'all'}) {
    final notificationService = UserNotificationService();

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (ctx2, scrollController) => _NotificationsPanelContent(
          scrollController: scrollController,
          notificationService: notificationService,
          initialTab: initialTab,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel content — stateful so we can handle tabs + mark as read
// ─────────────────────────────────────────────────────────────────────────────
class _NotificationsPanelContent extends StatefulWidget {
  final ScrollController scrollController;
  final UserNotificationService notificationService;
  final String initialTab;

  const _NotificationsPanelContent({
    required this.scrollController,
    required this.notificationService,
    this.initialTab = 'all',
  });

  @override
  State<_NotificationsPanelContent> createState() =>
      _NotificationsPanelContentState();
}

class _NotificationsPanelContentState
    extends State<_NotificationsPanelContent> {
  late String _activeTab;
  List<UserNotification> _notifications = [];
  StreamSubscription<List<UserNotification>>? _sub;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    _activeTab = widget.initialTab;
    _notifications = widget.notificationService.currentNotifications.toList();
    _sub = widget.notificationService.watchNotifications().listen((list) {
      if (mounted) setState(() => _notifications = list.toList());
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  List<UserNotification> get _filtered {
    switch (_activeTab) {
      case 'broadcasts':
        return _notifications.where((n) => n.isBroadcast).toList();
      case 'updates':
        return _notifications.where((n) => !n.isBroadcast).toList();
      default:
        return _notifications;
    }
  }

  int get _unreadAll => _notifications.where((n) => !n.isRead).length;
  int get _unreadBroadcasts =>
      _notifications.where((n) => !n.isRead && n.isBroadcast).length;
  int get _unreadUpdates =>
      _notifications.where((n) => !n.isRead && !n.isBroadcast).length;

  Future<void> _markAllRead() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    final ids = _filtered.where((n) => !n.isRead).map((n) => n.id).toList();
    await widget.notificationService.markManyAsRead(ids);
    if (mounted) setState(() => _markingAll = false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 4),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // ── Header ────────────────────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF6D28D9), Color(0xFF7C3AED)],
              ),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(20, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notifications / الإشعارات',
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        if (_unreadAll > 0)
                          Text(
                            '$_unreadAll unread · غير مقروء',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.white70,
                            ),
                          ),
                      ],
                    ),
                    Row(
                      children: [
                        if (_unreadAll > 0)
                          GestureDetector(
                            onTap: _markAllRead,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 7),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: _markingAll
                                  ? const SizedBox(
                                      width: 14,
                                      height: 14,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      'Mark all read',
                                      style: GoogleFonts.poppins(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => Navigator.pop(context),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.close,
                                color: Colors.white, size: 20),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                // Tab chips
                Row(
                  children: [
                    _tabChip('all', 'All / الكل', _unreadAll),
                    const SizedBox(width: 8),
                    _tabChip('broadcasts', '📢 Broadcasts', _unreadBroadcasts),
                    const SizedBox(width: 8),
                    _tabChip('updates', 'Updates', _unreadUpdates),
                  ],
                ),
              ],
            ),
          ),

          // ── List ──────────────────────────────────────────────────────
          Expanded(
            child: _filtered.isEmpty
                ? _buildEmpty()
                : ListView.builder(
                    controller: widget.scrollController,
                    padding: const EdgeInsets.symmetric(
                        vertical: 12, horizontal: 12),
                    itemCount: _filtered.length,
                    itemBuilder: (ctx, i) {
                      final n = _filtered[i];
                      if (n.isBroadcast) {
                        return _BroadcastCard(
                          notification: n,
                          onConfirm: () =>
                              widget.notificationService.markAsRead(n.id),
                        );
                      }
                      return _UpdateCard(
                        notification: n,
                        onTap: () async {
                          if (!n.isRead) {
                            await widget.notificationService.markAsRead(n.id);
                          }
                          if (context.mounted) Navigator.pop(context);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tabChip(String id, String label, int unread) {
    final isActive = _activeTab == id;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isActive
                    ? const Color(0xFF6D28D9)
                    : Colors.white,
              ),
            ),
            if (unread > 0) ...[
              const SizedBox(width: 5),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: isActive
                      ? const Color(0xFF6D28D9)
                      : Colors.white.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$unread',
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: const Color(0xFFEDE9FE),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.notifications_none_rounded,
                size: 36, color: Color(0xFF7C3AED)),
          ),
          const SizedBox(height: 16),
          Text(
            'No notifications / لا توجد إشعارات',
            style: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'You\'re all caught up!',
            style: GoogleFonts.poppins(
              fontSize: 13,
              color: AppColors.textLight,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast card — announcement style with read confirmation
// ─────────────────────────────────────────────────────────────────────────────
class _BroadcastCard extends StatefulWidget {
  final UserNotification notification;
  final VoidCallback onConfirm;

  const _BroadcastCard({required this.notification, required this.onConfirm});

  @override
  State<_BroadcastCard> createState() => _BroadcastCardState();
}

class _BroadcastCardState extends State<_BroadcastCard> {
  bool _confirming = false;

  Color get _priorityColor {
    switch (widget.notification.priority) {
      case 'urgent': return AppColors.accentRed;
      case 'high':   return AppColors.accentYellow;
      default:       return const Color(0xFF7C3AED);
    }
  }

  Color get _priorityBg {
    switch (widget.notification.priority) {
      case 'urgent': return const Color(0xFFFEE2E2);
      case 'high':   return const Color(0xFFFEF3C7);
      default:       return const Color(0xFFEDE9FE);
    }
  }

  String get _priorityLabelEn {
    switch (widget.notification.priority) {
      case 'urgent': return 'URGENT';
      case 'high':   return 'HIGH';
      default:       return 'ANNOUNCEMENT';
    }
  }

  String get _priorityLabelAr {
    switch (widget.notification.priority) {
      case 'urgent': return 'عاجل';
      case 'high':   return 'عالي';
      default:       return 'إعلان';
    }
  }

  Future<void> _confirm() async {
    if (_confirming || widget.notification.isRead) return;
    setState(() => _confirming = true);
    widget.onConfirm();
    await Future.delayed(const Duration(milliseconds: 600));
    if (mounted) setState(() => _confirming = false);
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notification;
    final isRead = n.isRead;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border(
          left: BorderSide(color: _priorityColor, width: 4),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Priority header strip
          Container(
            decoration: BoxDecoration(
              color: _priorityBg,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(16),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(
              children: [
                Icon(Icons.campaign_rounded,
                    color: _priorityColor, size: 16),
                const SizedBox(width: 6),
                Text(
                  '$_priorityLabelEn / $_priorityLabelAr',
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: _priorityColor,
                    letterSpacing: 0.5,
                  ),
                ),
                const Spacer(),
                if (!isRead)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _priorityColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                if (isRead)
                  Icon(Icons.check_circle_rounded,
                      color: AppColors.accentGreen, size: 16),
              ],
            ),
          ),

          // Message body
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // English title
                Text(
                  n.title,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textDark,
                  ),
                ),
                // Arabic title
                if (n.titleAr.isNotEmpty && n.titleAr != n.title)
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        n.titleAr,
                        textDirection: TextDirection.rtl,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textLight,
                        ),
                      ),
                    ),
                  ),

                const SizedBox(height: 8),

                // English message
                Text(
                  n.message,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: AppColors.textLight,
                    height: 1.5,
                  ),
                ),
                // Arabic message
                if (n.messageAr.isNotEmpty && n.messageAr != n.message)
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        n.messageAr,
                        textDirection: TextDirection.rtl,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: AppColors.textLight,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ),

                const SizedBox(height: 6),
                Text(
                  _formatTime(n.createdAt),
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Colors.grey[500],
                  ),
                ),
              ],
            ),
          ),

          // Confirm reading button
          if (!isRead)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: GestureDetector(
                onTap: _confirm,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    color: _priorityColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_confirming)
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      else ...[
                        const Icon(Icons.check_circle_outline_rounded,
                            color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        _confirming
                            ? 'Confirming...'
                            : 'Confirm Reading / تأكيد القراءة',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          if (isRead)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.accentGreen.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.check_circle_rounded,
                        color: AppColors.accentGreen, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      'Reading Confirmed / تم تأكيد القراءة',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentGreen,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regular update card
// ─────────────────────────────────────────────────────────────────────────────
class _UpdateCard extends StatelessWidget {
  final UserNotification notification;
  final VoidCallback onTap;

  const _UpdateCard({required this.notification, required this.onTap});

  Color _iconColor(String type) {
    switch (type.toLowerCase()) {
      case 'warning': return AppColors.accentYellow;
      case 'error':   return AppColors.accentRed;
      case 'success': return AppColors.accentGreen;
      default:        return AppColors.primaryBlue;
    }
  }

  IconData _icon(String type) {
    switch (type.toLowerCase()) {
      case 'warning': return Icons.warning_rounded;
      case 'error':   return Icons.error_rounded;
      case 'success': return Icons.check_circle_rounded;
      default:        return Icons.info_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final isUnread = !n.isRead;
    final color = _iconColor(n.type);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: isUnread
              ? color.withValues(alpha: 0.04)
              : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isUnread
                ? color.withValues(alpha: 0.25)
                : Colors.grey[200]!,
          ),
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(_icon(n.type), color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          n.title,
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: isUnread
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: AppColors.textDark,
                          ),
                        ),
                      ),
                      if (isUnread)
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(left: 8),
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    n.message,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _formatTime(n.createdAt),
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: Colors.grey[500],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────────
String _formatTime(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inDays > 7) {
    return '${dt.day}/${dt.month}/${dt.year}';
  } else if (diff.inDays > 0) {
    return '${diff.inDays}d ago';
  } else if (diff.inHours > 0) {
    return '${diff.inHours}h ago';
  } else if (diff.inMinutes > 0) {
    return '${diff.inMinutes}m ago';
  }
  return 'Just now';
}
