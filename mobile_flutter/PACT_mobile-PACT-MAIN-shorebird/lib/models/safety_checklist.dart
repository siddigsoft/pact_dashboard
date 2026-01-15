class SafetyChecklist {
  String id;
  String userId;
  String? siteVisitId;
  String checklistType; // 'pre_visit', 'during_visit', 'post_visit', 'equipment_check'
  List<Map<String, dynamic>> items; // JSON array of checklist items with status
  DateTime? completedAt;
  DateTime createdAt;
  DateTime updatedAt;

  SafetyChecklist({
    required this.id,
    required this.userId,
    this.siteVisitId,
    required this.checklistType,
    required this.items,
    this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'site_visit_id': siteVisitId,
      'checklist_type': checklistType,
      'items': items,
      'completed_at': completedAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory SafetyChecklist.fromJson(Map<String, dynamic> json) {
    return SafetyChecklist(
      id: json['id'],
      userId: json['user_id'],
      siteVisitId: json['site_visit_id'],
      checklistType: json['checklist_type'],
      items: List<Map<String, dynamic>>.from(json['items'] ?? []),
      completedAt: json['completed_at'] != null ? DateTime.parse(json['completed_at']) : null,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }
}
