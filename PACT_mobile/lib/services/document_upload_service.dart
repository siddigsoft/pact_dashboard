import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as path;
import '../models/cost_submission.dart';

/// Document Upload Service for PACT Mobile App
///
/// Handles document/image uploads to Supabase Storage
/// Supports camera capture and gallery selection

class DocumentUploadService {
  final SupabaseClient _supabase;
  final ImagePicker _picker = ImagePicker();

  DocumentUploadService(this._supabase);

  String? get currentUserId => _supabase.auth.currentUser?.id;

  /// Pick image from gallery
  Future<File?> pickFromGallery() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
      if (image != null) {
        return File(image.path);
      }
      return null;
    } catch (e) {
      print('Error picking from gallery: $e');
      return null;
    }
  }

  /// Capture image from camera
  Future<File?> captureFromCamera() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
      if (image != null) {
        return File(image.path);
      }
      return null;
    } catch (e) {
      print('Error capturing from camera: $e');
      return null;
    }
  }

  /// Pick multiple images from gallery
  Future<List<File>> pickMultipleFromGallery({int maxImages = 5}) async {
    try {
      final List<XFile> images = await _picker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );

      if (images.length > maxImages) {
        return images.take(maxImages).map((x) => File(x.path)).toList();
      }

      return images.map((x) => File(x.path)).toList();
    } catch (e) {
      print('Error picking multiple images: $e');
      return [];
    }
  }

  /// Upload a file to Supabase Storage
  Future<SupportingDocument?> uploadFile({
    required File file,
    required String documentType, // 'receipt', 'invoice', 'photo', 'other'
    String? description,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final filename = path.basename(file.path);
      final extension = path.extension(filename).toLowerCase();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final storagePath = 'cost-documents/$currentUserId/$timestamp-$filename';

      // Determine content type
      String contentType = 'application/octet-stream';
      if (['.jpg', '.jpeg'].contains(extension)) {
        contentType = 'image/jpeg';
      } else if (extension == '.png') {
        contentType = 'image/png';
      } else if (extension == '.pdf') {
        contentType = 'application/pdf';
      } else if (extension == '.heic') {
        contentType = 'image/heic';
      }

      // Read file bytes
      final bytes = await file.readAsBytes();

      // Upload to Supabase Storage
      await _supabase.storage
          .from('documents')
          .uploadBinary(
            storagePath,
            bytes,
            fileOptions: FileOptions(
              cacheControl: '3600',
              upsert: false,
              contentType: contentType,
            ),
          );

      // Get public URL
      final publicUrl = _supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

      return SupportingDocument(
        url: publicUrl,
        type: documentType,
        filename: filename,
        uploadedAt: DateTime.now().toIso8601String(),
        size: bytes.length,
        description: description,
      );
    } catch (e) {
      print('Error uploading file: $e');
      rethrow;
    }
  }

  /// Upload multiple files
  Future<List<SupportingDocument>> uploadMultipleFiles({
    required List<File> files,
    required String documentType,
    void Function(int uploaded, int total)? onProgress,
  }) async {
    final List<SupportingDocument> documents = [];

    for (int i = 0; i < files.length; i++) {
      try {
        final doc = await uploadFile(
          file: files[i],
          documentType: documentType,
        );
        if (doc != null) {
          documents.add(doc);
        }
        onProgress?.call(i + 1, files.length);
      } catch (e) {
        print('Failed to upload file ${i + 1}: $e');
      }
    }

    return documents;
  }

  /// Delete a document from storage
  Future<bool> deleteDocument(String url) async {
    try {
      // Extract path from URL
      final uri = Uri.parse(url);
      final pathSegments = uri.pathSegments;

      // Find the path after 'documents' bucket
      final bucketIndex = pathSegments.indexOf('documents');
      if (bucketIndex == -1) return false;

      final storagePath = pathSegments.sublist(bucketIndex + 1).join('/');

      await _supabase.storage.from('documents').remove([storagePath]);
      return true;
    } catch (e) {
      print('Error deleting document: $e');
      return false;
    }
  }

  /// Get file size in human-readable format
  static String formatFileSize(int? bytes) {
    if (bytes == null) return 'Unknown';

    if (bytes < 1024) {
      return '$bytes B';
    } else if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }
}
