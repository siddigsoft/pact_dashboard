class MessageReaction {
  final String id;
  final String messageId;
  final String userId;
  final String userName;
  final String emoji;
  final DateTime createdAt;

  MessageReaction({
    required this.id,
    required this.messageId,
    required this.userId,
    required this.userName,
    required this.emoji,
    required this.createdAt,
  });

  factory MessageReaction.fromJson(Map<String, dynamic> json) {
    String userName = '';
    if (json['profiles'] != null && json['profiles'] is Map) {
      final profile = json['profiles'] as Map;
      userName = profile['full_name']?.toString() ?? 
                 profile['username']?.toString() ?? 
                 profile['email']?.toString() ?? '';
    }
    
    return MessageReaction(
      id: json['id']?.toString() ?? '',
      messageId: json['message_id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      userName: userName,
      emoji: json['emoji']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'message_id': messageId,
      'user_id': userId,
      'emoji': emoji,
      'created_at': createdAt.toIso8601String(),
    };
  }
}

class ReactionSummary {
  final String emoji;
  final int count;
  final List<String> userNames;
  final bool currentUserReacted;

  ReactionSummary({
    required this.emoji,
    required this.count,
    required this.userNames,
    required this.currentUserReacted,
  });
}
