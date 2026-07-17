import 'package:flutter/material.dart';

import 'task_output_file.dart';

enum PersonalTaskPriority { low, medium, high, critical }

enum PersonalTaskStatus {
  todo,
  inprogress,
  onHold,
  rescheduled,
  done,
  cancelled,
}

class TaskAssignee {
  final String id;
  final String name;
  final String? email;
  final double? hours;
  final DateTime? acknowledgedAt;
  final String? acknowledgedBy;

  const TaskAssignee({
    required this.id,
    required this.name,
    this.email,
    this.hours,
    this.acknowledgedAt,
    this.acknowledgedBy,
  });

  factory TaskAssignee.fromJson(Map<String, dynamic> json) {
    return TaskAssignee(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString(),
      hours: (json['hours'] as num?)?.toDouble(),
      acknowledgedAt: PersonalTask._parseDate(json['acknowledged_at']),
      acknowledgedBy: json['acknowledged_by']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (email != null) 'email': email,
    if (hours != null) 'hours': hours,
    if (acknowledgedAt != null)
      'acknowledged_at': acknowledgedAt!.toIso8601String(),
    if (acknowledgedBy != null) 'acknowledged_by': acknowledgedBy,
  };

  TaskAssignee copyWithAcknowledgement(String userId) {
    return TaskAssignee(
      id: id,
      name: name,
      email: email,
      hours: hours,
      acknowledgedAt: DateTime.now().toUtc(),
      acknowledgedBy: userId,
    );
  }
}

class PersonalTask {
  final String id;
  final String userId;
  final String? assignedTo;
  final String? assignedToName;
  final List<TaskAssignee> coAssignees;
  final String title;
  final String? description;
  final PersonalTaskPriority priority;
  final PersonalTaskStatus status;
  final DateTime? dueDate;
  final String? category;
  final List<String>? tags;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final double? completionRewardAmount;
  final String completionRewardCurrency;
  final bool proofRequired;
  final String? proofNote;
  final String? proofFileUrl;
  final DateTime? proofSubmittedAt;
  final double? estimatedHours;
  final int? startEstimatedDays;
  final String? startRequirements;
  final double? actualHours;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? acknowledgedAt;
  final String? acknowledgedBy;
  final String? outputText;
  final String? projectId;
  final String? parentTaskId;
  final String? recurrence;
  final String? planningQuadrant;
  final String? descriptionHtml;
  final List<TaskOutputFile> outputFiles;
  final String? approvalStage;
  final bool isProjectAdapter;

  const PersonalTask({
    required this.id,
    required this.userId,
    this.assignedTo,
    this.assignedToName,
    this.coAssignees = const [],
    required this.title,
    this.description,
    this.priority = PersonalTaskPriority.medium,
    this.status = PersonalTaskStatus.todo,
    this.dueDate,
    this.category,
    this.tags,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
    this.completionRewardAmount,
    this.completionRewardCurrency = 'USD',
    this.proofRequired = false,
    this.proofNote,
    this.proofFileUrl,
    this.proofSubmittedAt,
    this.estimatedHours,
    this.startEstimatedDays,
    this.startRequirements,
    this.actualHours,
    this.startedAt,
    this.completedAt,
    this.acknowledgedAt,
    this.acknowledgedBy,
    this.outputText,
    this.projectId,
    this.parentTaskId,
    this.recurrence,
    this.planningQuadrant,
    this.descriptionHtml,
    this.outputFiles = const [],
    this.approvalStage,
    this.isProjectAdapter = false,
  });

  String get displayDescription {
    if (descriptionHtml != null && descriptionHtml!.trim().isNotEmpty) {
      return descriptionHtml!;
    }
    return description ?? '';
  }

  bool get isSubtask => parentTaskId != null && parentTaskId!.isNotEmpty;
  bool get isRecurring =>
      recurrence != null && recurrence != 'none' && recurrence!.isNotEmpty;

  bool get isActive =>
      status != PersonalTaskStatus.done &&
      status != PersonalTaskStatus.cancelled;

