import 'dart:html' as html;
import 'dart:typed_data';

/// Download raw bytes as a file in the browser by creating an anchor element.
Future<void> downloadFileBytes(
  List<int> bytes,
  String filename, {
  String mimeType =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}) async {
  final uint8 = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
  final blob = html.Blob([uint8], mimeType);
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.document.createElement('a') as html.AnchorElement;
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  html.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  html.Url.revokeObjectUrl(url);
}
