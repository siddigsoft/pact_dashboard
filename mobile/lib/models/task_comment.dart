class TaskComment {
  final String id;
  final String taskId;
  final String userId;
  final String content;
  final String? authorName;
  final DateTime createdAt;

  const TaskComment({
    required this.id,
    required this.taskId,
    required this.userId,
    required this.content,
    this.authorName,
    required this.createdAt,
  });

  factory TaskComment.fromJson(Map<String, dynamic> json) {
    final profile = json['profiles'];
    String? name;
    if (profile is Map) {
      name = profile['full_name']?.toString();
    }
    return TaskComment(
      id: json['id']?.toString() ?? '',
      taskId: json['task_id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      authorName: name ?? json['author_name']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}
