// lib/widgets/notifications_panel.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/user_notification_service.dart';
import '../models/user_notification.dart';
import '../theme/app_colors.dart';

// ─────────────────────────────────────────────────────────────────────────────
// BroadcastPopup — animated sliding banner shown at the top of the screen.
// URGENT broadcasts do NOT auto-dismiss — user must tap "View & Acknowledge".
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
    // Urgent banners stay until explicitly acknowledged
    if (notification.priority != 'urgent') {
      _timer = Timer(const Duration(seconds: 8), dismiss);
    }
  }

  static void dismiss() {
    _timer?.cancel();
    _timer = null;
    try {
      _entry?.remove();
    } catch (_) {}
    _entry = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner widget — slide + fade in, shake on urgent, no dismiss for urgent
// ─────────────────────────────────────────────────────────────────────────────
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
    with TickerProviderStateMixin {
  late AnimationController _slideCtrl;
  late Animation<Offset> _slide;
  late Animation<double> _fade;
  late AnimationController _shakeCtrl;
  late Animation<double> _shake;

  @override
  void initState() {
    super.initState();
    _slideCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, -1.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _slideCtrl, curve: Curves.easeOutCubic));
    _fade = Tween<double>(begin: 0, end: 1).animate(_slideCtrl);

    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 55),
    );
    _shake = Tween<double>(
      begin: -6,
      end: 6,
    ).animate(CurvedAnimation(parent: _shakeCtrl, curve: Curves.easeInOut));

    _slideCtrl.forward().then((_) {
      if (widget.notification.priority == 'urgent') _runShake();
    });
  }

  Future<void> _runShake() async {
    for (int i = 0; i < 4; i++) {
      if (!mounted) return;
      await _shakeCtrl.forward();
      if (!mounted) return;
      await _shakeCtrl.reverse();
    }
  }

  @override
  void dispose() {
    _slideCtrl.dispose();
    _shakeCtrl.dispose();
    super.dispose();
  }

  Color get _priorityColor {
    switch (widget.notification.priority) {
      case 'urgent':
        return AppColors.accentRed;
      case 'high':
        return AppColors.accentYellow;
      default:
        return const Color(0xFF7C3AED);
    }
  }

  String get _priorityLabel {
    switch (widget.notification.priority) {
      case 'urgent':
        return 'URGENT / عاجل';
      case 'high':
        return 'HIGH / عالي';
      default:
        return 'ANNOUNCEMENT / إعلان';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isUrgent = widget.notification.priority == 'urgent';
    final n = widget.notification;

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SlideTransition(
        position: _slide,
        child: FadeTransition(
          opacity: _fade,
          child: AnimatedBuilder(
            animation: _shake,
            builder: (_, child) => Transform.translate(
              offset: Offset(_shake.value, 0),
              child: child,
            ),
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
                        // Top bar: icon + label + optional X (hidden for urgent)
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
                                child: Icon(
                                  Icons.campaign_rounded,
                                  color: _priorityColor,
                                  size: 16,
                                ),
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
                              if (!isUrgent)
                                GestureDetector(
                                  onTap: widget.onDismiss,
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    child: Icon(
                                      Icons.close,
                                      size: 18,
                                      color: Colors.grey[500],
                                    ),
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
                                n.title,
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textDark,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (n.titleAr.isNotEmpty && n.titleAr != n.title)
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    n.titleAr,
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
                                n.message,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: AppColors.textLight,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (n.messageAr.isNotEmpty &&
                                  n.messageAr != n.message)
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    n.messageAr,
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

                        // CTA buttons
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
                          child: Row(
                            children: [
                              if (!isUrgent) ...[
                                Expanded(
                                  child: GestureDetector(
                                    onTap: widget.onDismiss,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 9,
                                      ),
                                      decoration: BoxDecoration(
                                        border: Border.all(
                                          color: Colors.grey[300]!,
                                        ),
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
                              ],
                              Expanded(
                                flex: isUrgent ? 1 : 2,
                                child: GestureDetector(
                                  onTap: widget.onView,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 9,
                                    ),
                                    decoration: BoxDecoration(
                                      color: _priorityColor,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      isUrgent
                                          ? 'View & Acknowledge / إقرار'
                                          : 'View Broadcast / عرض',
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

                        // Action link button (only when link is set)
                        if (n.link != null && n.link!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                            child: GestureDetector(
                              onTap: () async {
                                final uri = Uri.tryParse(n.link!);
                                if (uri != null) {
                                  await launchUrl(
                                    uri,
                                    mode: LaunchMode.externalApplication,
                                  );
                                }
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: _priorityColor.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: _priorityColor.withValues(
                                      alpha: 0.3,
                                    ),
                                  ),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.open_in_new,
                                      size: 14,
                                      color: _priorityColor,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Open Link / فتح الرابط',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: _priorityColor,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
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
// Panel content
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

  // Sorted: unread urgent → unread high → unread normal → read (newest first)
  List<UserNotification> get _filtered {
    List<UserNotification> list;
    switch (_activeTab) {
      case 'broadcasts':
        list = _notifications.where((n) => n.isBroadcast).toList();
      case 'updates':
        list = _notifications.where((n) => !n.isBroadcast).toList();
      default:
        list = _notifications.toList();
    }
    list.sort((a, b) {
      int rank(UserNotification n) {
        if (!n.isRead && n.priority == 'urgent') return 0;
        if (!n.isRead && n.priority == 'high') return 1;
        if (!n.isRead) return 2;
        return 3;
      }

      final cmp = rank(a).compareTo(rank(b));
      if (cmp != 0) return cmp;
      return b.createdAt.compareTo(a.createdAt);
    });
    return list;
  }

  int get _unreadAll => _notifications.where((n) => !n.isRead).length;
  int get _unreadBroadcasts =>
      _notifications.where((n) => !n.isRead && n.isBroadcast).length;
  int get _unreadUpdates =>
      _notifications.where((n) => !n.isRead && !n.isBroadcast).length;
  int get _urgentUnread => _notifications
      .where((n) => !n.isRead && n.isBroadcast && n.priority == 'urgent')
      .length;

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

          // ── Enhanced Header ────────────────────────────────────────────
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
                    Expanded(
                      child: Column(
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
                          if (_unreadAll > 0 || _notifications.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(
                                        alpha: 0.25,
                                      ),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 5,
                                          height: 5,
                                          decoration: BoxDecoration(
                                            color: Colors.white,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                        const SizedBox(width: 5),
                                        Text(
                                          '$_unreadAll unread',
                                          style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.white,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(
                                        alpha: 0.15,
                                      ),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Text(
                                      '• ${_notifications.length} total',
                                      style: GoogleFonts.poppins(
                                        fontSize: 10,
                                        color: Colors.white.withValues(
                                          alpha: 0.8,
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
                    Row(
                      children: [
                        if (_unreadAll > 0)
                          GestureDetector(
                            onTap: _markAllRead,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 7,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
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
                              color: Colors.white.withValues(alpha: 0.2),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.close,
                              color: Colors.white,
                              size: 20,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                // Enhanced Tab chips with icons
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _enhancedTabChip(
                        'all',
                        '📬 All / الكل',
                        _unreadAll,
                        false,
                        Icons.mail_outline_rounded,
                      ),
                      const SizedBox(width: 8),
                      _enhancedTabChip(
                        'broadcasts',
                        '🔴 Broadcasts',
                        _unreadBroadcasts,
                        _urgentUnread > 0,
                        Icons.campaign_rounded,
                      ),
                      const SizedBox(width: 8),
                      _enhancedTabChip(
                        'updates',
                        '✨ Updates',
                        _unreadUpdates,
                        false,
                        Icons.info_rounded,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ── Sticky urgent strip (broadcasts tab only) ─────────────────
          if (_activeTab == 'broadcasts' && _urgentUnread > 0)
            Container(
              margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: const Color(0xFFFEE2E2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.accentRed.withValues(alpha: 0.4),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accentRed.withValues(alpha: 0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.accentRed.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(
                      Icons.warning_rounded,
                      color: AppColors.accentRed,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$_urgentUnread urgent broadcast${_urgentUnread > 1 ? 's' : ''} · عاجل',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.accentRed,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Requires your acknowledgment · تتطلب إقرار',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.accentRed.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // ── Scrollable List with Pull-to-Refresh ────────────────────────
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await widget.notificationService.initialize();
              },
              color: const Color(0xFF6D28D9),
              backgroundColor: Colors.white,
              child: _filtered.isEmpty
                  ? _buildEnhancedEmpty()
                  : ListView.builder(
                      controller: widget.scrollController,
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      itemCount: _filtered.length,
                      itemBuilder: (ctx, i) {
                        final n = _filtered[i];
                        return _buildNotificationItem(n);
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // Enhanced tab chip with icon
  Widget _enhancedTabChip(
    String id,
    String label,
    int unread,
    bool hasUrgent,
    IconData icon,
  ) {
    final isActive = _activeTab == id;
    final chipColor = hasUrgent ? AppColors.accentRed : const Color(0xFF6D28D9);
    return GestureDetector(
      onTap: () => setState(() => _activeTab = id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: hasUrgent && !isActive
                ? AppColors.accentRed.withValues(alpha: 0.5)
                : isActive
                ? chipColor.withValues(alpha: 0.2)
                : Colors.transparent,
            width: hasUrgent && !isActive ? 1.5 : 1,
          ),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: chipColor.withValues(alpha: 0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: isActive ? chipColor : Colors.white.withValues(alpha: 0.7),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isActive ? chipColor : Colors.white,
              ),
            ),
            if (unread > 0) ...[
              const SizedBox(width: 6),
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: hasUrgent
                      ? AppColors.accentRed
                      : (isActive
                            ? chipColor
                            : Colors.white.withValues(alpha: 0.3)),
                  borderRadius: BorderRadius.circular(12),
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

  // Original tab chip (kept for backward compatibility if needed)
  Widget _tabChip(String id, String label, int unread, bool hasUrgent) {
    final isActive = _activeTab == id;
    final chipColor = hasUrgent ? AppColors.accentRed : const Color(0xFF6D28D9);
    return GestureDetector(
      onTap: () => setState(() => _activeTab = id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(20),
          border: hasUrgent && !isActive
              ? Border.all(
                  color: AppColors.accentRed.withValues(alpha: 0.6),
                  width: 1.5,
                )
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isActive ? chipColor : Colors.white,
              ),
            ),
            if (unread > 0) ...[
              const SizedBox(width: 5),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: hasUrgent
                      ? AppColors.accentRed
                      : (isActive
                            ? chipColor
                            : Colors.white.withValues(alpha: 0.3)),
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

  Widget _buildEnhancedEmpty() {
    return CustomScrollView(
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.notifications_off_outlined,
                      size: 44,
                      color: Color(0xFF6D28D9),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'No notifications',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textDark,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'You\'re all caught up!\n'
                    'أنت على اطّلاع.',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      color: AppColors.textLight,
                      height: 1.5,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.refresh_rounded,
                          size: 16,
                          color: Color(0xFF6D28D9),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Pull to refresh · اسحب لتحديث',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: const Color(0xFF6D28D9),
                            fontWeight: FontWeight.w600,
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
      ],
    );
  }

  Widget _buildNotificationItem(UserNotification n) {
    if (n.isBroadcast) {
      return _BroadcastCard(
        notification: n,
        onConfirm: () => widget.notificationService.markAsRead(n.id),
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast card — all 7 enhancements applied
// ─────────────────────────────────────────────────────────────────────────────
class _BroadcastCard extends StatefulWidget {
  final UserNotification notification;
  final VoidCallback onConfirm;

  const _BroadcastCard({required this.notification, required this.onConfirm});

  @override
  State<_BroadcastCard> createState() => _BroadcastCardState();
}

class _BroadcastCardState extends State<_BroadcastCard>
    with SingleTickerProviderStateMixin {
  bool _confirming = false;
  DateTime? _readAt; // set when user confirms; drives read receipt text
  late AnimationController _shakeCtrl;
  late Animation<double> _shake;

  @override
  void initState() {
    super.initState();
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 50),
    );
    _shake = Tween<double>(
      begin: -4,
      end: 4,
    ).animate(CurvedAnimation(parent: _shakeCtrl, curve: Curves.easeInOut));

    // Pulse urgent unread cards once on mount
    if (widget.notification.priority == 'urgent' &&
        !widget.notification.isRead) {
      _runShake();
    }
  }

  Future<void> _runShake() async {
    await Future.delayed(const Duration(milliseconds: 250));
    for (int i = 0; i < 3; i++) {
      if (!mounted) return;
      await _shakeCtrl.forward();
      if (!mounted) return;
      await _shakeCtrl.reverse();
    }
  }

  @override
  void dispose() {
    _shakeCtrl.dispose();
    super.dispose();
  }

  Color get _priorityColor {
    switch (widget.notification.priority) {
      case 'urgent':
        return AppColors.accentRed;
      case 'high':
        return AppColors.accentYellow;
      default:
        return const Color(0xFF7C3AED);
    }
  }

  Color get _priorityBg {
    switch (widget.notification.priority) {
      case 'urgent':
        return const Color(0xFFFEE2E2);
      case 'high':
        return const Color(0xFFFEF3C7);
      default:
        return const Color(0xFFEDE9FE);
    }
  }

  String get _priorityLabelEn {
    switch (widget.notification.priority) {
      case 'urgent':
        return 'URGENT';
      case 'high':
        return 'HIGH';
      default:
        return 'ANNOUNCEMENT';
    }
  }

  String get _priorityLabelAr {
    switch (widget.notification.priority) {
      case 'urgent':
        return 'عاجل';
      case 'high':
        return 'عالي';
      default:
        return 'إعلان';
    }
  }

  Future<void> _confirm() async {
    if (_confirming || widget.notification.isRead || _readAt != null) return;
    setState(() {
      _confirming = true;
      _readAt = DateTime.now();
    });
    widget.onConfirm();
    await Future.delayed(const Duration(milliseconds: 600));
    if (mounted) setState(() => _confirming = false);
  }

  void _copyToClipboard(BuildContext context) {
    final n = widget.notification;
    final buffer = StringBuffer()..writeln(n.title);
    if (n.titleAr.isNotEmpty && n.titleAr != n.title) {
      buffer.writeln(n.titleAr);
    }
    buffer.writeln();
    buffer.writeln(n.message);
    if (n.messageAr.isNotEmpty && n.messageAr != n.message) {
      buffer.writeln(n.messageAr);
    }
    Clipboard.setData(ClipboardData(text: buffer.toString().trim()));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Copied to clipboard / تم النسخ',
          style: GoogleFonts.poppins(fontSize: 13),
        ),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  String _readReceiptText(DateTime dt) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return 'Read on ${months[dt.month - 1]} ${dt.day} at $h:$m · تمت القراءة';
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notification;
    final isRead = n.isRead || _readAt != null;
    final isUrgent = n.priority == 'urgent';

    return GestureDetector(
      onLongPress: () => _copyToClipboard(context),
      child: AnimatedBuilder(
        animation: _shake,
        builder: (_, child) =>
            Transform.translate(offset: Offset(_shake.value, 0), child: child),
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.98, end: 1.0).animate(
            CurvedAnimation(
              parent: AlwaysStoppedAnimation<double>(isRead ? 1.0 : 1.0),
              curve: Curves.easeOutBack,
            ),
          ),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border(left: BorderSide(color: _priorityColor, width: 4)),
              boxShadow: [
                BoxShadow(
                  color: isUrgent && !isRead
                      ? _priorityColor.withValues(alpha: 0.15)
                      : Colors.black.withValues(alpha: 0.06),
                  blurRadius: 12,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Priority header strip with enhanced styling
                Container(
                  decoration: BoxDecoration(
                    color: _priorityBg,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(12),
                      topRight: Radius.circular(16),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          color: _priorityColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Icon(
                          Icons.campaign_rounded,
                          color: _priorityColor,
                          size: 14,
                        ),
                      ),
                      const SizedBox(width: 8),
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
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 500),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: _priorityColor,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: _priorityColor.withValues(alpha: 0.5),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                        )
                      else
                        Icon(
                          Icons.check_circle_rounded,
                          color: AppColors.accentGreen,
                          size: 16,
                        ),
                    ],
                  ),
                ),

                // Message body
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        n.title,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textDark,
                        ),
                      ),
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

                      Text(
                        n.message,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: AppColors.textLight,
                          height: 1.5,
                        ),
                      ),
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

                      // Timestamp + long-press hint
                      Row(
                        children: [
                          Icon(
                            Icons.access_time_rounded,
                            size: 11,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _formatTime(n.createdAt),
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.grey[500],
                            ),
                          ),
                          const Spacer(),
                          Icon(Icons.copy, size: 11, color: Colors.grey[400]),
                          const SizedBox(width: 3),
                          Text(
                            'Hold to copy / اضغط للنسخ',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey[400],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Action link button
                if (n.link != null && n.link!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: GestureDetector(
                      onTap: () async {
                        final uri = Uri.tryParse(n.link!);
                        if (uri != null) {
                          await launchUrl(
                            uri,
                            mode: LaunchMode.externalApplication,
                          );
                        }
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: _priorityColor.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _priorityColor.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.open_in_new_rounded,
                              size: 14,
                              color: _priorityColor,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Open Link / فتح الرابط',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: _priorityColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                // Confirm section
                if (!isRead)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: isUrgent
                        ? _SwipeToConfirm(
                            color: _priorityColor,
                            onConfirm: _confirm,
                          )
                        : GestureDetector(
                            onTap: _confirm,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    _priorityColor,
                                    _priorityColor.withValues(alpha: 0.8),
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: [
                                  BoxShadow(
                                    color: _priorityColor.withValues(
                                      alpha: 0.3,
                                    ),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
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
                                    const Icon(
                                      Icons.check_circle_outline_rounded,
                                      color: Colors.white,
                                      size: 18,
                                    ),
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

                // Read receipt
                if (isRead)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        vertical: 10,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.accentGreen.withValues(alpha: 0.3),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.accentGreen.withValues(
                              alpha: 0.05,
                            ),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.check_circle_rounded,
                                color: AppColors.accentGreen,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Reading Confirmed / تم تأكيد القراءة',
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.accentGreen,
                                ),
                              ),
                            ],
                          ),
                          if (_readAt != null) ...[
                            const SizedBox(height: 3),
                            Text(
                              _readReceiptText(_readAt!),
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.grey[500],
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swipe-to-confirm — mandatory acknowledgment for urgent broadcasts
// ─────────────────────────────────────────────────────────────────────────────
class _SwipeToConfirm extends StatefulWidget {
  final Color color;
  final VoidCallback onConfirm;

  const _SwipeToConfirm({required this.color, required this.onConfirm});

  @override
  State<_SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<_SwipeToConfirm> {
  double _progress = 0.0;
  bool _completed = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final trackWidth = constraints.maxWidth;
        const thumbSize = 46.0;
        final maxDrag = trackWidth - thumbSize - 8.0;

        return GestureDetector(
          onHorizontalDragUpdate: (d) {
            if (_completed) return;
            setState(() {
              _progress = ((_progress * maxDrag + d.delta.dx) / maxDrag).clamp(
                0.0,
                1.0,
              );
            });
          },
          onHorizontalDragEnd: (_) {
            if (_completed) return;
            if (_progress >= 0.88) {
              setState(() {
                _completed = true;
                _progress = 1.0;
              });
              widget.onConfirm();
            } else {
              setState(() => _progress = 0.0);
            }
          },
          child: Container(
            height: 54,
            decoration: BoxDecoration(
              color: widget.color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: widget.color.withValues(alpha: 0.35)),
            ),
            child: Stack(
              children: [
                // Fill bar
                AnimatedContainer(
                  duration: const Duration(milliseconds: 80),
                  width: (_progress * maxDrag + thumbSize + 4).clamp(
                    thumbSize + 4,
                    trackWidth,
                  ),
                  height: double.infinity,
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(13),
                  ),
                ),

                // Instruction label (fades as thumb moves right)
                Center(
                  child: AnimatedOpacity(
                    opacity: _progress < 0.35 ? 1.0 : 0.0,
                    duration: const Duration(milliseconds: 120),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 56),
                      child: Text(
                        'Slide to acknowledge / اسحب للإقرار',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: widget.color,
                        ),
                      ),
                    ),
                  ),
                ),

                // Draggable thumb
                AnimatedPositioned(
                  duration: _completed
                      ? const Duration(milliseconds: 300)
                      : Duration.zero,
                  curve: Curves.easeOut,
                  left: _completed
                      ? trackWidth - thumbSize - 4
                      : _progress * maxDrag + 4,
                  top: 4,
                  child: Container(
                    width: thumbSize,
                    height: thumbSize,
                    decoration: BoxDecoration(
                      color: widget.color,
                      borderRadius: BorderRadius.circular(11),
                      boxShadow: [
                        BoxShadow(
                          color: widget.color.withValues(alpha: 0.4),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Icon(
                      _completed
                          ? Icons.check_rounded
                          : Icons.arrow_forward_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
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
      case 'warning':
        return AppColors.accentYellow;
      case 'error':
        return AppColors.accentRed;
      case 'success':
        return AppColors.accentGreen;
      default:
        return AppColors.primaryBlue;
    }
  }

  IconData _icon(String type) {
    switch (type.toLowerCase()) {
      case 'warning':
        return Icons.warning_rounded;
      case 'error':
        return Icons.error_rounded;
      case 'success':
        return Icons.check_circle_rounded;
      default:
        return Icons.info_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final isUnread = !n.isRead;
    final color = _iconColor(n.type);

    return GestureDetector(
      onTap: onTap,
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.98, end: 1.0).animate(
          CurvedAnimation(
            parent: AlwaysStoppedAnimation<double>(isUnread ? 1.0 : 1.0),
            curve: Curves.easeOutCubic,
          ),
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: isUnread ? color.withValues(alpha: 0.05) : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isUnread
                  ? color.withValues(alpha: 0.2)
                  : Colors.grey.withValues(alpha: 0.12),
              width: isUnread ? 1.5 : 1,
            ),
            boxShadow: isUnread
                ? [
                    BoxShadow(
                      color: color.withValues(alpha: 0.08),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.03),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(11),
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
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 500),
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: color,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: color.withValues(alpha: 0.5),
                                    blurRadius: 3,
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
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
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          Icon(
                            Icons.access_time_rounded,
                            size: 10,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(width: 3),
                          Text(
                            _formatTime(n.createdAt),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey[500],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (isUnread)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'New',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: color,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
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
  if (diff.inDays > 7) return '${dt.day}/${dt.month}/${dt.year}';
  if (diff.inDays > 0) return '${diff.inDays}d ago';
  if (diff.inHours > 0) return '${diff.inHours}h ago';
  if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
  return 'Just now';
}
