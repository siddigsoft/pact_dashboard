import 'package:share_plus/share_plus.dart';
import 'package:flutter/material.dart';

/// Service for handling share operations across the app
class ShareService {
  /// Share a chat message
  static Future<void> shareMessage(String message, {String? subject}) async {
    try {
      await Share.share(
        message,
        subject: subject ?? 'PACT Consultancy Message',
      );
    } catch (e) {
      debugPrint('[ShareService] Error sharing message: $e');
    }
  }

  /// Share a chat conversation
  static Future<void> shareConversation({
    required String contactName,
    required String previewMessage,
    required String conversationSummary,
  }) async {
    try {
      final text =
          '''
Conversation with $contactName:

Latest: $previewMessage

$conversationSummary

---
Shared from PACT Consultancy Mobile
      ''';

      await Share.share(text, subject: 'Chat with $contactName');
    } catch (e) {
      debugPrint('[ShareService] Error sharing conversation: $e');
    }
  }

  /// Share a visit record
  static Future<void> shareVisitReport({
    required String visitId,
    required String siteName,
    required String date,
    required String status,
    required String summary,
  }) async {
    try {
      final text =
          '''
📋 Visit Report - $siteName

Visit ID: $visitId
Date: $date
Status: $status

Summary:
$summary

---
Generated from PACT Consultancy Mobile App
      ''';

      await Share.share(text, subject: 'Visit Report: $siteName - $date');
    } catch (e) {
      debugPrint('[ShareService] Error sharing visit report: $e');
    }
  }

  /// Share a call record
  static Future<void> shareCallRecord({
    required String contactName,
    required String duration,
    required String date,
    required String status,
  }) async {
    try {
      final text =
          '''
📞 Call Record

Contact: $contactName
Date: $date
Duration: $duration
Status: $status

---
Shared from PACT Consultancy Mobile
      ''';

      await Share.share(text, subject: 'Call Record: $contactName');
    } catch (e) {
      debugPrint('[ShareService] Error sharing call record: $e');
    }
  }

  /// Share with specific apps (email, WhatsApp, etc.)
  static Future<void> shareWithApps(
    String text, {
    String? subject,
    List<String>? recipients,
  }) async {
    try {
      await Share.share(text, subject: subject);
    } catch (e) {
      debugPrint('[ShareService] Error sharing with apps: $e');
    }
  }

  /// Share multiple items
  static Future<void> shareMultiple({
    required String text,
    List<String> files = const [],
    String? subject,
  }) async {
    try {
      if (files.isEmpty) {
        await Share.share(text, subject: subject);
      } else {
        await Share.shareXFiles(
          files.map((f) => XFile(f)).toList(),
          text: text,
          subject: subject,
        );
      }
    } catch (e) {
      debugPrint('[ShareService] Error sharing multiple items: $e');
    }
  }
}
