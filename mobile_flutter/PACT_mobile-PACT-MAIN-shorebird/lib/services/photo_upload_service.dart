import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:developer' as developer;

class PhotoUploadService {
  /// Upload photos to Supabase Storage
  /// 
  /// [photoPaths] is a list of local file paths (String) that will be uploaded
  /// Returns a list of public URLs for the uploaded photos
  static Future<List<String>> uploadPhotos(
    String siteId,
    List<String> photoPaths,
  ) async {
    final uploadedUrls = <String>[];

    try {
      // On Flutter Web, dart:io File APIs are not supported. For now, skip
      // storage uploads on web to avoid runtime errors and allow the
      // completion flow to succeed.
      if (kIsWeb) {
        developer.log('PhotoUploadService: skipping photo uploads on web (not supported with File-based implementation).');
        return uploadedUrls;
      }

      for (int i = 0; i < photoPaths.length; i++) {
        final photoPath = photoPaths[i];
        final file = File(photoPath);

        if (!await file.exists()) {
          developer.log('Photo file does not exist: $photoPath');
          continue;
        }

        // Create unique file name
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        final fileName = 'site-visits/$siteId/${timestamp}_$i.jpg';
        
        try {
          // Check and refresh session before each upload if needed
          final supabase = Supabase.instance.client;
          final session = supabase.auth.currentSession;
          if (session == null || session.isExpired) {
            developer.log('PhotoUploadService: Session expired before upload $i, refreshing...');
            try {
              await supabase.auth.refreshSession();
              developer.log('PhotoUploadService: Session refreshed successfully');
            } catch (refreshError) {
              developer.log('PhotoUploadService: Session refresh failed: $refreshError');
              // Continue anyway - might still work if token is valid but expired flag is wrong
            }
          }

          // Upload to Supabase Storage
          await supabase.storage
              .from('site-visit-photos')
              .upload(
                fileName,
                file,
                fileOptions: const FileOptions(
                  contentType: 'image/jpeg',
                  upsert: false,
                ),
              );
          
          // Get public URL
          final publicUrl = supabase.storage
              .from('site-visit-photos')
              .getPublicUrl(fileName);

          uploadedUrls.add(publicUrl);
          developer.log('Photo uploaded: $publicUrl');
        } catch (uploadError) {
          developer.log('Error uploading photo $i: $uploadError');
          
          // Check if it's an auth error and try to recover
          final errorStr = uploadError.toString().toLowerCase();
          if ((errorStr.contains('auth') || errorStr.contains('unauthorized') || 
               errorStr.contains('jwt') || errorStr.contains('token')) &&
              i == 0) {
            // If first photo fails with auth error, try refreshing session and retry
            developer.log('PhotoUploadService: Auth error on first photo, attempting recovery...');
            try {
              final supabase = Supabase.instance.client;
              await supabase.auth.refreshSession();
              // Retry upload
              await supabase.storage
                  .from('site-visit-photos')
                  .upload(
                    fileName,
                    file,
                    fileOptions: const FileOptions(
                      contentType: 'image/jpeg',
                      upsert: false,
                    ),
                  );
              final publicUrl = supabase.storage
                  .from('site-visit-photos')
                  .getPublicUrl(fileName);
              uploadedUrls.add(publicUrl);
              developer.log('PhotoUploadService: Retry successful after session refresh');
            } catch (retryError) {
              developer.log('PhotoUploadService: Retry failed: $retryError');
              // Continue with other photos even if this one fails
              continue;
            }
          } else {
            // Continue with other photos even if one fails
            continue;
          }
        }
      }

      return uploadedUrls;
    } catch (e) {
      developer.log('Error uploading photos: $e');
      rethrow;
    }
  }

  /// Delete photos from storage
  static Future<void> deletePhotos(List<String> photoUrls) async {
    try {
      for (final url in photoUrls) {
        // Extract file path from URL
        final uri = Uri.parse(url);
        final pathParts = uri.path.split('/');
        final fileName = pathParts.last;

        if (pathParts.length > 1) {
          final folderPath = pathParts.sublist(0, pathParts.length - 1).join('/');
          final fullPath = '$folderPath/$fileName';

          await Supabase.instance.client.storage
              .from('site-visit-photos')
              .remove([fullPath]);
        }
      }
    } catch (e) {
      developer.log('Error deleting photos: $e');
    }
  }
}

