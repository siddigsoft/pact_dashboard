import 'package:supabase_flutter/supabase_flutter.dart';
import 'offline_db.dart';
import 'models.dart';
import 'dart:convert';
import 'package:uuid/uuid.dart';

/// Offline request queue service for HTTP-based requests
/// Uses Hive to persist requests and executes them when online
class OfflineQueue {
  static final OfflineQueue _instance = OfflineQueue._internal();

  factory OfflineQueue() {
    return _instance;
  }

  OfflineQueue._internal();

  final OfflineDb _db = OfflineDb();
  late final SupabaseClient _supabase;
  late final Function(bool) _onOnlineStatusChange;

  static const int maxRetries = 3;
  static const int requestTimeoutMs = 30000;

  void setSupabaseClient(SupabaseClient client) {
    _supabase = client;
  }

  void setOnlineStatusCallback(Function(bool) callback) {
    _onOnlineStatusChange = callback;
  }

  // ============================================================================
  // QUEUE REQUEST
  // ============================================================================

  /// Queue a request for later execution
  Future<String> queueRequest(
    String url, {
    required String method,
    Map<String, dynamic>? data,
    Map<String, String>? headers,
  }) async {
    final id = const Uuid().v4();
    final request = QueuedRequest(
      id: id,
      url: url,
      method: method.toUpperCase(),
      data: data,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    );

    await _db.queueRequest(request);
    return id;
  }

  /// Get all queued requests with optional status filter
  List<QueuedRequest> getQueuedRequests({String? status}) {
    return _db.getQueuedRequests(status: status);
  }

  /// Get a specific queued request
  QueuedRequest? getQueuedRequest(String id) {
    return _db.getQueuedRequest(id);
  }

  /// Get queue status
  Map<String, dynamic> getQueueStatus() {
    final all = getQueuedRequests();
    final pending = getQueuedRequests(status: 'pending');
    final syncing = getQueuedRequests(status: 'syncing');
    final failed = getQueuedRequests(status: 'failed');

    return {
      'total': all.length,
      'pending': pending.length,
      'syncing': syncing.length,
      'failed': failed.length,
      'requests': all.map((r) => r.toJson()).toList(),
    };
  }

  // ============================================================================
  // SYNC QUEUE
  // ============================================================================

  /// Sync all pending requests
  Future<Map<String, dynamic>> syncQueue() async {
    final pending = getQueuedRequests(status: 'pending');
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    for (final request in pending) {
      try {
        final success = await _executeRequest(request);
        if (success) {
          await _db.removeRequest(request.id);
          synced++;
        } else {
          failed++;
          request.retries++;
          if (request.retries >= maxRetries) {
            await _db.updateRequestStatus(
              request.id,
              status: 'failed',
              retries: request.retries,
              errorMessage: 'Max retries exceeded',
            );
          }
        }
      } catch (e) {
        failed++;
        request.retries++;
        errors.add('Request ${request.id} failed: $e');

        if (request.retries >= maxRetries) {
          await _db.updateRequestStatus(
            request.id,
            status: 'failed',
            retries: request.retries,
            errorMessage: e.toString(),
          );
        }
      }
    }

    return {
      'synced': synced,
      'failed': failed,
      'errors': errors,
      'total': pending.length,
    };
  }

