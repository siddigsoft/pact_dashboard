// lib/services/crash_reporting_service.dart

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

enum CrashSeverity {
  info,
  warning,
  error,
  critical,
}

class CrashReport {
  final String id;
  final String message;
  final String? stackTrace;
  final CrashSeverity severity;
  final DateTime timestamp;
  final Map<String, dynamic> context;
  final Map<String, dynamic> deviceInfo;
  final String? userId;
  final String appVersion;
  final bool isSynced;

  CrashReport({
    required this.id,
    required this.message,
    this.stackTrace,
    required this.severity,
    required this.timestamp,
    this.context = const {},
    this.deviceInfo = const {},
    this.userId,
    required this.appVersion,
    this.isSynced = false,
  });

  factory CrashReport.fromJson(Map<String, dynamic> json) {
    return CrashReport(
      id: json['id'] ?? '',
      message: json['message'] ?? '',
      stackTrace: json['stack_trace'],
      severity: CrashSeverity.values[json['severity'] ?? 2],
      timestamp: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
      context: Map<String, dynamic>.from(json['context'] ?? {}),
      deviceInfo: Map<String, dynamic>.from(json['device_info'] ?? {}),
      userId: json['user_id'],
      appVersion: json['app_version'] ?? '',
      isSynced: json['is_synced'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'message': message,
    'stack_trace': stackTrace,
    'severity': severity.index,
    'timestamp': timestamp.toIso8601String(),
    'context': context,
    'device_info': deviceInfo,
    'user_id': userId,
    'app_version': appVersion,
    'is_synced': isSynced,
  };

  CrashReport copyWith({bool? isSynced}) {
    return CrashReport(
      id: id,
      message: message,
      stackTrace: stackTrace,
      severity: severity,
      timestamp: timestamp,
      context: context,
      deviceInfo: deviceInfo,
      userId: userId,
      appVersion: appVersion,
      isSynced: isSynced ?? this.isSynced,
    );
  }
}

class CrashReportingService {
  static final CrashReportingService _instance = CrashReportingService._internal();
  factory CrashReportingService() => _instance;
  CrashReportingService._internal();

  static const String _cacheBoxName = 'crash_reports';
  static const int _maxCachedReports = 100;

  final _supabase = Supabase.instance.client;
  
  String _appVersion = '';
  Map<String, dynamic> _deviceInfo = {};
  List<CrashReport> _pendingReports = [];
  bool _isInitialized = false;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      final packageInfo = await PackageInfo.fromPlatform();
      _appVersion = '${packageInfo.version}+${packageInfo.buildNumber}';

      _deviceInfo = await _getDeviceInfo();

      if (!Hive.isBoxOpen(_cacheBoxName)) {
        await Hive.openBox(_cacheBoxName);
      }

      await _loadPendingReports();
      _isInitialized = true;

      FlutterError.onError = (details) {
        recordError(
          details.exception,
          stackTrace: details.stack,
          context: {'library': details.library, 'silent': details.silent},
          severity: CrashSeverity.error,
        );
      };

      debugPrint('[CrashReportingService] Initialized with ${_pendingReports.length} pending reports');
    } catch (e) {
      debugPrint('[CrashReportingService] Error initializing: $e');
    }
  }

  Future<Map<String, dynamic>> _getDeviceInfo() async {
    try {
      final deviceInfo = DeviceInfoPlugin();
      
      if (Platform.isAndroid) {
        final android = await deviceInfo.androidInfo;
        return {
          'platform': 'android',
          'model': android.model,
          'brand': android.brand,
          'version': android.version.release,
          'sdk': android.version.sdkInt,
          'manufacturer': android.manufacturer,
          'device': android.device,
        };
      } else if (Platform.isIOS) {
        final ios = await deviceInfo.iosInfo;
        return {
          'platform': 'ios',
          'model': ios.model,
          'name': ios.name,
          'system_name': ios.systemName,
          'system_version': ios.systemVersion,
          'device_id': ios.identifierForVendor,
        };
      }
      return {'platform': 'unknown'};
    } catch (e) {
      return {'platform': 'error', 'error': e.toString()};
    }
  }

