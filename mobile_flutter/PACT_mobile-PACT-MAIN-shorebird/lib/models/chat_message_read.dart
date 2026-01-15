class ChatMessageRead {
  String messageId;
  String userId;
  DateTime readAt;

  ChatMessageRead({
    required this.messageId,
    required this.userId,
    required this.readAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'message_id': messageId,
      'user_id': userId,
      'read_at': readAt.toIso8601String(),
    };
  }

  factory ChatMessageRead.fromJson(Map<String, dynamic> json) {
    return ChatMessageRead(
      messageId: json['message_id'],
      userId: json['user_id'],
      readAt: DateTime.parse(json['read_at']),
    );
  }
}
