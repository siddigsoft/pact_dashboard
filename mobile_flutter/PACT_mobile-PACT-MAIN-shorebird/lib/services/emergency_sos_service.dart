// lib/services/emergency_sos_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class EmergencyContact {
  final String id;
  final String name;
  final String phone;
  final String? email;
  final bool isPrimary;
  final String? relationship;

  EmergencyContact({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    this.isPrimary = false,
    this.relationship,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> json) {
    return EmergencyContact(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      phone: json['phone'] ?? '',
      email: json['email'],
      isPrimary: json['is_primary'] ?? false,
      relationship: json['relationship'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'phone': phone,
    'email': email,
    'is_primary': isPrimary,
    'relationship': relationship,
  };
}

class SOSAlert {
  final String id;
  final String userId;
  final String userName;
  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final String? message;
  final bool isResolved;
  final DateTime? resolvedAt;

  SOSAlert({
    required this.id,
    required this.userId,
    required this.userName,
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    this.message,
    this.isResolved = false,
    this.resolvedAt,
  });

  factory SOSAlert.fromJson(Map<String, dynamic> json) {
    return SOSAlert(
      id: json['id']?.toString() ?? '',
      userId: json['user_id'] ?? '',
      userName: json['user_name'] ?? '',
      latitude: (json['latitude'] ?? 0).toDouble(),
      longitude: (json['longitude'] ?? 0).toDouble(),
      timestamp: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
      message: json['message'],
      isResolved: json['is_resolved'] ?? false,
      resolvedAt: json['resolved_at'] != null 
          ? DateTime.tryParse(json['resolved_at']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'user_name': userName,
    'latitude': latitude,
    'longitude': longitude,
    'timestamp': timestamp.toIso8601String(),
    'message': message,
    'is_resolved': isResolved,
    'resolved_at': resolvedAt?.toIso8601String(),
  };

  String get googleMapsUrl => 
      'https://www.google.com/maps?q=$latitude,$longitude';
}

class EmergencySOSService {
  static final EmergencySOSService _instance = EmergencySOSService._internal();
  factory EmergencySOSService() => _instance;
  EmergencySOSService._internal();

  static const String _settingsBoxName = 'emergency_settings';
  static const String _contactsKey = 'emergency_contacts';
  static const String _sosMessageKey = 'sos_message';

  final _supabase = Supabase.instance.client;
  
  final _alertController = StreamController<SOSAlert>.broadcast();
  Stream<SOSAlert> get onSOSAlert => _alertController.stream;

  List<EmergencyContact> _contacts = [];
  String _sosMessage = '';
  bool _isInitialized = false;

  List<EmergencyContact> get contacts => _contacts;
  String get sosMessage => _sosMessage;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }

      await _loadSettings();
      _isInitialized = true;
      
      debugPrint('[EmergencySOSService] Initialized with ${_contacts.length} contacts');
    } catch (e) {
      debugPrint('[EmergencySOSService] Error initializing: $e');
    }
  }

  Future<void> _loadSettings() async {
    try {
      final box = Hive.box(_settingsBoxName);
      
      final contactsJson = box.get(_contactsKey) as List?;
      if (contactsJson != null) {
        _contacts = contactsJson
            .map((json) => EmergencyContact.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }

      _sosMessage = box.get(_sosMessageKey, 
          defaultValue: 'Emergency! I need help. My current location:');
    } catch (e) {
      debugPrint('[EmergencySOSService] Error loading settings: $e');
    }
  }

  Future<void> addContact(EmergencyContact contact) async {
    try {
      _contacts.add(contact);
      await _saveContacts();
      debugPrint('[EmergencySOSService] Contact added: ${contact.name}');
    } catch (e) {
      debugPrint('[EmergencySOSService] Error adding contact: $e');
      rethrow;
    }
  }

  Future<void> updateContact(EmergencyContact contact) async {
    try {
      final index = _contacts.indexWhere((c) => c.id == contact.id);
      if (index != -1) {
        _contacts[index] = contact;
        await _saveContacts();
      }
    } catch (e) {
      debugPrint('[EmergencySOSService] Error updating contact: $e');
      rethrow;
    }
  }

  Future<void> removeContact(String id) async {
    try {
      _contacts.removeWhere((c) => c.id == id);
      await _saveContacts();
    } catch (e) {
      debugPrint('[EmergencySOSService] Error removing contact: $e');
      rethrow;
    }
  }

  Future<void> _saveContacts() async {
    try {
      final box = Hive.box(_settingsBoxName);
      final jsonList = _contacts.map((c) => c.toJson()).toList();
      await box.put(_contactsKey, jsonList);
    } catch (e) {
      debugPrint('[EmergencySOSService] Error saving contacts: $e');
    }
  }

  Future<void> setSOSMessage(String message) async {
    try {
      final box = Hive.box(_settingsBoxName);
      await box.put(_sosMessageKey, message);
      _sosMessage = message;
    } catch (e) {
      debugPrint('[EmergencySOSService] Error setting SOS message: $e');
    }
  }

  Future<SOSAlert?> triggerSOS({String? customMessage}) async {
    try {
      final position = await _getCurrentLocation();
      if (position == null) {
        debugPrint('[EmergencySOSService] Could not get location');
        return null;
      }

      final user = _supabase.auth.currentUser;
      final userId = user?.id ?? 'unknown';
      final userName = user?.userMetadata?['full_name'] ?? 'Unknown User';

      final alert = SOSAlert(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        userId: userId,
        userName: userName,
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: DateTime.now(),
        message: customMessage ?? _sosMessage,
      );

      await _sendSOSToServer(alert);
      await _notifyEmergencyContacts(alert);
      _alertController.add(alert);

      debugPrint('[EmergencySOSService] SOS triggered: ${alert.id}');
      return alert;
    } catch (e) {
      debugPrint('[EmergencySOSService] Error triggering SOS: $e');
      return null;
    }
  }

  Future<Position?> _getCurrentLocation() async {
    try {
      final hasPermission = await Geolocator.checkPermission();
      if (hasPermission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }

      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
    } catch (e) {
      debugPrint('[EmergencySOSService] Error getting location: $e');
      return null;
    }
  }

  Future<void> _sendSOSToServer(SOSAlert alert) async {
    try {
      await _supabase.from('sos_alerts').insert({
        'user_id': alert.userId,
        'user_name': alert.userName,
        'latitude': alert.latitude,
        'longitude': alert.longitude,
        'message': alert.message,
        'timestamp': alert.timestamp.toIso8601String(),
      });
    } catch (e) {
      debugPrint('[EmergencySOSService] Error sending SOS to server: $e');
    }
  }

  Future<void> _notifyEmergencyContacts(SOSAlert alert) async {
    final message = '${alert.message}\n\nLocation: ${alert.googleMapsUrl}';
    
    for (final contact in _contacts) {
      try {
        final smsUri = Uri(
          scheme: 'sms',
          path: contact.phone,
          queryParameters: {'body': message},
        );

        if (await canLaunchUrl(smsUri)) {
          await launchUrl(smsUri);
        }
      } catch (e) {
        debugPrint('[EmergencySOSService] Error sending SMS to ${contact.name}: $e');
      }
    }
  }

  Future<void> callEmergencyNumber() async {
    try {
      final primaryContact = _contacts.firstWhere(
        (c) => c.isPrimary,
        orElse: () => _contacts.isNotEmpty 
            ? _contacts.first 
            : EmergencyContact(id: '', name: '', phone: ''),
      );

      if (primaryContact.phone.isNotEmpty) {
        final phoneUri = Uri(scheme: 'tel', path: primaryContact.phone);
        if (await canLaunchUrl(phoneUri)) {
          await launchUrl(phoneUri);
        }
      }
    } catch (e) {
      debugPrint('[EmergencySOSService] Error making emergency call: $e');
    }
  }

  Future<void> resolveAlert(String alertId) async {
    try {
      await _supabase.from('sos_alerts').update({
        'is_resolved': true,
        'resolved_at': DateTime.now().toIso8601String(),
      }).eq('id', alertId);

      debugPrint('[EmergencySOSService] Alert resolved: $alertId');
    } catch (e) {
      debugPrint('[EmergencySOSService] Error resolving alert: $e');
    }
  }

  void dispose() {
    _alertController.close();
  }
}
