import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
// import '../models/mmp_file.dart'; // Commented - model fields don't match

class DocumentService {
  Future<void> openDocument(dynamic file) async {
    final filePath = file['path'] ?? file.toString();
    final uri = Uri.file(filePath);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      throw Exception('Could not open file: $filePath');
    }
  }

  Future<String> saveDocumentFromBytes(String fileName, List<int> bytes) async {
    final appDir = await getApplicationDocumentsDirectory();
    final savedFile = File('${appDir.path}/$fileName');
    await savedFile.writeAsBytes(bytes);
    return savedFile.path;
  }

  Future<List<Map<String, dynamic>>> getDocuments() async {
    final appDir = await getApplicationDocumentsDirectory();
    final files = appDir.listSync();

    return files.map((file) {
      final stat = file.statSync();
      return {
        'name': file.path.split('/').last,
        'path': file.path,
        'dateModified': stat.modified,
        'size': stat.size,
      };
    }).toList();
  }

  Future<void> deleteDocument(String path) async {
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }
}