  bool get isOverdue {
    if (dueDate == null || !isActive) return false;
    final today = DateTime.now();
    final due = DateTime(dueDate!.year, dueDate!.month, dueDate!.day);
    final now = DateTime(today.year, today.month, today.day);
    return due.isBefore(now);
  }

  bool get isDueToday {
    if (dueDate == null) return false;
    final today = DateTime.now();
    return dueDate!.year == today.year &&
        dueDate!.month == today.month &&
        dueDate!.day == today.day;
  }

  factory PersonalTask.fromJson(Map<String, dynamic> json) {
    return PersonalTask(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      assignedTo: json['assigned_to']?.toString(),
      assignedToName: json['assigned_to_name']?.toString(),
      coAssignees: _parseCoAssignees(json['co_assignees']),
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      priority: _parsePriority(json['priority']?.toString()),
      status: _parseStatus(json['status']?.toString()),
      dueDate: _parseDate(json['due_date']),
      category: json['category']?.toString(),
      tags: json['tags'] != null
          ? List<String>.from((json['tags'] as List).map((e) => e.toString()))
          : null,
      notes: json['notes']?.toString(),
      createdAt:
          _parseDate(json['created_at']) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      updatedAt:
          _parseDate(json['updated_at']) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      completionRewardAmount: (json['completion_reward_amount'] as num?)
          ?.toDouble(),
      completionRewardCurrency:
          json['completion_reward_currency']?.toString() ?? 'USD',
      proofRequired: json['proof_required'] as bool? ?? false,
      proofNote: json['proof_note']?.toString(),
      proofFileUrl: json['proof_file_url']?.toString(),
      proofSubmittedAt: _parseDate(json['proof_submitted_at']),
      estimatedHours: (json['estimated_hours'] as num?)?.toDouble(),
      startEstimatedDays: (json['start_estimated_days'] as num?)?.toInt(),
      startRequirements: json['start_requirements']?.toString(),
      actualHours: (json['actual_hours'] as num?)?.toDouble(),
      startedAt: _parseDate(json['started_at']),
      completedAt: _parseDate(json['completed_at']),
      acknowledgedAt: _parseDate(json['acknowledged_at']),
      acknowledgedBy: json['acknowledged_by']?.toString(),
      outputText: json['output_text']?.toString(),
      projectId: json['project_id']?.toString(),
      parentTaskId: json['parent_task_id']?.toString(),
      recurrence: json['recurrence']?.toString(),
      planningQuadrant: json['planning_quadrant']?.toString(),
      descriptionHtml: json['description_html']?.toString(),
      outputFiles: _parseOutputFiles(json['output_files']),
      approvalStage: json['approval_stage']?.toString(),
    );
  }

