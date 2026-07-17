class DailyTaskDefinition {
  final String id;
  final String title;
  final String? priority;
  final bool isActive;
  final String? recurrence;
  final double? rewardAmount;

  const DailyTaskDefinition({
    required this.id,
    required this.title,
    this.priority,
    this.isActive = true,
    this.recurrence,
    this.rewardAmount,
  });

  factory DailyTaskDefinition.fromJson(Map<String, dynamic> json) {
    return DailyTaskDefinition(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      priority: json['priority']?.toString(),
      isActive: json['is_active'] as bool? ?? true,
      recurrence: json['recurrence']?.toString(),
      rewardAmount: (json['completion_reward_amount'] as num?)?.toDouble(),
    );
  }
}
