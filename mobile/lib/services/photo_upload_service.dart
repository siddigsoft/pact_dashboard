import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:developer' as developer;
import 'r2_storage_service.dart';

class PhotoUploadService {
  /// Upload photos to Cloudflare R2 (same pipeline as Workspace).
  ///
  /// [photoPaths] is a list of local file paths (String) that will be uploaded
  /// Returns a list of `r2:` refs for the uploaded photos
  static Future<List<String>> uploadPhotos(
    String siteId,
    List<String> photoPaths,
  ) async {
    final uploadedUrls = <String>[];

    try {
      if (kIsWeb) {
        developer.log(
          'PhotoUploadService: skipping photo uploads on web (not supported with File-based implementation).',
        );
        return uploadedUrls;
      }

      for (int i = 0; i < photoPaths.length; i++) {
        final photoPath = photoPaths[i];
        final file = File(photoPath);

        if (!await file.exists()) {
          developer.log('Photo file does not exist: $photoPath');
          continue;
        }

        final timestamp = DateTime.now().millisecondsSinceEpoch;
        final fileName = '${timestamp}_$i.jpg';

        try {
          final supabase = Supabase.instance.client;
          final session = supabase.auth.currentSession;
          if (session == null || session.isExpired) {
            try {
              await supabase.auth.refreshSession();
            } catch (refreshError) {
              developer.log(
                'PhotoUploadService: Session refresh failed: $refreshError',
              );
            }
          }

          final bytes = await file.readAsBytes();
          final ref = await R2StorageService.uploadBytes(
            bytes: bytes,
            fileName: fileName,
            folderPath: 'SiteVisits/$siteId',
          );
          uploadedUrls.add(ref);
          developer.log('Photo uploaded: $ref');
        } catch (uploadError) {
          developer.log('Error uploading photo $i: $uploadError');
          continue;
        }
      }

      return uploadedUrls;
    } catch (e) {
      developer.log('Error uploading photos: $e');
      rethrow;
    }
  }

  static Future<void> deletePhotos(List<String> photoUrls) async {
    try {
      for (final url in photoUrls) {
        final key = R2StorageService.parseRef(url);
        if (key != null) {
          await Supabase.instance.client.functions.invoke(
            'r2-sign',
            body: {'action': 'delete', 'key': key},
          );
          continue;
        }

        final uri = Uri.tryParse(url);
        if (uri == null) continue;
        final pathParts = uri.path.split('/');
        if (pathParts.length <= 1) continue;
        final fullPath = pathParts.sublist(0, pathParts.length).join('/');
        await Supabase.instance.client.storage
            .from('site-visit-photos')
            .remove([fullPath]);
      }
    } catch (e) {
      developer.log('Error deleting photos: $e');
    }
  }
}
