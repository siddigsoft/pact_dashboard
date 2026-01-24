// lib/services/offline_queue_service.dart

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

enum QueueItemType {
  siteVisitStart,
  siteVisitComplete,
  costSubmission,
  photoUpload,
  signatureUpload,
  reportSubmission,
  gpsLocation,
  permitUpload,
}

enum QueueItemStatus {
  pending,
  syncing,
  completed,
  failed,
  retrying,
}

class OfflineQueueItem {
  final String id;
  final QueueItemType type;
  final Map<String, dynamic> data;
  final DateTime createdAt;
  final int retryCount;
  final String? errorMessage;
  QueueItemStatus status;

  OfflineQueueItem({
    required this.id,
    required this.type,
    required this.data,
    required this.createdAt,
    this.retryCount = 0,
    this.errorMessage,
    this.status = QueueItemStatus.pending,
  });

  String get typeLabel {
    switch (type) {
      case QueueItemType.siteVisitStart:
        return 'Start Visit';
      case QueueItemType.siteVisitComplete:
        return 'Complete Visit';
      case QueueItemType.costSubmission:
        return 'Cost Submission';
      case QueueItemType.photoUpload:
        return 'Photo Upload';
      case QueueItemType.signatureUpload:
        return 'Signature Upload';
      case QueueItemType.reportSubmission:
        return 'Report Submission';
      case QueueItemType.gpsLocation:
        return 'GPS Location';
      case QueueItemType.permitUpload:
        return 'Permit Upload';
    }
  }

  String get typeLabelAr {
    switch (type) {
      case QueueItemType.siteVisitStart:
        return 'بدء الزيارة';
      case QueueItemType.siteVisitComplete:
        return 'إكمال الزيارة';
      case QueueItemType.costSubmission:
        return 'تقديم التكلفة';
      case QueueItemType.photoUpload:
        return 'تحميل الصورة';
      case QueueItemType.signatureUpload:
        return 'تحميل التوقيع';
      case QueueItemType.reportSubmission:
        return 'تقديم التقرير';
      case QueueItemType.gpsLocation:
        return 'موقع GPS';
      case QueueItemType.permitUpload:
        return 'تحميل التصريح';
    }
  }

  factory OfflineQueueItem.fromJson(Map<String, dynamic> json) {
    return OfflineQueueItem(
      id: json['id'] ?? '',
      type: QueueItemType.values[json['type'] ?? 0],
      data: Map<String, dynamic>.from(json['data'] ?? {}),
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      retryCount: json['retry_count'] ?? 0,
      errorMessage: json['error_message'],
      status: QueueItemStatus.values[json['status'] ?? 0],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.index,
    'data': data,
    'created_at': createdAt.toIso8601String(),
    'retry_count': retryCount,
    'error_message': errorMessage,
    'status': status.index,
  };

  OfflineQueueItem copyWith({
    QueueItemStatus? status,
    int? retryCount,
    String? errorMessage,
  }) {
    return OfflineQueueItem(
      id: id,
      type: type,
      data: data,
      createdAt: createdAt,
      retryCount: retryCount ?? this.retryCount,
      errorMessage: errorMessage ?? this.errorMessage,
      status: status ?? this.status,
    );
  }
}

class OfflineQueueService {
  static final OfflineQueueService _instance = OfflineQueueService._internal();
  factory OfflineQueueService() => _instance;
  OfflineQueueService._internal();

  static const String _queueBoxName = 'offline_queue';
  static const int _maxRetries = 3;

  final _queueController = StreamController<List<OfflineQueueItem>>.broadcast();
  Stream<List<OfflineQueueItem>> get queueStream => _queueController.stream;

  final _statusController = StreamController<OfflineQueueStatus>.broadcast();
  Stream<OfflineQueueStatus> get statusStream => _statusController.stream;

  List<OfflineQueueItem> _queue = [];
  bool _isSyncing = false;
  bool _isInitialized = false;

  Future<void> initialize() async {
    if (_isInitialized) return;
    
    try {
      if (!Hive.isBoxOpen(_queueBoxName)) {
        await Hive.openBox(_queueBoxName);
      }
      await _loadQueue();
      _isInitialized = true;
      debugPrint('[OfflineQueueService] Initialized with ${_queue.length} pending items');
    } catch (e) {
      debugPrint('[OfflineQueueService] Error initializing: $e');
    }
  }

