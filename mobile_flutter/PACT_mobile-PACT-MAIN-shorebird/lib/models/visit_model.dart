// lib/models/visit_model.dart
import 'package:uuid/uuid.dart';
import 'location_log_model.dart';

enum VisitStatus {
  pending,
  available,
  assigned,
  inProgress,
  completed,
  rejected,
  cancelled,
}

class Visit {
  final String id;
  final String title;
  final String description;
  final double? latitude;
  final double? longitude;
  final DateTime? scheduledDate;
  VisitStatus status;
  String? assignedToId;
  String? assignedUserId;
  DateTime? startTime;
  DateTime? endTime;
  List<LocationLog>? locationLogs;
  String? reportId;
  bool isSynced;
  DateTime? lastModified;

  // Additional fields for UI
  String? location;
  String? address;
  String? clientInfo;
  String? notes;
  String? priority;

  Visit({
    String? id,
    required this.title,
    required this.description,
    this.latitude,
    this.longitude,
    this.scheduledDate,
    this.status = VisitStatus.available,
    this.assignedToId,
    this.assignedUserId,
    this.startTime,
    this.endTime,
    this.locationLogs,
    this.reportId,
    this.isSynced = false,
    this.lastModified,
    this.location,
    this.address,
    this.clientInfo,
    this.notes,
    this.priority,
  }) : id = id ?? const Uuid().v4() {
    locationLogs ??= [];
    lastModified ??= DateTime.now();
  }

  // Convert Visit to a Map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'scheduledDate': scheduledDate?.toIso8601String(),
      'status': status.toString(),
      'assignedToId': assignedToId,
      'assignedUserId': assignedUserId,
      'startTime': startTime?.toIso8601String(),
      'endTime': endTime?.toIso8601String(),
      'reportId': reportId,
      'isSynced': isSynced ? 1 : 0,
      'lastModified': lastModified?.toIso8601String(),
      'location': location,
      'address': address,
      'clientInfo': clientInfo,
      'notes': notes,
      'priority': priority,
    };
  }

  // Create Visit from a Map
  factory Visit.fromMap(Map<String, dynamic> map) {
    return Visit(
      id: map['id'],
      title: map['title'],
      description: map['description'],
      latitude: map['latitude'],
      longitude: map['longitude'],
      scheduledDate: map['scheduledDate'] != null
          ? DateTime.parse(map['scheduledDate'])
          : null,
      status: VisitStatus.values.firstWhere(
        (e) => e.toString() == map['status'],
        orElse: () => VisitStatus.available,
      ),
      assignedToId: map['assignedToId'],
      assignedUserId: map['assignedUserId'],
      startTime:
          map['startTime'] != null ? DateTime.parse(map['startTime']) : null,
      endTime: map['endTime'] != null ? DateTime.parse(map['endTime']) : null,
      reportId: map['reportId'],
      isSynced: map['isSynced'] == 1,
      lastModified: map['lastModified'] != null
          ? DateTime.parse(map['lastModified'])
          : DateTime.now(),
    )
      ..location = map['location']
      ..address = map['address']
      ..clientInfo = map['clientInfo']
      ..notes = map['notes']
      ..priority = map['priority'];
  }

  // Clone with new values
  Visit copyWith({
    String? title,
    String? description,
    double? latitude,
    double? longitude,
    DateTime? scheduledDate,
    VisitStatus? status,
    String? assignedToId,
    String? assignedUserId,
    DateTime? startTime,
    DateTime? endTime,
    List<LocationLog>? locationLogs,
    String? reportId,
    bool? isSynced,
    DateTime? lastModified,
    String? location,
    String? address,
    String? clientInfo,
    String? notes,
    String? priority,
  }) {
    return Visit(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      scheduledDate: scheduledDate ?? this.scheduledDate,
      status: status ?? this.status,
      assignedToId: assignedToId ?? this.assignedToId,
      assignedUserId: assignedUserId ?? this.assignedUserId,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      locationLogs: locationLogs ?? this.locationLogs,
      reportId: reportId ?? this.reportId,
      isSynced: isSynced ?? this.isSynced,
      lastModified: DateTime.now(),
      location: location ?? this.location,
      address: address ?? this.address,
      clientInfo: clientInfo ?? this.clientInfo,
      notes: notes ?? this.notes,
      priority: priority ?? this.priority,
    );
  }
}
