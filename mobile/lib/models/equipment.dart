// lib/models/equipment.dart

class Equipment {
  final String id;
  final String name;
  final String status;
  bool isCheckedIn;
  final String nextMaintenance;
  final List<Inspection>? inspections;

  Equipment({
    required this.id,
    required this.name,
    required this.status,
    required this.isCheckedIn,
    required this.nextMaintenance,
    this.inspections,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'status': status,
      'isCheckedIn': isCheckedIn,
      'nextMaintenance': nextMaintenance,
      'inspections': inspections?.map((i) => i.toJson()).toList(),
    };
  }

  factory Equipment.fromJson(Map<String, dynamic> json) {
    return Equipment(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      isCheckedIn: json['isCheckedIn'],
      nextMaintenance: json['nextMaintenance'],
      inspections: (json['inspections'] as List?)
          ?.map((i) => Inspection.fromJson(i))
          .toList(),
    );
  }
}

class Inspection {
  final String id;
  final String date;
  final String condition;
  final String concerns;
  final String recommendations;

  Inspection({
    required this.id,
    required this.date,
    required this.condition,
    required this.concerns,
    required this.recommendations,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'date': date,
      'condition': condition,
      'concerns': concerns,
      'recommendations': recommendations,
    };
  }

  factory Inspection.fromJson(Map<String, dynamic> json) {
    return Inspection(
      id: json['id'],
      date: json['date'],
      condition: json['condition'],
      concerns: json['concerns'],
      recommendations: json['recommendations'],
    );
  }
}
