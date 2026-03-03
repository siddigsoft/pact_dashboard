import 'dart:io';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Save bytes to a temporary file and share / open the native share sheet.
Future<void> downloadFileBytes(
  List<int> bytes,
  String filename, {
  String? mimeType,
}) async {
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(bytes);
  await Share.shareXFiles([XFile(file.path)], text: filename);
}
