// lib/services/permit_upload_service.dart

import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as path;
import 'package:uuid/uuid.dart';

class PermitUploadResult {
  final bool success;
  final String? fileUrl;
  final String? error;

  PermitUploadResult({
    required this.success,
    this.fileUrl,
    this.error,
  });

  factory PermitUploadResult.error(String message) =>
      PermitUploadResult(success: false, error: message);

  factory PermitUploadResult.successResult(String url) =>
      PermitUploadResult(success: true, fileUrl: url);
}

class PermitUploadService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _bucket = 'mmp-files';
  static const int _maxFileSizeBytes = 10 * 1024 * 1024; // 10MB
  static const List<String> _allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];

  String _sanitizeSegment(String s) {
    return s
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
  }

  Future<PermitUploadResult> uploadStatePermit({
    required File file,
    required String mmpFileId,
    required String state,
  }) async {
    try {
      final validation = _validateFile(file);
      if (validation != null) {
        return PermitUploadResult.error(validation);
      }

      final stateSegment = _sanitizeSegment(state);
      final fileName = _generateFileName(file);
      final filePath = 'permits/$mmpFileId/state/$stateSegment/$fileName';

      final bytes = await file.readAsBytes();
      
      await _supabase.storage.from(_bucket).uploadBinary(
        filePath,
        bytes,
        fileOptions: FileOptions(
          contentType: _getContentType(file),
          upsert: true,
        ),
      );

      final publicUrl = _supabase.storage.from(_bucket).getPublicUrl(filePath);

      return PermitUploadResult.successResult(publicUrl);
    } catch (e) {
      debugPrint('State permit upload error: $e');
      return PermitUploadResult.error(e.toString());
    }
  }

  Future<PermitUploadResult> uploadLocalityPermit({
    required File file,
    required String mmpFileId,
    required String state,
    required String locality,
  }) async {
    try {
      final validation = _validateFile(file);
      if (validation != null) {
        return PermitUploadResult.error(validation);
      }

      final stateSegment = _sanitizeSegment(state);
      final localitySegment = _sanitizeSegment(locality);
      final fileName = _generateFileName(file);
      final filePath = 'permits/$mmpFileId/local/$stateSegment/$localitySegment/$fileName';

      final bytes = await file.readAsBytes();
      
      await _supabase.storage.from(_bucket).uploadBinary(
        filePath,
        bytes,
        fileOptions: FileOptions(
          contentType: _getContentType(file),
          upsert: true,
        ),
      );

      final publicUrl = _supabase.storage.from(_bucket).getPublicUrl(filePath);

      return PermitUploadResult.successResult(publicUrl);
    } catch (e) {
      debugPrint('Locality permit upload error: $e');
      return PermitUploadResult.error(e.toString());
    }
  }

  Future<void> updateMmpFilePermits({
    required String mmpFileId,
    required Map<String, dynamic> permitData,
    required String permitType, // 'state' or 'locality'
  }) async {
    try {
      final response = await _supabase
          .from('mmp_files')
          .select('permits')
          .eq('id', mmpFileId)
          .single();

      final currentPermits = Map<String, dynamic>.from(
        response['permits'] as Map<String, dynamic>? ?? {},
      );

      if (permitType == 'state') {
        currentPermits['state'] = true;
        final statePermits = List<Map<String, dynamic>>.from(
          currentPermits['statePermits'] as List? ?? [],
        );
        statePermits.add(permitData);
        currentPermits['statePermits'] = statePermits;
      } else if (permitType == 'locality') {
        currentPermits['locality'] = true;
        final localityPermits = List<Map<String, dynamic>>.from(
          currentPermits['localityPermits'] as List? ?? [],
        );
        localityPermits.add(permitData);
        currentPermits['localityPermits'] = localityPermits;
      }

      await _supabase
          .from('mmp_files')
          .update({'permits': currentPermits})
          .eq('id', mmpFileId);
    } catch (e) {
      debugPrint('Error updating MMP file permits: $e');
      rethrow;
    }
  }

  Future<void> updateSiteEntriesAfterStatePermit({
    required String mmpFileId,
    required String state,
  }) async {
    final sites = await _supabase
        .from('mmp_site_entries')
        .select('id, additional_data')
        .eq('mmp_file_id', mmpFileId)
        .eq('state', state);

    for (final site in sites as List) {
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );
      additionalData['state_permit_attached'] = true;

      await _supabase
          .from('mmp_site_entries')
          .update({'additional_data': additionalData})
          .eq('id', site['id']);
    }
  }

  Future<void> updateSiteEntriesAfterLocalityPermit({
    required String mmpFileId,
    required String state,
    required String locality,
    required List<String> siteIds,
  }) async {
    for (final siteId in siteIds) {
      final site = await _supabase
          .from('mmp_site_entries')
          .select('id, additional_data, status')
          .eq('id', siteId)
          .single();

      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );
      additionalData['locality_permit_attached'] = true;

      await _supabase.from('mmp_site_entries').update({
        'status': 'permits_attached',
        'additional_data': additionalData,
      }).eq('id', siteId);
    }
  }

  String? _validateFile(File file) {
    final extension = path.extension(file.path).toLowerCase().replaceAll('.', '');
    
    if (!_allowedExtensions.contains(extension)) {
      return 'Invalid file type. Please select a PDF or image file (JPG, PNG).';
    }

    final fileSize = file.lengthSync();
    if (fileSize > _maxFileSizeBytes) {
      return 'File too large. Maximum size is 10MB.';
    }

    return null;
  }

  String _generateFileName(File file) {
    final extension = path.extension(file.path);
    final uuid = const Uuid().v4();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    return 'permit_${timestamp}_$uuid$extension';
  }

  String _getContentType(File file) {
    final extension = path.extension(file.path).toLowerCase();
    switch (extension) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }
}
