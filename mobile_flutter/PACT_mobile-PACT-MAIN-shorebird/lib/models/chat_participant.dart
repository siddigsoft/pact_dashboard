class ChatParticipant {
  String chatId;
  String userId;
  String? userName; // User's display name
  DateTime joinedAt;

  ChatParticipant({
    required this.chatId,
    required this.userId,
    this.userName,
    required this.joinedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'chat_id': chatId,
      'user_id': userId,
      'user_name': userName,
      'joined_at': joinedAt.toIso8601String(),
    };
  }

  factory ChatParticipant.fromJson(Map<String, dynamic> json) {
    return ChatParticipant(
      chatId: json['chat_id'],
      userId: json['user_id'],
      userName: json['user_name'],
      joinedAt: DateTime.parse(json['joined_at']),
    );
  }
}
