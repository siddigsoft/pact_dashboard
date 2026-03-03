/// Support Ticket model for mobile app
/// Maps to Supabase `support_tickets` table
class SupportTicket {
  final String id;
  final String userId;
  final String subject;
  final String description;
  final String category;
  final String priority; // low, medium, high, urgent
  final String status; // open, in_progress, waiting, resolved, closed
  final String source; // mobile, web
  final String? assignedTo;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? resolvedAt;

  SupportTicket({
    required this.id,
    required this.userId,
    required this.subject,
    required this.description,
    this.category = 'general',
    this.priority = 'medium',
    this.status = 'open',
    this.source = 'mobile',
    this.assignedTo,
    required this.createdAt,
    required this.updatedAt,
    this.resolvedAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      subject: json['subject'] as String,
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? 'general',
      priority: json['priority'] as String? ?? 'medium',
      status: json['status'] as String? ?? 'open',
      source: json['source'] as String? ?? 'mobile',
      assignedTo: json['assigned_to'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      resolvedAt: json['resolved_at'] != null
          ? DateTime.parse(json['resolved_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'subject': subject,
      'description': description,
      'category': category,
      'priority': priority,
      'status': status,
      'source': source,
    };
  }

  SupportTicket copyWith({
    String? status,
    String? priority,
    String? category,
    DateTime? resolvedAt,
  }) {
    return SupportTicket(
      id: id,
      userId: userId,
      subject: subject,
      description: description,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      status: status ?? this.status,
      source: source,
      assignedTo: assignedTo,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
      resolvedAt: resolvedAt ?? this.resolvedAt,
    );
  }

  bool get isOpen => status == 'open';
  bool get isResolved => status == 'resolved' || status == 'closed';
  bool get isUrgent => priority == 'urgent';

  String get statusLabel {
    switch (status) {
      case 'open':
        return 'Open';
      case 'in_progress':
        return 'In Progress';
      case 'waiting':
        return 'Waiting';
      case 'resolved':
        return 'Resolved';
      case 'closed':
        return 'Closed';
      default:
        return status;
    }
  }

  String get priorityLabel {
    switch (priority) {
      case 'urgent':
        return 'Urgent';
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return priority;
    }
  }

  String get categoryLabel {
    switch (category) {
      case 'general':
        return 'General';
      case 'technical':
        return 'Technical Issue';
      case 'login':
        return 'Login / Access';
      case 'sync':
        return 'Data Sync';
      case 'gps':
        return 'GPS / Location';
      case 'offline':
        return 'Offline Mode';
      case 'payment':
        return 'Payment / Wallet';
      case 'site_visit':
        return 'Site Visit';
      case 'mmp':
        return 'MMP / Planning';
      case 'feature_request':
        return 'Feature Request';
      case 'other':
        return 'Other';
      default:
        return category;
    }
  }
}

/// Ticket Message model
/// Maps to Supabase `ticket_messages` table
class TicketMessage {
  final String id;
  final String ticketId;
  final String senderId;
  final String senderName;
  final String message;
  final bool isAdmin;
  final DateTime createdAt;

  TicketMessage({
    required this.id,
    required this.ticketId,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.isAdmin,
    required this.createdAt,
  });

  factory TicketMessage.fromJson(Map<String, dynamic> json) {
    return TicketMessage(
      id: json['id'] as String,
      ticketId: json['ticket_id'] as String,
      senderId: json['sender_id'] as String,
      senderName: json['sender_name'] as String? ?? 'Unknown',
      message: json['message'] as String,
      isAdmin: json['is_admin'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'ticket_id': ticketId,
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'is_admin': isAdmin,
    };
  }
}
