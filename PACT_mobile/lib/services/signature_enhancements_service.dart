import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SignatureTemplate {
  final String id;
  final String name;
  final String signatureId;
  final double x;
  final double y;
  final double width;
  final double height;
  final int pageNumber;
  final DateTime createdAt;

  SignatureTemplate({
    required this.id,
    required this.name,
    required this.signatureId,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.pageNumber = 1,
    required this.createdAt,
  });

  factory SignatureTemplate.fromJson(Map<String, dynamic> json) {
    return SignatureTemplate(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      signatureId: json['signature_id']?.toString() ?? '',
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      width: (json['width'] as num?)?.toDouble() ?? 150,
      height: (json['height'] as num?)?.toDouble() ?? 50,
      pageNumber: json['page_number'] as int? ?? 1,
      createdAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'signature_id': signatureId,
      'x': x,
      'y': y,
      'width': width,
      'height': height,
      'page_number': pageNumber,
      'created_at': createdAt.toIso8601String(),
    };
  }
}

class SignatureVerification {
  final String documentHash;
  final String signatureHash;
  final DateTime signedAt;
  final String signerId;
  final String signerName;
  final bool isValid;

  SignatureVerification({
    required this.documentHash,
    required this.signatureHash,
    required this.signedAt,
    required this.signerId,
    required this.signerName,
    required this.isValid,
  });
}

class SignatureEnhancementsService {
  final SupabaseClient _supabase = Supabase.instance.client;
  static const String _offlineSignaturesBox = 'offline_signatures';
  static const String _signatureTemplatesBox = 'signature_templates';

  String? get _currentUserId => _supabase.auth.currentUser?.id;

  // ==================== TYPED SIGNATURES ====================

  final List<String> availableFonts = [
    'Dancing Script',
    'Great Vibes',
    'Pacifico',
    'Allura',
    'Sacramento',
    'Alex Brush',
    'Satisfy',
    'Tangerine',
  ];

  Future<Uint8List?> generateTypedSignature({
    required String name,
    required String fontFamily,
    double fontSize = 48,
    Color color = Colors.black,
  }) async {
    try {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);

      final textStyle = TextStyle(
        fontFamily: fontFamily,
        fontSize: fontSize,
        color: color,
      );

      final textSpan = TextSpan(text: name, style: textStyle);
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      );

      textPainter.layout();

      final width = textPainter.width + 20;
      final height = textPainter.height + 20;

      // Draw on white background
      canvas.drawRect(
        Rect.fromLTWH(0, 0, width, height),
        Paint()..color = Colors.white,
      );

      textPainter.paint(canvas, const Offset(10, 10));

      final picture = recorder.endRecording();
      final image = await picture.toImage(width.ceil(), height.ceil());
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

