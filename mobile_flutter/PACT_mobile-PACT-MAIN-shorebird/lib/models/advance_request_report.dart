import 'package:flutter/material.dart';

class AdvanceRequestData {
  final String id;
  final String siteVisitId;
  final String mmpSiteEntryId;
  final String siteName;
  final String requestedBy;
  final DateTime requestedAt;
  final String requesterRole;
  final String? hubId;
  final String? hubName;
  final double totalTransportationBudget;
  final double requestedAmount;
  final String paymentType;
  final String justification;
  final String? supervisorId;
  final String? supervisorStatus;
  final String? supervisorApprovedBy;
  final DateTime? supervisorApprovedAt;
  final String? supervisorNotes;
  final String? supervisorRejectionReason;
  final String? adminStatus;
  final String? adminProcessedBy;
  final DateTime? adminProcessedAt;
  final String? adminNotes;
  final String? adminRejectionReason;
  final String status;
  final double totalPaidAmount;
  final double? remainingAmount;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? stateName;
  final String? projectName;
  final String? requesterName;
  final String? requesterEmail;
  final Map<String, dynamic>? metadata;

  bool get isReceiptConfirmed {
    if (metadata == null) return false;
    final rc = metadata!['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['confirmed'] == true;
  }

  String? get receiptConfirmedAt {
    if (metadata == null) return null;
    final rc = metadata!['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['confirmedAt'] as String?;
  }

  String? get receiptSignatureMethod {
    if (metadata == null) return null;
    final rc = metadata!['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['signatureMethod'] as String?;
  }

  AdvanceRequestData({
    required this.id,
    required this.siteVisitId,
    this.mmpSiteEntryId = '',
    this.siteName = '',
    required this.requestedBy,
    required this.requestedAt,
    this.requesterRole = 'dataCollector',
    this.hubId,
    this.hubName,
    this.totalTransportationBudget = 0.0,
    this.requestedAmount = 0.0,
    this.paymentType = 'full_advance',
    this.justification = '',
    this.supervisorId,
    this.supervisorStatus,
    this.supervisorApprovedBy,
    this.supervisorApprovedAt,
    this.supervisorNotes,
    this.supervisorRejectionReason,
    this.adminStatus,
    this.adminProcessedBy,
    this.adminProcessedAt,
    this.adminNotes,
    this.adminRejectionReason,
    this.status = 'pending_supervisor',
    this.totalPaidAmount = 0.0,
    this.remainingAmount,
    required this.createdAt,
    required this.updatedAt,
    this.stateName,
    this.projectName,
    this.requesterName,
    this.requesterEmail,
    this.metadata,
  });

  factory AdvanceRequestData.fromJson(Map<String, dynamic> json) {
    final profile = json['profiles'] as Map<String, dynamic>?;
    final mmpEntry = json['mmp_site_entries'] as Map<String, dynamic>?;
    
    return AdvanceRequestData(
      id: json['id'] as String? ?? '',
      siteVisitId: json['site_visit_id'] as String? ?? '',
      mmpSiteEntryId: json['mmp_site_entry_id'] as String? ?? '',
      siteName: json['site_name'] as String? ?? '',
      requestedBy: json['requested_by'] as String? ?? '',
      requestedAt: DateTime.tryParse(json['requested_at'] as String? ?? '') ?? DateTime.now(),
      requesterRole: json['requester_role'] as String? ?? 'dataCollector',
      hubId: json['hub_id'] as String?,
      hubName: json['hub_name'] as String?,
      totalTransportationBudget: (json['total_transportation_budget'] as num?)?.toDouble() ?? 0.0,
      requestedAmount: (json['requested_amount'] as num?)?.toDouble() ?? 0.0,
      paymentType: json['payment_type'] as String? ?? 'full_advance',
      justification: json['justification'] as String? ?? '',
      supervisorId: json['supervisor_id'] as String?,
      supervisorStatus: json['supervisor_status'] as String?,
      supervisorApprovedBy: json['supervisor_approved_by'] as String?,
      supervisorApprovedAt: json['supervisor_approved_at'] != null 
          ? DateTime.tryParse(json['supervisor_approved_at'] as String) 
          : null,
      supervisorNotes: json['supervisor_notes'] as String?,
      supervisorRejectionReason: json['supervisor_rejection_reason'] as String?,
      adminStatus: json['admin_status'] as String?,
      adminProcessedBy: json['admin_processed_by'] as String?,
      adminProcessedAt: json['admin_processed_at'] != null 
          ? DateTime.tryParse(json['admin_processed_at'] as String) 
          : null,
      adminNotes: json['admin_notes'] as String?,
      adminRejectionReason: json['admin_rejection_reason'] as String?,
      status: json['status'] as String? ?? 'pending_supervisor',
      totalPaidAmount: (json['total_paid_amount'] as num?)?.toDouble() ?? 0.0,
      remainingAmount: (json['remaining_amount'] as num?)?.toDouble(),
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? '') ?? DateTime.now(),
      stateName: mmpEntry?['state'] as String?,
      projectName: mmpEntry?['cp_name'] as String?,
      requesterName: profile?['full_name'] as String? ?? profile?['username'] as String?,
      requesterEmail: profile?['email'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }
}

class ReportGroupData {
  final String name;
  final int requests;
  final double totalRequested;
  final double totalApproved;
  final int pending;

  ReportGroupData({
    required this.name,
    required this.requests,
    required this.totalRequested,
    required this.totalApproved,
    required this.pending,
  });
}

class ReportStats {
  final double totalRequested;
  final double totalApproved;
  final double totalPending;
  final double totalRejected;
  final int totalCount;
  final int approvedCount;
  final int pendingCount;
  final int rejectedCount;

  ReportStats({
    this.totalRequested = 0,
    this.totalApproved = 0,
    this.totalPending = 0,
    this.totalRejected = 0,
    this.totalCount = 0,
    this.approvedCount = 0,
    this.pendingCount = 0,
    this.rejectedCount = 0,
  });
}

class StatusBadgeInfo {
  final String label;
  final Color color;
  final IconData icon;

  StatusBadgeInfo({
    required this.label,
    required this.color,
    required this.icon,
  });

  static StatusBadgeInfo fromStatus(String status) {
    switch (status.toLowerCase()) {
      case 'pending_supervisor':
        return StatusBadgeInfo(
          label: 'Pending Supervisor',
          color: Colors.orange,
          icon: Icons.access_time,
        );
      case 'pending_admin':
        return StatusBadgeInfo(
          label: 'Pending Admin',
          color: Colors.blue,
          icon: Icons.access_time,
        );
      case 'approved':
        return StatusBadgeInfo(
          label: 'Approved',
          color: Colors.green,
          icon: Icons.check_circle,
        );
      case 'rejected':
        return StatusBadgeInfo(
          label: 'Rejected',
          color: Colors.red,
          icon: Icons.cancel,
        );
      case 'partially_paid':
        return StatusBadgeInfo(
          label: 'Partial Payment',
          color: Colors.blue,
          icon: Icons.payment,
        );
      case 'fully_paid':
        return StatusBadgeInfo(
          label: 'Paid',
          color: Colors.green,
          icon: Icons.check_circle,
        );
      case 'cancelled':
        return StatusBadgeInfo(
          label: 'Cancelled',
          color: Colors.grey,
          icon: Icons.cancel,
        );
      default:
        return StatusBadgeInfo(
          label: status.replaceAll('_', ' '),
          color: Colors.grey,
          icon: Icons.info,
        );
    }
  }
}