  Future<void> _loadQueue() async {
    try {
      final box = Hive.box(_queueBoxName);
      final items = box.get('items') as List?;
      
      if (items != null) {
        _queue = items
            .map((json) => OfflineQueueItem.fromJson(Map<String, dynamic>.from(json)))
            .toList();
        _notifyQueueChanged();
      }
    } catch (e) {
      debugPrint('[OfflineQueueService] Error loading queue: $e');
    }
  }

  Future<void> _saveQueue() async {
    try {
      final box = Hive.box(_queueBoxName);
      final jsonList = _queue.map((item) => item.toJson()).toList();
      await box.put('items', jsonList);
    } catch (e) {
      debugPrint('[OfflineQueueService] Error saving queue: $e');
    }
  }

  void _notifyQueueChanged() {
    _queueController.add(List.from(_queue));
    _statusController.add(getStatus());
  }

  Future<String> addToQueue(QueueItemType type, Map<String, dynamic> data) async {
    final item = OfflineQueueItem(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      type: type,
      data: data,
      createdAt: DateTime.now(),
    );
    
    _queue.add(item);
    await _saveQueue();
    _notifyQueueChanged();
    
    debugPrint('[OfflineQueueService] Added ${type.name} to queue (ID: ${item.id})');
    return item.id;
  }

  Future<void> removeFromQueue(String id) async {
    _queue.removeWhere((item) => item.id == id);
    await _saveQueue();
    _notifyQueueChanged();
    debugPrint('[OfflineQueueService] Removed item $id from queue');
  }

  Future<void> updateItemStatus(String id, QueueItemStatus status, {String? errorMessage}) async {
    final index = _queue.indexWhere((item) => item.id == id);
    if (index != -1) {
      _queue[index] = _queue[index].copyWith(
        status: status,
        errorMessage: errorMessage,
        retryCount: status == QueueItemStatus.retrying 
            ? _queue[index].retryCount + 1 
            : _queue[index].retryCount,
      );
      await _saveQueue();
      _notifyQueueChanged();
    }
  }

  Future<void> retryFailed() async {
    for (var item in _queue.where((i) => i.status == QueueItemStatus.failed)) {
      if (item.retryCount < _maxRetries) {
        await updateItemStatus(item.id, QueueItemStatus.pending);
      }
    }
  }

  Future<void> retryItem(String id) async {
    final item = _queue.firstWhere((i) => i.id == id, orElse: () => throw Exception('Item not found'));
    if (item.retryCount < _maxRetries) {
      await updateItemStatus(id, QueueItemStatus.pending);
    }
  }

  Future<void> clearCompleted() async {
    _queue.removeWhere((item) => item.status == QueueItemStatus.completed);
    await _saveQueue();
    _notifyQueueChanged();
  }

  Future<void> clearAll() async {
    _queue.clear();
    await _saveQueue();
    _notifyQueueChanged();
  }

  List<OfflineQueueItem> get pendingItems => 
      _queue.where((i) => i.status == QueueItemStatus.pending).toList();

  List<OfflineQueueItem> get failedItems => 
      _queue.where((i) => i.status == QueueItemStatus.failed).toList();

  List<OfflineQueueItem> get allItems => List.from(_queue);

  int get pendingCount => pendingItems.length;
  int get failedCount => failedItems.length;
  int get totalCount => _queue.length;

  bool get hasPendingItems => pendingCount > 0;
  bool get hasFailedItems => failedCount > 0;
  bool get isSyncing => _isSyncing;

  OfflineQueueStatus getStatus() {
    return OfflineQueueStatus(
      pendingCount: pendingCount,
      failedCount: failedCount,
      totalCount: totalCount,
      isSyncing: _isSyncing,
      lastSyncTime: DateTime.now(),
    );
  }

  void setSyncing(bool value) {
    _isSyncing = value;
    _notifyQueueChanged();
  }

  void dispose() {
    _queueController.close();
    _statusController.close();
  }
}

class OfflineQueueStatus {
  final int pendingCount;
  final int failedCount;
  final int totalCount;
  final bool isSyncing;
  final DateTime lastSyncTime;

  OfflineQueueStatus({
    required this.pendingCount,
    required this.failedCount,
    required this.totalCount,
    required this.isSyncing,
    required this.lastSyncTime,
  });

  bool get hasPending => pendingCount > 0;
  bool get hasFailed => failedCount > 0;
  bool get isEmpty => totalCount == 0;
}
