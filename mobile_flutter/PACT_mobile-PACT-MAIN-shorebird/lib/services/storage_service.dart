import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as path;
import 'package:image_picker/image_picker.dart';

class StorageService {
  final supabase = Supabase.instance.client;
  final ImagePicker _picker = ImagePicker();

  // Storage buckets
  static const String avatarBucket = 'avatars';
  static const String documentsBucket = 'documents';
  static const String siteVisitMediaBucket = 'site-visit-media';

  // Singleton pattern
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  // ========== PROFILE PHOTO UPLOADS ==========

  /// Upload profile photo from image picker (gallery)
  /// Automatically updates the user's profile with avatar_url in Supabase
  /// Returns: Public URL of uploaded image
  /// Throws: Exception if upload fails or no image selected
  Future<String> uploadProfilePhoto(String userId) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 512,
        maxHeight: 512,
      );

      if (image == null) {
        throw Exception('No image selected');
      }

      final imageData = await image.readAsBytes();
      return await uploadProfilePhotoBytes(userId, imageData, image.name);
    } catch (e) {
      debugPrint('Error picking profile photo: $e');
      rethrow;
    }
  }

  /// Upload profile photo from camera
  /// Returns: Public URL of uploaded image
  Future<String> uploadProfilePhotoCamera(String userId) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 512,
        maxHeight: 512,
      );

      if (image == null) {
        throw Exception('No image captured');
      }

      final imageData = await image.readAsBytes();
      return await uploadProfilePhotoBytes(userId, imageData, image.name);
    } catch (e) {
      debugPrint('Error capturing profile photo: $e');
      rethrow;
    }
  }

  /// Upload profile photo from bytes (for pre-processed images)
  /// Automatically updates the user's profile in Supabase
  /// Returns: Public URL of uploaded image
  Future<String> uploadProfilePhotoBytes(
    String userId,
    Uint8List imageBytes,
    String fileName,
  ) async {
    try {
      // Remove old avatar if exists (cleanup)
      try {
        await supabase.storage.from(avatarBucket).remove(['$userId/avatar']);
      } catch (e) {
        // File doesn't exist, ignore
        debugPrint('Old avatar not found, continuing with upload');
      }

      // Upload new avatar with upsert to replace existing
      final path = '$userId/avatar';
      await supabase.storage
          .from(avatarBucket)
          .uploadBinary(
            path,
            imageBytes,
            fileOptions: const FileOptions(
              cacheControl: '3600',
              upsert: true, // Replace if exists
            ),
          );

      // Get public URL of uploaded image
      final publicUrl = supabase.storage.from(avatarBucket).getPublicUrl(path);

      // Update user's profile with new avatar URL
      await supabase
          .from('profiles')
          .update({
            'avatar_url': publicUrl,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('Profile photo uploaded successfully: $publicUrl');
      return publicUrl;
    } catch (e) {
      debugPrint('Error uploading profile photo: $e');
      rethrow;
    }
  }

  /// Delete user's profile photo
  /// Removes the file from storage and clears avatar_url from profile
  Future<void> deleteProfilePhoto(String userId) async {
    try {
      await supabase.storage.from(avatarBucket).remove(['$userId/avatar']);

      // Clear avatar_url in profile
      await supabase
          .from('profiles')
          .update({
            'avatar_url': null,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      debugPrint('Profile photo deleted successfully');
    } catch (e) {
      debugPrint('Error deleting profile photo: $e');
      rethrow;
    }
  }

  /// Get profile photo URL for a user
  /// Returns null if no photo uploaded
  Future<String?> getProfilePhotoUrl(String userId) async {
    try {
      final profile = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .single();
      return profile['avatar_url'] as String?;
    } catch (e) {
      debugPrint('Error fetching profile photo URL: $e');
      return null;
    }
  }

  // ========== DOCUMENT UPLOADS ==========

  /// Upload user document (ID, license, bank statement, etc.)
  /// Returns: Public URL of uploaded document
  Future<String> uploadDocument(
    String userId,
    String documentType, // 'id', 'license', 'bankStatement', etc.
  ) async {
    try {
      final XFile? file = await _picker.pickMedia();

      if (file == null) {
        throw Exception('No file selected');
      }

      final fileData = await file.readAsBytes();
      return await uploadDocumentBytes(
        userId,
        documentType,
        fileData,
        file.name,
      );
    } catch (e) {
      debugPrint('Error picking document: $e');
      rethrow;
    }
  }

  /// Upload document from bytes
  Future<String> uploadDocumentBytes(
    String userId,
    String documentType,
    Uint8List fileBytes,
    String fileName,
  ) async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final path = '$userId/$documentType/$timestamp-$fileName';

      await supabase.storage
          .from(documentsBucket)
          .uploadBinary(
            path,
            fileBytes,
            fileOptions: const FileOptions(cacheControl: '3600'),
          );

      final publicUrl = supabase.storage
          .from(documentsBucket)
          .getPublicUrl(path);

      // Store document reference in database
      await supabase.from('user_documents').insert({
        'user_id': userId,
        'document_type': documentType,
        'file_name': fileName,
        'file_url': publicUrl,
        'uploaded_at': DateTime.now().toIso8601String(),
      });

      return publicUrl;
    } catch (e) {
      debugPrint('Error uploading document: $e');
      rethrow;
    }
  }

  /// Get user's uploaded documents
  Future<List<Map<String, dynamic>>> getUserDocuments(
    String userId, {
    String? documentType,
  }) async {
    try {
      var query =
          supabase
                  .from('user_documents')
                  .select()
                  .eq('user_id', userId)
                  .order('uploaded_at', ascending: false)
              as PostgrestQueryBuilder;

      if (documentType != null && documentType.isNotEmpty) {
        final filtered = await supabase
            .from('user_documents')
            .select()
            .eq('user_id', userId)
            .eq('document_type', documentType)
            .order('uploaded_at', ascending: false);
        return List<Map<String, dynamic>>.from(filtered);
      }

      final documents = await query;
      return List<Map<String, dynamic>>.from(documents);
    } catch (e) {
      debugPrint('Error fetching user documents: $e');
      return [];
    }
  }

  // ========== SITE VISIT MEDIA UPLOADS ==========

  /// Upload site visit photo
  /// Returns: Public URL of uploaded media
  Future<String> uploadSiteVisitPhoto(String userId, String siteVisitId) async {
    try {
      final XFile? file = await _picker.pickImage(source: ImageSource.camera);

      if (file == null) {
        throw Exception('No photo selected');
      }

      final fileData = await file.readAsBytes();
      return await uploadSiteVisitMediaBytes(
        userId,
        siteVisitId,
        'photo',
        fileData,
        file.name,
      );
    } catch (e) {
      debugPrint('Error picking site visit photo: $e');
      rethrow;
    }
  }

  /// Upload site visit media from bytes
  Future<String> uploadSiteVisitMediaBytes(
    String userId,
    String siteVisitId,
    String mediaType,
    Uint8List fileBytes,
    String fileName,
  ) async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final path = '$userId/$siteVisitId/$mediaType/$timestamp-$fileName';

      await supabase.storage
          .from(siteVisitMediaBucket)
          .uploadBinary(
            path,
            fileBytes,
            fileOptions: const FileOptions(cacheControl: '3600'),
          );

      final publicUrl = supabase.storage
          .from(siteVisitMediaBucket)
          .getPublicUrl(path);

      // Store media reference in database
      await supabase.from('site_visit_media').insert({
        'user_id': userId,
        'site_visit_id': siteVisitId,
        'media_type': mediaType,
        'file_name': fileName,
        'file_url': publicUrl,
        'uploaded_at': DateTime.now().toIso8601String(),
      });

      return publicUrl;
    } catch (e) {
      debugPrint('Error uploading site visit media: $e');
      rethrow;
    }
  }

  /// Get site visit media
  Future<List<Map<String, dynamic>>> getSiteVisitMedia(
    String siteVisitId,
  ) async {
    try {
      final media = await supabase
          .from('site_visit_media')
          .select()
          .eq('site_visit_id', siteVisitId)
          .order('uploaded_at', ascending: false);

      return List<Map<String, dynamic>>.from(media);
    } catch (e) {
      debugPrint('Error fetching site visit media: $e');
      return [];
    }
  }

  // Upload file
  Future<String> uploadFile(File file, String bucket, {String? folder}) async {
    try {
      final fileName = path.basename(file.path);
      final filePath = folder != null ? '$folder/$fileName' : fileName;

      await supabase.storage
          .from(bucket)
          .upload(
            filePath,
            file,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: true),
          );

      final String publicUrl = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);
      return publicUrl;
    } on StorageException catch (e) {
      if (kDebugMode) {
        print('Storage error: ${e.message}');
      }
      throw StorageException('Failed to upload file: ${e.message}');
    } catch (e) {
      throw StorageException('An unexpected error occurred while uploading');
    }
  }

  // Download file
  Future<File> downloadFile(
    String path,
    String bucket,
    String destinationPath,
  ) async {
    try {
      final bytes = await supabase.storage.from(bucket).download(path);
      final file = File(destinationPath);
      await file.writeAsBytes(bytes);
      return file;
    } catch (e) {
      throw StorageException('Failed to download file');
    }
  }

  // Delete file
  Future<void> deleteFile(String path, String bucket) async {
    try {
      await supabase.storage.from(bucket).remove([path]);
    } catch (e) {
      throw StorageException('Failed to delete file');
    }
  }

  // List files in a bucket/folder
  Future<List<FileObject>> listFiles(String bucket, {String? folder}) async {
    try {
      final List<FileObject> files = await supabase.storage
          .from(bucket)
          .list(path: folder);
      return files;
    } catch (e) {
      throw StorageException('Failed to list files');
    }
  }
}