      return byteData?.buffer.asUint8List();
    } catch (e) {
      debugPrint(
        '[SignatureEnhancements] Error generating typed signature: $e',
      );
      return null;
    }
  }

  // ==================== INITIALS SIGNATURE ====================

  Future<Uint8List?> generateInitialsSignature({
    required String initials,
    String fontFamily = 'Dancing Script',
    double fontSize = 36,
    Color color = Colors.black,
    Color backgroundColor = Colors.white,
    bool circular = true,
  }) async {
    try {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);

      const size = 80.0;

      // Draw background
      if (circular) {
        canvas.drawCircle(
          const Offset(size / 2, size / 2),
          size / 2,
          Paint()..color = backgroundColor,
        );
        canvas.drawCircle(
          const Offset(size / 2, size / 2),
          size / 2 - 2,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      } else {
        canvas.drawRect(
          const Rect.fromLTWH(0, 0, size, size),
          Paint()..color = backgroundColor,
        );
        canvas.drawRect(
          const Rect.fromLTWH(2, 2, size - 4, size - 4),
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }

      // Draw initials
      final textStyle = TextStyle(
        fontFamily: fontFamily,
        fontSize: fontSize,
        color: color,
        fontWeight: FontWeight.bold,
      );

      final textSpan = TextSpan(text: initials.toUpperCase(), style: textStyle);
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      );

      textPainter.layout();
      final offset = Offset(
        (size - textPainter.width) / 2,
        (size - textPainter.height) / 2,
      );
      textPainter.paint(canvas, offset);

      final picture = recorder.endRecording();
      final image = await picture.toImage(size.ceil(), size.ceil());
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

      return byteData?.buffer.asUint8List();
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error generating initials: $e');
      return null;
    }
  }

  // ==================== SIGNATURE VERIFICATION ====================

  String computeHash(Uint8List data) {
    final digest = sha256.convert(data);
    return digest.toString();
  }

  Future<SignatureVerification?> verifySignature({
    required String documentId,
    required String signatureId,
  }) async {
    try {
      final response = await _supabase
          .from('signature_logs')
          .select('*, profiles:user_id(full_name)')
          .eq('document_id', documentId)
          .eq('signature_id', signatureId)
          .single();

      final storedHash = response['document_hash'] as String?;
      final signatureHash = response['signature_hash'] as String?;

      // For verification, we'd need to fetch the current document and compare hashes
      // Here we just validate that the signature record exists and has valid hashes
      final isValid =
          storedHash != null &&
          signatureHash != null &&
          storedHash.isNotEmpty &&
          signatureHash.isNotEmpty;

      return SignatureVerification(
        documentHash: storedHash ?? '',
        signatureHash: signatureHash ?? '',
        signedAt:
            DateTime.tryParse(response['signed_at']?.toString() ?? '') ??
            DateTime.now(),
        signerId: response['user_id']?.toString() ?? '',
        signerName: response['profiles']?['full_name']?.toString() ?? '',
        isValid: isValid,
      );
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error verifying signature: $e');
      return null;
    }
  }

  Future<String?> signDocumentWithHash({
    required String documentId,
    required String signatureId,
    required Uint8List documentData,
    required Uint8List signatureData,
  }) async {
    try {
      final documentHash = computeHash(documentData);
      final signatureHash = computeHash(signatureData);
      final timestamp = DateTime.now().toUtc();

      // Create certified timestamp
      final certificationData =
          '$documentHash:$signatureHash:${timestamp.toIso8601String()}';
      final certificationHash = sha256
          .convert(utf8.encode(certificationData))
          .toString();

      await _supabase.from('signature_logs').insert({
        'user_id': _currentUserId,
        'document_id': documentId,
        'signature_id': signatureId,
        'document_hash': documentHash,
        'signature_hash': signatureHash,
        'certification_hash': certificationHash,
        'signed_at': timestamp.toIso8601String(),
      });

      return certificationHash;
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error signing document: $e');
      return null;
    }
  }

  // ==================== BATCH SIGNING ====================

  Future<List<String>> batchSignDocuments({
    required List<String> documentIds,
    required String signatureId,
  }) async {
    final successfulIds = <String>[];

    for (final documentId in documentIds) {
      try {
        await _supabase.from('signature_logs').insert({
          'user_id': _currentUserId,
          'document_id': documentId,
          'signature_id': signatureId,
          'signed_at': DateTime.now().toIso8601String(),
        });
        successfulIds.add(documentId);
      } catch (e) {
        debugPrint(
          '[SignatureEnhancements] Error signing document $documentId: $e',
        );
      }
    }

    return successfulIds;
  }

  // ==================== SIGNATURE TEMPLATES ====================

  Future<List<SignatureTemplate>> getTemplates() async {
    try {
      final response = await _supabase
          .from('signature_templates')
          .select()
          .eq('user_id', _currentUserId ?? '')
          .order('created_at', ascending: false);

      return (response as List)
          .map((t) => SignatureTemplate.fromJson(t))
          .toList();
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error getting templates: $e');
      return [];
    }
  }

  Future<bool> saveTemplate(SignatureTemplate template) async {
    try {
      await _supabase.from('signature_templates').insert({
        'user_id': _currentUserId,
        'name': template.name,
        'signature_id': template.signatureId,
        'x': template.x,
        'y': template.y,
        'width': template.width,
        'height': template.height,
        'page_number': template.pageNumber,
      });
      return true;
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error saving template: $e');
      return false;
    }
  }

  Future<bool> deleteTemplate(String templateId) async {
    try {
      await _supabase.from('signature_templates').delete().eq('id', templateId);
      return true;
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error deleting template: $e');
      return false;
    }
  }

  // ==================== OFFLINE SIGNING ====================

  Future<void> queueOfflineSignature({
    required String documentId,
    required String signatureId,
    required Uint8List signatureData,
    double? x,
    double? y,
  }) async {
    try {
      final box = await Hive.openBox(_offlineSignaturesBox);
      final id = '${DateTime.now().millisecondsSinceEpoch}_$documentId';

      await box.put(id, {
        'document_id': documentId,
        'signature_id': signatureId,
        'signature_data': base64Encode(signatureData),
        'x': x,
        'y': y,
        'created_at': DateTime.now().toIso8601String(),
        'synced': false,
      });

      debugPrint('[SignatureEnhancements] Queued offline signature: $id');
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error queuing offline signature: $e');
    }
  }

  Future<int> syncOfflineSignatures() async {
    try {
      final box = await Hive.openBox(_offlineSignaturesBox);
      int syncedCount = 0;
      final keysToRemove = <dynamic>[];

      for (final key in box.keys) {
        final data = box.get(key);
        if (data == null || data is! Map) continue;

        final map = Map<String, dynamic>.from(data);
        if (map['synced'] == true) {
          keysToRemove.add(key);
          continue;
        }

        try {
          await _supabase.from('signature_logs').insert({
            'user_id': _currentUserId,
            'document_id': map['document_id'],
            'signature_id': map['signature_id'],
            'signed_at': map['created_at'],
            'metadata': {
              'offline': true,
              'synced_at': DateTime.now().toIso8601String(),
            },
          });

          keysToRemove.add(key);
          syncedCount++;
        } catch (e) {
          debugPrint(
            '[SignatureEnhancements] Error syncing signature $key: $e',
          );
        }
      }

      for (final key in keysToRemove) {
        await box.delete(key);
      }

      return syncedCount;
    } catch (e) {
      debugPrint(
        '[SignatureEnhancements] Error syncing offline signatures: $e',
      );
      return 0;
    }
  }

  Future<int> getPendingSignaturesCount() async {
    try {
      final box = await Hive.openBox(_offlineSignaturesBox);
      return box.length;
    } catch (e) {
      return 0;
    }
  }

  // ==================== SIGNATURE PLACEMENT ====================

  Future<bool> applySignatureToDocument({
    required String documentId,
    required String signatureId,
    required double x,
    required double y,
    required double width,
    required double height,
    int pageNumber = 1,
  }) async {
    try {
      await _supabase.from('document_signatures').insert({
        'document_id': documentId,
        'signature_id': signatureId,
        'user_id': _currentUserId,
        'x': x,
        'y': y,
        'width': width,
        'height': height,
        'page_number': pageNumber,
        'applied_at': DateTime.now().toIso8601String(),
      });
      return true;
    } catch (e) {
      debugPrint('[SignatureEnhancements] Error applying signature: $e');
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> getDocumentSignatures(
    String documentId,
  ) async {
    try {
      final response = await _supabase
          .from('document_signatures')
          .select(
            '*, user_signatures!signature_id(*), profiles:user_id(full_name)',
          )
          .eq('document_id', documentId)
          .order('applied_at', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint(
        '[SignatureEnhancements] Error getting document signatures: $e',
      );
      return [];
    }
  }
}
