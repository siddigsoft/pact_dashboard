// lib/models/monitoring_action.dart
// Data model for system monitoring actions

import 'package:hive/hive.dart';
import 'package:flutter/material.dart';

@HiveType(typeId: 40)
class MonitoringAction extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String type; // 'mmp_lifecycle', 'site_visits', 'cost_reimbursements', etc.

  @HiveField(2)
  final String senderId;

  @HiveField(3)
  final String senderName;

  @HiveField(4)
  final String? senderAvatar;

  @HiveField(5)
  final String? category;

  @HiveField(6)
  final String status; // 'PENDING', 'FORWARDED', 'APPROVED', 'REJECTED', 'RETURNED'

  @HiveField(7)
  final String? details;

  @HiveField(8)
  final DateTime createdAt;

  @HiveField(9)
  final DateTime? updatedAt;

  @HiveField(10)
  final String? sourceTable;

  @HiveField(11)
  final String? sourceId;

  @HiveField(12)
  final bool isOnline;

  @HiveField(13)
  final List<String> statusHistory; // Timeline of status changes

  @HiveField(14)
  final String? notes;

  @HiveField(15)
  final String adminAwareness; // 'acted', 'ignored', 'no_response'

  @HiveField(16)
  final DateTime? acknowledgedAt;

  @HiveField(17)
  final String? receiptUrl; // URL/path to receipt document

  @HiveField(18)
  final String? receiptFileName; // Original file name of receipt

  @HiveField(19)
  final String? receiptType; // 'pdf', 'image', 'document', etc.

  MonitoringAction({
    required this.id,
    required this.type,
    required this.senderId,
    required this.senderName,
    this.senderAvatar,
    this.category,
    required this.status,
    this.details,
    required this.createdAt,
    this.updatedAt,
    this.sourceTable,
    this.sourceId,
    this.isOnline = false,
    this.statusHistory = const [],
    this.notes,
    this.adminAwareness = 'no_response',
    this.acknowledgedAt,
    this.receiptUrl,
    this.receiptFileName,
    this.receiptType,
  });

  /// Friendly category label
  String get categoryLabel {
    switch (type) {
      case 'mmp_lifecycle':
        return 'MMP Lifecycle';
      case 'site_visits':
        return 'Site Visits';
      case 'cost_reimbursements':
        return 'Cost Reimbursements';
      case 'advance_payments':
        return 'Advance Payments';
      case 'operational_costs':
        return 'Operational Costs';
      case 'wallet_withdrawals':
        return 'Wallet Withdrawals';
      case 'feedback':
        return 'Feedback';
      case 'role_changes':
        return 'Role Changes';
      default:
        return type;
    }
  }

  /// Friendly status label
  String get statusLabel {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'FORWARDED':
        return 'Forwarded';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'RETURNED':
        return 'Returned';
      default:
        return status;
    }
  }

  /// Status color indicator
  /// - Green for approved/acted
  /// - Red for rejected
  /// - Orange for pending/forwarded
  /// - Grey for ignored
  Color get statusColor {
    switch (status) {
      case 'APPROVED':
        return const Color(0xFF4CAF50); // Green
      case 'REJECTED':
        return const Color(0xFFF44336); // Red
      case 'RETURNED':
        return const Color(0xFFFF9800); // Orange
      case 'PENDING':
      case 'FORWARDED':
        return const Color(0xFFFFC107); // Amber
      default:
        return const Color(0xFF9E9E9E); // Grey
    }
  }

  /// Time elapsed since creation
  String get timeElapsed {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

    if (difference.inSeconds < 60) {
      return '${difference.inSeconds}s ago';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else {
      return '${(difference.inDays / 7).floor()}w ago';
    }
  }

  /// Convert to Map for JSON serialization
  Map<String, dynamic> toMap() => {
    'id': id,
    'type': type,
    'sender_id': senderId,
    'sender_name': senderName,
    'sender_avatar': senderAvatar,
    'category': category,
    'status': status,
    'details': details,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt?.toIso8601String(),
    'source_table': sourceTable,
    'source_id': sourceId,
    'is_online': isOnline,
    'status_history': statusHistory,
    'notes': notes,
    'admin_awareness': adminAwareness,
    'acknowledged_at': acknowledgedAt?.toIso8601String(),
    'receipt_url': receiptUrl,
    'receipt_file_name': receiptFileName,
    'receipt_type': receiptType,
  };

  /// Create instance from Map (Supabase response)
  factory MonitoringAction.fromMap(Map<String, dynamic> map) {
    return MonitoringAction(
      id: map['id'] as String? ?? '',
      type: map['type'] as String? ?? '',
      senderId: map['sender_id'] as String? ?? '',
      senderName: map['sender_name'] as String? ?? 'Unknown',
      senderAvatar: map['sender_avatar'] as String?,
      category: map['category'] as String?,
      status: map['status'] as String? ?? 'PENDING',
      details: map['details'] as String?,
      createdAt: map['created_at'] != null
          ? DateTime.parse(map['created_at'] as String)
          : DateTime.now(),
      updatedAt: map['updated_at'] != null
          ? DateTime.parse(map['updated_at'] as String)
          : null,
      sourceTable: map['source_table'] as String?,
      sourceId: map['source_id'] as String?,
      isOnline: map['is_online'] as bool? ?? false,
      statusHistory: List<String>.from(
        (map['status_history'] as List<dynamic>?)?.cast<String>() ?? [],
      ),
      notes: map['notes'] as String?,
      adminAwareness: map['admin_awareness'] as String? ?? 'no_response',
      acknowledgedAt: map['acknowledged_at'] != null
          ? DateTime.parse(map['acknowledged_at'] as String)
          : null,
      receiptUrl: map['receipt_url'] as String?,
      receiptFileName: map['receipt_file_name'] as String?,
      receiptType: map['receipt_type'] as String?,
    );
  }

  /// Create a copy with updated fields
  MonitoringAction copyWith({
    String? id,
    String? type,
    String? senderId,
    String? senderName,
    String? senderAvatar,
    String? category,
    String? status,
    String? details,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? sourceTable,
    String? sourceId,
    bool? isOnline,
    List<String>? statusHistory,
    String? notes,
    String? adminAwareness,
    DateTime? acknowledgedAt,
    String? receiptUrl,
    String? receiptFileName,
    String? receiptType,
  }) {
    return MonitoringAction(
      id: id ?? this.id,
      type: type ?? this.type,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      senderAvatar: senderAvatar ?? this.senderAvatar,
      category: category ?? this.category,
      status: status ?? this.status,
      details: details ?? this.details,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      sourceTable: sourceTable ?? this.sourceTable,
      sourceId: sourceId ?? this.sourceId,
      isOnline: isOnline ?? this.isOnline,
      statusHistory: statusHistory ?? this.statusHistory,
      notes: notes ?? this.notes,
      adminAwareness: adminAwareness ?? this.adminAwareness,
      acknowledgedAt: acknowledgedAt ?? this.acknowledgedAt,
      receiptUrl: receiptUrl ?? this.receiptUrl,
      receiptFileName: receiptFileName ?? this.receiptFileName,
      receiptType: receiptType ?? this.receiptType,
    );
  }
}