  Future<void> _loadPendingReports() async {
    try {
      final box = Hive.box(_cacheBoxName);
      final reports = box.get('pending_reports') as List?;
      
      if (reports != null) {
        _pendingReports = reports
            .map((json) => CrashReport.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }
    } catch (e) {
      debugPrint('[CrashReportingService] Error loading pending reports: $e');
    }
  }

  Future<void> _savePendingReports() async {
    try {
      final box = Hive.box(_cacheBoxName);
      
      if (_pendingReports.length > _maxCachedReports) {
        _pendingReports = _pendingReports.sublist(_pendingReports.length - _maxCachedReports);
      }
      
      final jsonList = _pendingReports.map((r) => r.toJson()).toList();
      await box.put('pending_reports', jsonList);
    } catch (e) {
      debugPrint('[CrashReportingService] Error saving pending reports: $e');
    }
  }

  Future<void> recordError(
    dynamic exception, {
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
    CrashSeverity severity = CrashSeverity.error,
  }) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      
      final report = CrashReport(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        message: exception.toString(),
        stackTrace: stackTrace?.toString(),
        severity: severity,
        timestamp: DateTime.now(),
        context: context ?? {},
        deviceInfo: _deviceInfo,
        userId: userId,
        appVersion: _appVersion,
      );

      _pendingReports.add(report);
      await _savePendingReports();

      debugPrint('[CrashReportingService] Recorded ${severity.name}: ${exception.toString().substring(0, exception.toString().length.clamp(0, 100))}');

      await _syncReports();
    } catch (e) {
      debugPrint('[CrashReportingService] Error recording error: $e');
    }
  }

  Future<void> log(String message, {CrashSeverity severity = CrashSeverity.info, Map<String, dynamic>? context}) async {
    await recordError(message, severity: severity, context: context);
  }

  Future<void> _syncReports() async {
    final unsyncedReports = _pendingReports.where((r) => !r.isSynced).toList();
    
    if (unsyncedReports.isEmpty) return;

    try {
      for (final report in unsyncedReports) {
        try {
          await _supabase.from('app_crash_reports').insert({
            'message': report.message,
            'stack_trace': report.stackTrace,
            'severity': report.severity.name,
            'timestamp': report.timestamp.toIso8601String(),
            'context': report.context,
            'device_info': report.deviceInfo,
            'user_id': report.userId,
            'app_version': report.appVersion,
          });

          final index = _pendingReports.indexWhere((r) => r.id == report.id);
          if (index != -1) {
            _pendingReports[index] = report.copyWith(isSynced: true);
          }
        } catch (e) {
          debugPrint('[CrashReportingService] Error syncing report ${report.id}: $e');
        }
      }

      _pendingReports.removeWhere((r) => r.isSynced);
      await _savePendingReports();

      debugPrint('[CrashReportingService] Synced ${unsyncedReports.length} reports');
    } catch (e) {
      debugPrint('[CrashReportingService] Error syncing reports: $e');
    }
  }

  Future<void> forceSyncAll() async {
    await _syncReports();
  }

  int get pendingReportsCount => _pendingReports.where((r) => !r.isSynced).length;

  void setUserContext(String userId, {Map<String, dynamic>? additionalContext}) {
    debugPrint('[CrashReportingService] User context set for: $userId');
  }

  void clearUserContext() {
    debugPrint('[CrashReportingService] User context cleared');
  }
}

void runAppWithCrashReporting(void Function() app) {
  runZonedGuarded(() {
    app();
  }, (error, stackTrace) {
    CrashReportingService().recordError(
      error,
      stackTrace: stackTrace,
      severity: CrashSeverity.critical,
    );
  });
}