  /// Execute a single request
  Future<bool> _executeRequest(QueuedRequest request) async {
    try {
      await _db.updateRequestStatus(request.id, status: 'syncing');

      // Get auth token
      final session = _supabase.auth.currentSession;
      final token = session?.accessToken;

      // Prepare headers
      final headers = {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

      // Make request
      final response = await _makeHttpRequest(
        method: request.method,
        url: request.url,
        data: request.data,
        headers: headers,
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return true;
      } else {
        throw Exception('HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      await _db.updateRequestStatus(
        request.id,
        status: 'syncing',
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  // ============================================================================
  // HTTP REQUEST EXECUTION
  // ============================================================================

  Future<HttpResponse> _makeHttpRequest({
    required String method,
    required String url,
    Map<String, dynamic>? data,
    Map<String, String>? headers,
  }) async {
    final uri = Uri.parse(url);
    final httpHeaders = headers ?? {};
    final body = data != null ? jsonEncode(data) : null;

    switch (method.toUpperCase()) {
      case 'GET':
        return _getRequest(uri, httpHeaders);
      case 'POST':
        return _postRequest(uri, body, httpHeaders);
      case 'PUT':
        return _putRequest(uri, body, httpHeaders);
      case 'PATCH':
        return _patchRequest(uri, body, httpHeaders);
      case 'DELETE':
        return _deleteRequest(uri, httpHeaders);
      default:
        throw Exception('Unsupported HTTP method: $method');
    }
  }

  Future<HttpResponse> _getRequest(Uri uri, Map<String, String> headers) async {
    // Use Supabase HTTP client if available, else fallback
    try {
      final response = await _supabase.functions.invoke('http-request', body: {
        'method': 'GET',
        'url': uri.toString(),
      });
      return HttpResponse(
        statusCode: 200,
        body: response.toString(),
        headers: {},
      );
    } catch (e) {
      return HttpResponse(
        statusCode: 500,
        body: e.toString(),
        headers: {},
      );
    }
  }

  Future<HttpResponse> _postRequest(
    Uri uri,
    String? body,
    Map<String, String> headers,
  ) async {
    try {
      final response = await _supabase.functions.invoke('http-request', body: {
        'method': 'POST',
        'url': uri.toString(),
        'body': body,
        'headers': headers,
      });
      return HttpResponse(
        statusCode: 200,
        body: response.toString(),
        headers: {},
      );
    } catch (e) {
      return HttpResponse(
        statusCode: 500,
        body: e.toString(),
        headers: {},
      );
    }
  }

  Future<HttpResponse> _putRequest(
    Uri uri,
    String? body,
    Map<String, String> headers,
  ) async {
    try {
      final response = await _supabase.functions.invoke('http-request', body: {
        'method': 'PUT',
        'url': uri.toString(),
        'body': body,
        'headers': headers,
      });
      return HttpResponse(
        statusCode: 200,
        body: response.toString(),
        headers: {},
      );
    } catch (e) {
      return HttpResponse(
        statusCode: 500,
        body: e.toString(),
        headers: {},
      );
    }
  }

  Future<HttpResponse> _patchRequest(
    Uri uri,
    String? body,
    Map<String, String> headers,
  ) async {
    try {
      final response = await _supabase.functions.invoke('http-request', body: {
        'method': 'PATCH',
        'url': uri.toString(),
        'body': body,
        'headers': headers,
      });
      return HttpResponse(
        statusCode: 200,
        body: response.toString(),
        headers: {},
      );
    } catch (e) {
      return HttpResponse(
        statusCode: 500,
        body: e.toString(),
        headers: {},
      );
    }
  }

  Future<HttpResponse> _deleteRequest(Uri uri, Map<String, String> headers) async {
    try {
      final response = await _supabase.functions.invoke('http-request', body: {
        'method': 'DELETE',
        'url': uri.toString(),
      });
      return HttpResponse(
        statusCode: 200,
        body: response.toString(),
        headers: {},
      );
    } catch (e) {
      return HttpResponse(
        statusCode: 500,
        body: e.toString(),
        headers: {},
      );
    }
  }

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================

  /// Clear all queued requests
  Future<void> clearQueue() async {
    await _db.clearQueue();
  }

  /// Remove a specific request from queue
  Future<void> removeRequest(String id) async {
    await _db.removeRequest(id);
  }

  /// Requeue a failed request
  Future<void> requeueFailedRequest(String id) async {
    final request = _db.getQueuedRequest(id);
    if (request != null) {
      request.status = 'pending';
      request.retries = 0;
      request.errorMessage = null;
      await request.save();
    }
  }

  /// Requeue all failed requests
  Future<void> requeueAllFailedRequests() async {
    final failed = getQueuedRequests(status: 'failed');
    for (final request in failed) {
      request.status = 'pending';
      request.retries = 0;
      request.errorMessage = null;
      await request.save();
    }
  }

  // ============================================================================
}

/// Simple HTTP response wrapper
class HttpResponse {
  final int statusCode;
  final String body;
  final Map<String, String> headers;

  HttpResponse({
    required this.statusCode,
    required this.body,
    required this.headers,
  });
}