  static List<TaskOutputFile> _parseOutputFiles(dynamic raw) {
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => TaskOutputFile.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static List<TaskAssignee> _parseCoAssignees(dynamic raw) {
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => TaskAssignee.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }

  static PersonalTaskPriority _parsePriority(String? raw) {
    switch (raw) {
      case 'low':
        return PersonalTaskPriority.low;
      case 'high':
        return PersonalTaskPriority.high;
      case 'critical':
        return PersonalTaskPriority.critical;
      default:
        return PersonalTaskPriority.medium;
    }
  }

  static PersonalTaskStatus _parseStatus(String? raw) {
    switch (raw) {
      case 'inprogress':
        return PersonalTaskStatus.inprogress;
      case 'on_hold':
        return PersonalTaskStatus.onHold;
      case 'rescheduled':
        return PersonalTaskStatus.rescheduled;
      case 'done':
        return PersonalTaskStatus.done;
      case 'cancelled':
        return PersonalTaskStatus.cancelled;
      default:
        return PersonalTaskStatus.todo;
    }
  }

  static String statusToDb(PersonalTaskStatus status) {
    switch (status) {
      case PersonalTaskStatus.inprogress:
        return 'inprogress';
      case PersonalTaskStatus.onHold:
        return 'on_hold';
      case PersonalTaskStatus.rescheduled:
        return 'rescheduled';
      case PersonalTaskStatus.done:
        return 'done';
      case PersonalTaskStatus.cancelled:
        return 'cancelled';
      case PersonalTaskStatus.todo:
        return 'todo';
    }
  }

  static String priorityToDb(PersonalTaskPriority priority) {
    switch (priority) {
      case PersonalTaskPriority.low:
        return 'low';
      case PersonalTaskPriority.high:
        return 'high';
      case PersonalTaskPriority.critical:
        return 'critical';
      case PersonalTaskPriority.medium:
        return 'medium';
    }
  }

  static String statusLabel(PersonalTaskStatus status) {
    switch (status) {
      case PersonalTaskStatus.todo:
        return 'To Do';
      case PersonalTaskStatus.inprogress:
        return 'In Progress';
      case PersonalTaskStatus.onHold:
        return 'On Hold';
      case PersonalTaskStatus.rescheduled:
        return 'Rescheduled';
      case PersonalTaskStatus.done:
        return 'Finished';
      case PersonalTaskStatus.cancelled:
        return 'Cancelled';
    }
  }

  static Color statusColor(PersonalTaskStatus status) {
    switch (status) {
      case PersonalTaskStatus.todo:
        return const Color(0xFF64748B);
      case PersonalTaskStatus.inprogress:
        return const Color(0xFF2563EB);
      case PersonalTaskStatus.onHold:
        return const Color(0xFFD97706);
      case PersonalTaskStatus.rescheduled:
        return const Color(0xFF7C3AED);
      case PersonalTaskStatus.done:
        return const Color(0xFF059669);
      case PersonalTaskStatus.cancelled:
        return const Color(0xFFE11D48);
    }
  }

  static Color priorityColor(PersonalTaskPriority priority) {
    switch (priority) {
      case PersonalTaskPriority.low:
        return const Color(0xFF94A3B8);
      case PersonalTaskPriority.medium:
        return const Color(0xFF3B82F6);
      case PersonalTaskPriority.high:
        return const Color(0xFFF59E0B);
      case PersonalTaskPriority.critical:
        return const Color(0xFFDC2626);
    }
  }

  static String priorityLabel(PersonalTaskPriority priority) {
    switch (priority) {
      case PersonalTaskPriority.low:
        return 'Low';
      case PersonalTaskPriority.medium:
        return 'Medium';
      case PersonalTaskPriority.high:
        return 'High';
      case PersonalTaskPriority.critical:
        return 'Critical';
    }
  }

  /// Whether [userId] has acknowledged their slot (primary or co-assignee).
  bool isAcknowledgedBy(String userId) {
    if (assignedTo == userId) {
      return acknowledgedAt != null;
    }
    final slot = coAssignees.where((c) => c.id == userId).firstOrNull;
    return slot?.acknowledgedAt != null;
  }

  bool isAssignedTo(String userId) =>
      assignedTo == userId || coAssignees.any((c) => c.id == userId);

  bool needsAcknowledgement(String userId) =>
      isAssignedTo(userId) && !isAcknowledgedBy(userId);

  bool get hasProofSubmitted => proofSubmittedAt != null;

  bool get needsProofBeforeComplete => proofRequired && !hasProofSubmitted;

  /// True when multiple participants exist and someone has not acknowledged.
  bool hasPendingParticipantAcknowledgements(String actorId) {
    final slots = <String, String>{};
    if (assignedTo != null && assignedTo!.isNotEmpty) {
      slots[assignedTo!] = assignedToName ?? 'Assignee';
    }
    for (final c in coAssignees) {
      if (c.id.isNotEmpty) slots[c.id] = c.name;
    }
    if (slots.length <= 1) return false;
    if (assignedTo != null &&
        assignedTo != actorId &&
        acknowledgedAt == null) {
      return true;
    }
    for (final c in coAssignees) {
      if (c.id != actorId && c.acknowledgedAt == null) return true;
    }
    return false;
  }

  bool get canEdit => isActive && startedAt == null;

  bool isCreatedBy(String actorId) => userId == actorId;

  @override
  String toString() => 'PersonalTask($id, $title, ${status.name})';
}
