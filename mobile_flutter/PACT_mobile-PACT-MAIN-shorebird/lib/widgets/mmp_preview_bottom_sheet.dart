import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:open_file/open_file.dart';
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:url_launcher/url_launcher.dart';

import '../models/mmp_file.dart';
import 'excel_preview_widget.dart';

class MMPPreviewBottomSheet {
  static Future<void> show(
    BuildContext context, {
    required MMPFile file,
    required String localPath,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => _MMPPreviewContent(
        file: file,
        localPath: localPath,
      ),
    );
  }
}

class _MMPPreviewContent extends StatefulWidget {
  final MMPFile file;
  final String localPath;

  const _MMPPreviewContent({
    required this.file,
    required this.localPath,
  });

  @override
  State<_MMPPreviewContent> createState() => _MMPPreviewContentState();
}

class _MMPPreviewContentState extends State<_MMPPreviewContent> {
  WebViewController? _webViewController;
  String? _webViewError;

  String get _fileName => widget.file.originalFilename ?? widget.file.name ?? 'Document';

  @override
  void initState() {
    super.initState();
    _initializeWebViewIfNeeded();
  }

  void _initializeWebViewIfNeeded() {
    final lowered = _fileName.toLowerCase();
    if (!(lowered.endsWith('.pdf') || lowered.endsWith('.html'))) {
      return;
    }

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent);

    controller
        .loadFile(widget.localPath)
        .then((_) {
          if (mounted) {
            setState(() => _webViewController = controller);
          }
        })
        .catchError((error) {
          if (mounted) {
            setState(() => _webViewError = 'Unable to preview document: $error');
          }
        });
  }

  Future<void> _openExternally() async {
    // On web, if localPath is a URL, open it in a new tab
    if (kIsWeb && widget.localPath.startsWith('http')) {
      final uri = Uri.parse(widget.localPath);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return;
      }
    }

    // For mobile or local files, use open_file
    final result = await OpenFile.open(widget.localPath);
    if (result.type != ResultType.done && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not open file: ${result.message}'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _shareFile() async {
    // On web, if localPath is a URL, share the URL directly
    if (kIsWeb && widget.localPath.startsWith('http')) {
      await Share.share('Check out this file: $widget.localPath', subject: _fileName);
      return;
    }

    try {
      await Share.shareXFiles([XFile(widget.localPath)], text: 'Sharing $_fileName');
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unable to share file: $error'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Widget _buildViewer() {
    final lowered = _fileName.toLowerCase();

    if (lowered.endsWith('.xlsx')) {
      // On web, Excel files cannot be previewed in-app due to file system limitations
      if (kIsWeb) {
        return _WebExcelNotice(onOpen: _openExternally, onShare: _shareFile);
      }
      return ExcelPreviewWidget(filePath: widget.localPath);
    }

    if (lowered.endsWith('.xls')) {
      return _LegacyXlsNotice(onOpen: _openExternally, onShare: _shareFile);
    }

    if (lowered.endsWith('.pdf') || lowered.endsWith('.html')) {
      if (_webViewError != null) {
        return _ErrorNotice(message: _webViewError!);
      }
      if (_webViewController == null) {
        return const Center(child: CircularProgressIndicator());
      }
      return WebViewWidget(controller: _webViewController!);
    }

    return const _UnsupportedPreviewNotice();
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.9;

    return SafeArea(
      child: SizedBox(
        height: maxHeight,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _fileName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      Navigator.of(context).maybePop();
                    },
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _openExternally,
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('Open Externally'),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton.icon(
                    onPressed: _shareFile,
                    icon: const Icon(Icons.share),
                    label: const Text('Share'),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(child: _buildViewer()),
          ],
        ),
      ),
    );
  }
}

class _UnsupportedPreviewNotice extends StatelessWidget {
  const _UnsupportedPreviewNotice();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.info_outline, size: 40, color: Colors.orange),
            SizedBox(height: 12),
            Text(
              'Preview not supported for this file type. Use the "Open Externally" button after download.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorNotice extends StatelessWidget {
  final String message;

  const _ErrorNotice({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.redAccent),
        ),
      ),
    );
  }
}

class _LegacyXlsNotice extends StatelessWidget {
  final VoidCallback onOpen;
  final VoidCallback onShare;

  const _LegacyXlsNotice({required this.onOpen, required this.onShare});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.info_outline, size: 40, color: Colors.orange),
            const SizedBox(height: 12),
            const Text(
              'Legacy .xls format cannot be previewed inline.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            const Text(
              'Open the file externally or share it with another app.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onOpen,
              icon: const Icon(Icons.open_in_new),
              label: const Text('Open Externally'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onShare,
              icon: const Icon(Icons.share),
              label: const Text('Share File'),
            ),
          ],
        ),
      ),
    );
  }
}

class _WebExcelNotice extends StatelessWidget {
  final VoidCallback onOpen;
  final VoidCallback onShare;

  const _WebExcelNotice({required this.onOpen, required this.onShare});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.web, size: 40, color: Colors.blue),
            const SizedBox(height: 12),
            const Text(
              'Excel Preview Unavailable on Web',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            const Text(
              'Due to web platform limitations, Excel files cannot be previewed inline. Download and open with your preferred spreadsheet application.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onOpen,
              icon: const Icon(Icons.download),
              label: const Text('Download & Open'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onShare,
              icon: const Icon(Icons.share),
              label: const Text('Share File'),
            ),
          ],
        ),
      ),
    );
  }
}
