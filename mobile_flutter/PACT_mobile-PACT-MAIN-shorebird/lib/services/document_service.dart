import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import '../models/mmp_file.dart';

class DocumentService {
  Future<void> openDocument(MMPFile file) async {
    final result = await OpenFile.open(file.localPath);
    if (result.type != ResultType.done) {
      throw Exception('Could not open file: ${result.message}');
    }
  }

  Future<String> saveDocument(PlatformFile file) async {
    final appDir = await getApplicationDocumentsDirectory();
    final savedFile = File('${appDir.path}/${file.name}');
    
    if (file.bytes != null) {
      await savedFile.writeAsBytes(file.bytes!);
    } else if (file.path != null) {
      await File(file.path!).copy(savedFile.path);
    }
    
    return savedFile.path;
  }

  Future<List<MMPFile>> getDocuments() async {
    final appDir = await getApplicationDocumentsDirectory();
    final files = appDir.listSync();
    
    return files.map((file) {
      final stat = file.statSync();
      return MMPFile(
        name: file.path.split('/').last,
        localPath: file.path,
        dateModified: stat.modified,
        size: stat.size,
      );
    }).toList();
  }

  Future<void> deleteDocument(String path) async {
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }
}