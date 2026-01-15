// lib/models/location_log_model.dart
import 'package:uuid/uuid.dart';

class LocationLog {
  final String id;
  final String? visitId;
  final String? userId;
  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final double? accuracy;
  final double? speed;
  final double? heading;
  final double? altitude;
  final bool isSynced;

  LocationLog({
    String? id,
    this.visitId,
    this.userId,
    required this.latitude,
    required this.longitude,
    DateTime? timestamp,
    this.accuracy,
    this.speed,
    this.heading,
    this.altitude,
    this.isSynced = false,
  })  : id = id ?? const Uuid().v4(),
        timestamp = timestamp ?? DateTime.now();

  // Convert LocationLog to a Map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'visitId': visitId,
      'userId': userId,
      'latitude': latitude,
      'longitude': longitude,
      'timestamp': timestamp.toIso8601String(),
      'accuracy': accuracy,
      'speed': speed,
      'heading': heading,
      'altitude': altitude,
      'isSynced': isSynced ? 1 : 0,
    };
  }

  // Create LocationLog from a Map
  factory LocationLog.fromMap(Map<String, dynamic> map) {
    return LocationLog(
      id: map['id'],
      visitId: map['visitId'],
      userId: map['userId'],
      latitude: map['latitude'],
      longitude: map['longitude'],
      timestamp: DateTime.parse(map['timestamp']),
      accuracy: map['accuracy'],
      speed: map['speed'],
      heading: map['heading'],
      altitude: map['altitude'],
      isSynced: map['isSynced'] == 1,
    );
  }

  // Clone with new values
  LocationLog copyWith({
    String? visitId,
    double? latitude,
    double? longitude,
    DateTime? timestamp,
    double? accuracy,
    double? speed,
    double? heading,
    double? altitude,
    bool? isSynced,
  }) {
    return LocationLog(
      id: id,
      visitId: visitId ?? this.visitId,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      timestamp: timestamp ?? this.timestamp,
      accuracy: accuracy ?? this.accuracy,
      speed: speed ?? this.speed,
      heading: heading ?? this.heading,
      altitude: altitude ?? this.altitude,
      isSynced: isSynced ?? this.isSynced,
    );
  }
}
