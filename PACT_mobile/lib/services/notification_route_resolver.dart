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

  const NotificationRouteDecision({
    required this.kind,
    this.chatId,
    this.walletTab,
    this.mainArgs,
    this.panelTab,
  });

  const NotificationRouteDecision.none()
    : kind = NotificationRouteKind.none,
      chatId = null,
      walletTab = null,
      mainArgs = null,
      panelTab = null;
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
