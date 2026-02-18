import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;

class DocumentFolder {
  final String id;
  final String name;
  final String? parentId;
  final int documentCount;
  final DateTime createdAt;

  DocumentFolder({
    required this.id,
    required this.name,
    this.parentId,
    this.documentCount = 0,
    required this.createdAt,
  });

  factory DocumentFolder.fromJson(Map<String, dynamic> json) {
    return DocumentFolder(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      parentId: json['parent_id']?.toString(),
      documentCount: json['document_count'] as int? ?? 0,
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

class DocumentVersion {
  final String id;
  final String documentId;
  final int versionNumber;
  final String fileUrl;
  final String? changeNotes;
  final String uploadedBy;
  final DateTime createdAt;

  DocumentVersion({
    required this.id,
    required this.documentId,
    required this.versionNumber,
    required this.fileUrl,
    this.changeNotes,
    required this.uploadedBy,
    required this.createdAt,
  });

  factory DocumentVersion.fromJson(Map<String, dynamic> json) {
    return DocumentVersion(
      id: json['id']?.toString() ?? '',
      documentId: json['document_id']?.toString() ?? '',
      versionNumber: json['version_number'] as int? ?? 1,
      fileUrl: json['file_url']?.toString() ?? '',
      changeNotes: json['change_notes']?.toString(),
      uploadedBy: json['uploaded_by']?.toString() ?? '',
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

class DocumentAnnotation {
  final String id;
  final String documentId;
  final String userId;
  final String type; // 'highlight', 'note', 'stamp', 'drawing'
  final int pageNumber;
  final double x;
  final double y;
  final double? width;
  final double? height;
  final String? content;
  final String? color;
  final DateTime createdAt;

  DocumentAnnotation({
    required this.id,
    required this.documentId,
    required this.userId,
    required this.type,
    required this.pageNumber,
    required this.x,
    required this.y,
    this.width,
    this.height,
    this.content,
    this.color,
    required this.createdAt,
  });

  factory DocumentAnnotation.fromJson(Map<String, dynamic> json) {
    return DocumentAnnotation(
      id: json['id']?.toString() ?? '',
      documentId: json['document_id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'note',
      pageNumber: json['page_number'] as int? ?? 1,
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      width: (json['width'] as num?)?.toDouble(),
      height: (json['height'] as num?)?.toDouble(),
      content: json['content']?.toString(),
      color: json['color']?.toString(),
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'document_id': documentId,
      'user_id': userId,
      'type': type,
      'page_number': pageNumber,
      'x': x,
      'y': y,
      'width': width,
      'height': height,
      'content': content,
      'color': color,
    };
  }
}

class DocumentExpiryAlert {
  final String documentId;
  final String documentName;
  final String category;
  final DateTime expiryDate;
  final int daysUntilExpiry;

  DocumentExpiryAlert({
    required this.documentId,
    required this.documentName,
    required this.category,
    required this.expiryDate,
    required this.daysUntilExpiry,
  });
}

class DocumentEnhancementsService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _offlineDocsCacheBox = 'offline_documents';
  static const String _annotationsCacheBox = 'annotations_cache';

  String? get _currentUserId => _supabase.auth.currentUser?.id;

  // ==================== DOCUMENT FOLDERS ====================

  Future<List<DocumentFolder>> getFolders({String? parentId}) async {
    try {
      var query = _supabase
          .from('document_folders')
          .select()
          .eq('user_id', _currentUserId ?? '');

      if (parentId != null) {
        query = query.eq('parent_id', parentId);
      } else {
        query = query.isFilter('parent_id', null);
      }

      final response = await query.order('name', ascending: true);

      return (response as List).map((f) => DocumentFolder.fromJson(f)).toList();
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting folders: $e');
      return [];
    }
  }

  Future<DocumentFolder?> createFolder(String name, {String? parentId}) async {
    try {
      final response = await _supabase
          .from('document_folders')
          .insert({
            'name': name,
            'parent_id': parentId,
            'user_id': _currentUserId,
          })
          .select()
          .single();

      return DocumentFolder.fromJson(response);
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error creating folder: $e');
      return null;
    }
  }

  Future<bool> moveToFolder(String documentId, String? folderId) async {
    try {
      await _supabase
          .from('document_index')
          .update({'folder_id': folderId})
          .eq('id', documentId);
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error moving document: $e');
      return false;
    }
  }

  Future<bool> deleteFolder(String folderId) async {
    try {
      await _supabase.from('document_folders').delete().eq('id', folderId);
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error deleting folder: $e');
      return false;
    }
  }

  // ==================== DOCUMENT VERSIONING ====================

  Future<List<DocumentVersion>> getVersions(String documentId) async {
    try {
      final response = await _supabase
          .from('document_versions')
          .select('*, profiles:uploaded_by(full_name)')
          .eq('document_id', documentId)
          .order('version_number', ascending: false);

      return (response as List)
          .map((v) => DocumentVersion.fromJson(v))
          .toList();
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting versions: $e');
      return [];
    }
  }

  Future<DocumentVersion?> uploadNewVersion({
    required String documentId,
    required String filePath,
    String? changeNotes,
  }) async {
    try {
      // Get current version number
      final versions = await getVersions(documentId);
      final nextVersion = versions.isEmpty
          ? 1
          : versions.first.versionNumber + 1;

      // Upload file
      final file = File(filePath);
      final fileName =
          '${documentId}_v$nextVersion${file.path.split('.').last}';
      final storagePath = 'document_versions/$documentId/$fileName';

      await _supabase.storage.from('documents').upload(storagePath, file);

      final fileUrl = _supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

      // Create version record
      final response = await _supabase
          .from('document_versions')
          .insert({
            'document_id': documentId,
            'version_number': nextVersion,
            'file_url': fileUrl,
            'change_notes': changeNotes,
            'uploaded_by': _currentUserId,
          })
          .select()
          .single();

      return DocumentVersion.fromJson(response);
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error uploading version: $e');
      return null;
    }
  }

  Future<bool> restoreVersion(String documentId, String versionId) async {
    try {
      final version = await _supabase
          .from('document_versions')
          .select()
          .eq('id', versionId)
          .single();

      await _supabase
          .from('document_index')
          .update({
            'file_url': version['file_url'],
            'current_version': version['version_number'],
          })
          .eq('id', documentId);

      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error restoring version: $e');
      return false;
    }
  }

  // ==================== DOCUMENT ANNOTATIONS ====================

  Future<List<DocumentAnnotation>> getAnnotations(String documentId) async {
    try {
      final response = await _supabase
          .from('document_annotations')
          .select()
          .eq('document_id', documentId)
          .order('page_number', ascending: true)
          .order('created_at', ascending: true);

      return (response as List)
          .map((a) => DocumentAnnotation.fromJson(a))
          .toList();
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting annotations: $e');
      return [];
    }
  }

  Future<DocumentAnnotation?> addAnnotation(
    DocumentAnnotation annotation,
  ) async {
    try {
      final response = await _supabase
          .from('document_annotations')
          .insert(annotation.toJson())
          .select()
          .single();

      return DocumentAnnotation.fromJson(response);
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error adding annotation: $e');
      return null;
    }
  }

  Future<bool> updateAnnotation(
    String annotationId,
    Map<String, dynamic> updates,
  ) async {
    try {
      await _supabase
          .from('document_annotations')
          .update(updates)
          .eq('id', annotationId);
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error updating annotation: $e');
      return false;
    }
  }

  Future<bool> deleteAnnotation(String annotationId) async {
    try {
      await _supabase
          .from('document_annotations')
          .delete()
          .eq('id', annotationId);
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error deleting annotation: $e');
      return false;
    }
  }

  // ==================== DOCUMENT SHARING ====================

  Future<bool> shareDocument({
    required String documentId,
    required List<String> userIds,
    String permission = 'view', // 'view', 'edit', 'sign'
  }) async {
    try {
      final shares = userIds
          .map(
            (userId) => {
              'document_id': documentId,
              'shared_with_user_id': userId,
              'shared_by_user_id': _currentUserId,
              'permission': permission,
            },
          )
          .toList();

      await _supabase
          .from('document_shares')
          .upsert(shares, onConflict: 'document_id,shared_with_user_id');
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error sharing document: $e');
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> getSharedUsers(String documentId) async {
    try {
      final response = await _supabase
          .from('document_shares')
          .select('*, profiles:shared_with_user_id(full_name, email)')
          .eq('document_id', documentId);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting shared users: $e');
      return [];
    }
  }

  Future<bool> revokeShare(String documentId, String userId) async {
    try {
      await _supabase
          .from('document_shares')
          .delete()
          .eq('document_id', documentId)
          .eq('shared_with_user_id', userId);
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error revoking share: $e');
      return false;
    }
  }

  // ==================== OFFLINE ACCESS ====================

  Future<bool> markForOfflineAccess(String documentId, String fileUrl) async {
    try {
      final box = await Hive.openBox(_offlineDocsCacheBox);
      final directory = await getApplicationDocumentsDirectory();
      final fileName =
          'offline_${documentId}_${DateTime.now().millisecondsSinceEpoch}';
      final filePath = '${directory.path}/$fileName';

      // Download file
      final response = await http.get(Uri.parse(fileUrl));
      if (response.statusCode == 200) {
        final file = File(filePath);
        await file.writeAsBytes(response.bodyBytes);

        await box.put(documentId, {
          'document_id': documentId,
          'file_url': fileUrl,
          'local_path': filePath,
          'downloaded_at': DateTime.now().toIso8601String(),
        });
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error marking for offline: $e');
      return false;
    }
  }

  Future<String?> getOfflineDocument(String documentId) async {
    try {
      final box = await Hive.openBox(_offlineDocsCacheBox);
      final data = box.get(documentId);
      if (data == null) return null;

      final localPath = data['local_path'] as String?;
      if (localPath != null && await File(localPath).exists()) {
        return localPath;
      }
      return null;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting offline document: $e');
      return null;
    }
  }

  Future<List<String>> getOfflineDocumentIds() async {
    try {
      final box = await Hive.openBox(_offlineDocsCacheBox);
      return box.keys.cast<String>().toList();
    } catch (e) {
      return [];
    }
  }

  Future<bool> removeOfflineDocument(String documentId) async {
    try {
      final box = await Hive.openBox(_offlineDocsCacheBox);
      final data = box.get(documentId);
      if (data != null) {
        final localPath = data['local_path'] as String?;
        if (localPath != null) {
          final file = File(localPath);
          if (await file.exists()) {
            await file.delete();
          }
        }
        await box.delete(documentId);
      }
      return true;
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error removing offline document: $e');
      return false;
    }
  }

  // ==================== BULK DOWNLOAD ====================

  Future<List<String>> bulkDownload(
    List<Map<String, dynamic>> documents,
  ) async {
    final downloadedPaths = <String>[];
    final directory = await getApplicationDocumentsDirectory();

    for (final doc in documents) {
      try {
        final fileUrl = doc['file_url'] as String?;
        final fileName = doc['file_name'] as String? ?? 'document';
        if (fileUrl == null) continue;

        final response = await http.get(Uri.parse(fileUrl));
        if (response.statusCode == 200) {
          final filePath = '${directory.path}/$fileName';
          final file = File(filePath);
          await file.writeAsBytes(response.bodyBytes);
          downloadedPaths.add(filePath);
        }
      } catch (e) {
        debugPrint('[DocumentEnhancements] Error downloading: $e');
      }
    }

    return downloadedPaths;
  }

  // ==================== EXPIRY ALERTS ====================

  Future<List<DocumentExpiryAlert>> getExpiringDocuments({
    int daysThreshold = 30,
  }) async {
    try {
      final thresholdDate = DateTime.now().add(Duration(days: daysThreshold));

      final response = await _supabase
          .from('document_index')
          .select()
          .inFilter('category', [
            'federal_permit',
            'state_permit',
            'local_permit',
          ])
          .not('expiry_date', 'is', null)
          .lte('expiry_date', thresholdDate.toIso8601String())
          .gte('expiry_date', DateTime.now().toIso8601String())
          .order('expiry_date', ascending: true);

      return (response as List).map((doc) {
        final expiryDate = DateTime.parse(doc['expiry_date']);
        return DocumentExpiryAlert(
          documentId: doc['id']?.toString() ?? '',
          documentName: doc['file_name']?.toString() ?? '',
          category: doc['category']?.toString() ?? '',
          expiryDate: expiryDate,
          daysUntilExpiry: expiryDate.difference(DateTime.now()).inDays,
        );
      }).toList();
    } catch (e) {
      debugPrint('[DocumentEnhancements] Error getting expiring documents: $e');
      return [];
    }
  }

  // ==================== DOCUMENT SCANNING ====================

  Future<String?> processScannedDocument({
    required String imagePath,
    required String documentName,
    required String category,
  }) async {
    try {
      final file = File(imagePath);
      if (!await file.exists()) return null;

      final storagePath =
          'scanned_documents/$_currentUserId/${DateTime.now().millisecondsSinceEpoch}_$documentName';

      await _supabase.storage.from('documents').upload(storagePath, file);

      final fileUrl = _supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

      // Add to document index
      final response = await _supabase
          .from('document_index')
          .insert({
            'file_name': documentName,
            'file_url': fileUrl,
            'category': category,
            'uploaded_by': _currentUserId,
            'source': 'scanned',
          })
          .select()
          .single();

      return response['id']?.toString();
    } catch (e) {
      debugPrint(
        '[DocumentEnhancements] Error processing scanned document: $e',
      );
      return null;
    }
  }
}
