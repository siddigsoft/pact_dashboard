// lib/models/report_model.dart
import 'package:uuid/uuid.dart';

class Report {
  final String id;
  final String visitId;
  final String notes;
  final List<String> photoUrls;
  final DateTime createdAt;
  final bool isSynced;

  Report({
    String? id,
    required this.visitId,
    required this.notes,
    List<String>? photoUrls,
    DateTime? createdAt,
    this.isSynced = false,
  })  : id = id ?? const Uuid().v4(),
        photoUrls = photoUrls ?? [],
        createdAt = createdAt ?? DateTime.now();

  // Convert Report to a Map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'visitId': visitId,
      'notes': notes,
      'photoUrls': photoUrls.join(','),
      'createdAt': createdAt.toIso8601String(),
      'isSynced': isSynced ? 1 : 0,
    };
  }

  // Create Report from a Map
  factory Report.fromMap(Map<String, dynamic> map) {
    return Report(
      id: map['id'],
      visitId: map['visitId'],
      notes: map['notes'],
      photoUrls: map['photoUrls'] != null && map['photoUrls'].isNotEmpty
          ? map['photoUrls'].split(',')
          : [],
      createdAt: DateTime.parse(map['createdAt']),
      isSynced: map['isSynced'] == 1,
    );
  }

  // Clone with new values
  Report copyWith({
    String? visitId,
    String? notes,
    List<String>? photoUrls,
    DateTime? createdAt,
    bool? isSynced,
  }) {
    return Report(
      id: id,
      visitId: visitId ?? this.visitId,
      notes: notes ?? this.notes,
      photoUrls: photoUrls ?? List.from(this.photoUrls),
      createdAt: createdAt ?? this.createdAt,
      isSynced: isSynced ?? this.isSynced,
    );
  }

  // Add a photo to the report
  Report addPhoto(String photoUrl) {
    final updatedPhotos = List<String>.from(photoUrls)..add(photoUrl);
    return copyWith(photoUrls: updatedPhotos);
  }

  // Remove a photo from the report
  Report removePhoto(String photoUrl) {
    final updatedPhotos = List<String>.from(photoUrls)..remove(photoUrl);
    return copyWith(photoUrls: updatedPhotos);
  }
}
