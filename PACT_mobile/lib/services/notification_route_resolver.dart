import 'package:flutter/foundation.dart';

enum NotificationRouteKind {
  none,
  chat,
  call,
  main,
  wallet,
  notificationsPanel,
  sync,
  updateDownload,
}

class NotificationRouteDecision {
  final NotificationRouteKind kind;
  final String? chatId;
  final int? walletTab;
  final Map<String, dynamic>? mainArgs;
  final String? panelTab;

  /// Full FCM/data payload for incoming call (call_id, channel_name, from, etc.)
  final Map<String, dynamic>? callData;

  const NotificationRouteDecision({
    required this.kind,
    this.chatId,
    this.walletTab,
    this.mainArgs,
    this.panelTab,
    this.callData,
  });

  const NotificationRouteDecision.none()
    : kind = NotificationRouteKind.none,
      chatId = null,
      walletTab = null,
      mainArgs = null,
      panelTab = null,
      callData = null;
}

class NotificationRouteResolver {
  static NotificationRouteDecision fromPayload(String payload) {
    if (payload.startsWith('chat:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.chat,
        chatId: payload.substring(5),
      );
    }

    if (payload.startsWith('call:')) {
      return const NotificationRouteDecision(kind: NotificationRouteKind.call);
    }

    if (payload.startsWith('notif:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {'notificationId': payload.substring(6)},
      );
    }

    if (payload.startsWith('cost_submission_approved:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {
          'costSubmissionId': payload.substring(24),
          'tab': 'cost_submissions',
        },
      );
    }

    if (payload.startsWith('cost_submission_rejected:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {
          'costSubmissionId': payload.substring(24),
          'tab': 'cost_submissions',
        },
      );
    }

    if (payload.startsWith('cost_submission_revision:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {
          'costSubmissionId': payload.substring(23),
          'tab': 'cost_submissions',
        },
      );
    }

    if (payload.startsWith('budget_alert:')) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {
          'siteVisitId': payload.substring(13),
          'tab': 'cost_submissions',
        },
      );
    }

    if (payload == 'wallet:advances') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: 3,
      );
    }

    if (payload == 'wallet:cost_payments') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: 4,
      );
    }

    if (payload == 'notifications' ||
        payload == 'broadcast' ||
        payload.startsWith('broadcast:')) {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.notificationsPanel,
        panelTab: 'broadcasts',
      );
    }

    if (payload == 'offline_sync_completed') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {'tab': 'cost_submissions'},
      );
    }

    if (payload.startsWith('update:')) {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.updateDownload,
      );
    }

    return const NotificationRouteDecision.none();
  }

  /// Parse web-style link (e.g. /wallet, /site-visits?status=dispatched) for in-app navigation.
  /// When link is null/empty, derives destination from eventType and relatedEntityType.
  static NotificationRouteDecision fromLink(
    String? link, {
    String? eventType,
    String? relatedEntityType,
  }) {
    final hasLink = link != null && link.trim().isNotEmpty;
    if (hasLink) {
      final path = link.split('?').first.toLowerCase();
      if (path == '/wallet' || path.contains('wallet')) {
        final tab = link.contains('advances')
            ? 3
            : link.contains('cost')
            ? 4
            : 3;
        return NotificationRouteDecision(
          kind: NotificationRouteKind.wallet,
          walletTab: tab,
        );
      }
      if (path.contains('site-visit') ||
          path.contains('site_visit') ||
          path == '/mmp') {
        return const NotificationRouteDecision(
          kind: NotificationRouteKind.main,
          mainArgs: {'tab': 'site_visits'},
        );
      }
      if (path.contains('approval') || path.contains('down-payment')) {
        return const NotificationRouteDecision(
          kind: NotificationRouteKind.main,
          mainArgs: {'tab': 'approvals'},
        );
      }
      if (path == '/main' || path == '/') {
        return const NotificationRouteDecision(
          kind: NotificationRouteKind.main,
          mainArgs: <String, dynamic>{},
        );
      }
    }

    // When link is missing, derive from eventType / relatedEntityType so tap still navigates
    final ev = (eventType ?? '').toLowerCase();
    final rel = (relatedEntityType ?? '').toLowerCase();
    if (ev.contains('financial') ||
        ev.contains('wallet') ||
        rel == 'wallet' ||
        rel.contains('transaction') ||
        rel.contains('downpayment') ||
        rel.contains('cost')) {
      final tab = ev.contains('cost') || rel.contains('cost') ? 4 : 3;
      return NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: tab,
      );
    }
    if (ev.contains('assignment') ||
        ev.contains('assignments') ||
        rel == 'sitevisit' ||
        rel.contains('site_visit')) {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {'tab': 'site_visits'},
      );
    }
    if (ev.contains('approval') || rel.contains('approval')) {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {'tab': 'approvals'},
      );
    }

    // Default: open main (don't just close panel with no navigation)
    return const NotificationRouteDecision(
      kind: NotificationRouteKind.main,
      mainArgs: <String, dynamic>{},
    );
  }

  static NotificationRouteDecision fromFcmMessage({
    required String type,
    required Map<String, dynamic> data,
  }) {
    final normalizedType = type.toLowerCase().trim();

    if (normalizedType == 'sync') {
      return const NotificationRouteDecision(kind: NotificationRouteKind.sync);
    }

    if (normalizedType == 'fund_receipt_confirmation' ||
        normalizedType == 'advance_disbursed' ||
        normalizedType == 'advance_payment_action') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: 3,
      );
    }

    if (normalizedType == 'cost_submission_approved' ||
        normalizedType == 'cost_submission_rejected' ||
        normalizedType == 'cost_submission_revision') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: 4,
      );
    }

    if (normalizedType == 'wallet' ||
        normalizedType == 'withdrawal_approved' ||
        normalizedType == 'withdrawal_rejected') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.wallet,
        walletTab: 3,
      );
    }

    if (normalizedType == 'broadcast') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.notificationsPanel,
        panelTab: 'broadcasts',
      );
    }

    if (normalizedType == 'incoming_call' ||
        normalizedType == 'call' ||
        (data['call_id'] != null && data['channel_name'] != null)) {
      return NotificationRouteDecision(
        kind: NotificationRouteKind.call,
        callData: data,
      );
    }

    if (normalizedType == 'budget_alert' ||
        normalizedType == 'mmp_approved' ||
        normalizedType == 'mmp_rejected' ||
        normalizedType == 'mmp_status' ||
        normalizedType == 'site_visit' ||
        normalizedType == 'site_assigned' ||
        normalizedType == 'coverage_gap') {
      return const NotificationRouteDecision(
        kind: NotificationRouteKind.main,
        mainArgs: {'tab': 'site_visits'},
      );
    }

    final fallbackPayload = data['payload']?.toString();
    if (fallbackPayload != null && fallbackPayload.isNotEmpty) {
      return fromPayload(fallbackPayload);
    }

    return const NotificationRouteDecision(
      kind: NotificationRouteKind.notificationsPanel,
      panelTab: 'all',
    );
  }

  static String localizedActionLabelForType(String type) {
    switch (type.toLowerCase().trim()) {
      case 'fund_receipt_confirmation':
      case 'advance_disbursed':
      case 'advance_payment_action':
        return 'Acknowledge / تأكيد الاستلام';
      default:
        return 'View / عرض';
    }
  }

  static void logDecision(String source, NotificationRouteDecision decision) {
    debugPrint('[NotificationRouteResolver][$source] kind=${decision.kind}');
  }
}
