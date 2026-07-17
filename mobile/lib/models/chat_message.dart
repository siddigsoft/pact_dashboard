class ChatMessage {
  String id;
  String chatId;
  String senderId;
  String? content;
  String contentType; // 'text', 'image', 'file', 'location', 'audio'
  Map<String, dynamic>? attachments;
  Map<String, dynamic>? metadata;
  String status; // 'sent', 'delivered', 'read', 'failed'
  DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.chatId,
    required this.senderId,
    this.content,
    required this.contentType,
    this.attachments,
    this.metadata,
    required this.status,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'chat_id': chatId,
      'sender_id': senderId,
      'content': content,
      'content_type': contentType,
      'attachments': attachments,
      'metadata': metadata,
      'status': status,
      'created_at': createdAt.toIso8601String(),
    };
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'],
      chatId: json['chat_id'],
      senderId: json['sender_id'],
      content: json['content'],
      contentType: json['content_type'] ?? 'text',
      attachments: json['attachments'] != null
          ? Map<String, dynamic>.from(json['attachments'])
          : null,
      metadata: json['metadata'] != null
          ? Map<String, dynamic>.from(json['metadata'])
          : null,
      status: json['status'] ?? 'sent',
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}
