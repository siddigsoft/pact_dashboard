import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

/// Cloudflare R2 via the same `r2-sign` edge function the web Workspace uses.
class R2StorageService {
  static const refPrefix = 'r2:';

  static bool isR2Ref(String url) => url.startsWith(refPrefix);

  static String toRef(String key) => '$refPrefix$key';

  static String? parseRef(String url) =>
      isR2Ref(url) ? url.substring(refPrefix.length) : null;

  static Future<String> uploadBytes({
    required Uint8List bytes,
    required String fileName,
    required String folderPath,
  }) async {
    final res = await Supabase.instance.client.functions.invoke(
      'r2-sign',
      body: {
        'action': 'sign-upload',
        'fileName': fileName,
        'folderPath': folderPath,
      },
    );
    final data = res.data;
    if (data is! Map || data['url'] == null || data['key'] == null) {
      throw Exception(
        data is Map && data['error'] != null
            ? data['error'].toString()
            : 'R2 signing failed',
      );
    }
    final url = data['url'] as String;
    final key = data['key'] as String;

    // Presigned URL signs host only — do not send Content-Type.
    final request = http.Request('PUT', Uri.parse(url))..bodyBytes = bytes;
    final streamed = await http.Client().send(request);
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      final body = await streamed.stream.bytesToString();
      throw Exception('R2 upload failed (${streamed.statusCode}): $body');
    }
    return toRef(key);
  }

  static Future<String> resolveUrl(String url) async {
    final key = parseRef(url);
    if (key == null) return url;
    final res = await Supabase.instance.client.functions.invoke(
      'r2-sign',
      body: {'action': 'sign-download', 'key': key},
    );
    final data = res.data;
    if (data is Map && data['url'] is String) {
      return data['url'] as String;
    }
    throw Exception(
      data is Map && data['error'] != null
          ? data['error'].toString()
          : 'R2 download sign failed',
    );
  }
}
