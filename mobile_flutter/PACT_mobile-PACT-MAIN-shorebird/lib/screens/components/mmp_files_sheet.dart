import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/mmp_file.dart';
import '../../services/mmp_file_service.dart';
import '../../widgets/mmp_preview_bottom_sheet.dart';

class MMPFilesSheet extends StatefulWidget {
  const MMPFilesSheet({super.key});

  @override
  State<MMPFilesSheet> createState() => _MMPFilesSheetState();
}

class _MMPFilesSheetState extends State<MMPFilesSheet> {
  final MMPFileService _mmpService = MMPFileService();
  List<MMPFile> _files = <MMPFile>[];
  bool _isLoading = true;
  Set<String> _cachedFileIds = {};

  @override
  void initState() {
    super.initState();
    unawaited(_loadFiles());
    unawaited(_loadCachedFiles());
  }

  @override
  void dispose() {
    _mmpService.dispose();
    super.dispose();
  }

  Future<void> _loadFiles() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
    });

    try {
    final rawFiles = await _mmpService.getMMPFilesCached();
    final mapped = rawFiles
      .map<MMPFile>((file) =>
        MMPFile.fromJson(Map<String, dynamic>.from(file as Map)))
      .toList();

      if (!mounted) return;
      setState(() {
        _files = mapped;
        _isLoading = false;
      });

      // Reload cached file list
      unawaited(_loadCachedFiles());

      if (mapped.isNotEmpty) {
        // Automatically download all files for offline viewing
        unawaited(
          _mmpService.prefetchMMPFiles(mapped, forceRefresh: false).then((_) {
            // Reload cache status after prefetch
            if (mounted) {
              _loadCachedFiles();
            }
          }).catchError((error) {
            debugPrint('Auto-download error: $error');
          }),
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
      _showFriendlyError(
        "Couldn't load MMP files. Connect to sync or try again later.",
      );
    }
  }

  Future<void> _loadCachedFiles() async {
    try {
      final cachedFiles = await _mmpService.getLocallyCachedFiles();
      final cachedIds = cachedFiles
          .map((file) => file['file_id'] as String?)
          .where((id) => id != null)
          .cast<String>()
          .toSet();
      
      if (mounted) {
        setState(() {
          _cachedFileIds = cachedIds;
        });
      }
    } catch (e) {
      debugPrint('Error loading cached files: $e');
    }
  }

  void _showFriendlyError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _openInAppViewer(MMPFile file) async {
    if (!mounted) return;

    // Show loading indicator
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    try {
      final localPath = await _mmpService.ensureFileAvailable(file);
      
      if (!mounted) return;
      
      // Close loading dialog
      Navigator.of(context).pop();
      
      // Open the viewer
      MMPPreviewBottomSheet.show(context, file: file, localPath: localPath);
    } on OfflineFileUnavailableException catch (offlineError) {
      if (!mounted) return;
      Navigator.of(context).pop(); // Close loading dialog
      _showFriendlyError(offlineError.message);
    } catch (error) {
      if (!mounted) return;
      Navigator.of(context).pop(); // Close loading dialog
      _showFriendlyError('Unable to open file: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.2,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).canvasColor,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(20),
            ),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'MMP Files',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    IconButton(
                      onPressed: _loadFiles,
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Refresh',
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _files.isEmpty
                        ? const Center(
                            child: Text(
                              'No MMP files found. Pull to refresh once connected.',
                              textAlign: TextAlign.center,
                            ),
                          )
                        : ListView.builder(
                            controller: scrollController,
                            itemCount: _files.length,
                            itemBuilder: (context, index) {
                              final file = _files[index];
                              final created =
                                  file.createdAt.toLocal().toString().split('.')[0];
                              final isCached = _cachedFileIds.contains(file.id);
                              
                              return ListTile(
                                title: Text(file.name ?? 'Unnamed File'),
                                subtitle: Text(
                                  'Status: ${file.status ?? 'Unknown'}\nCreated: $created${isCached ? '\n✓ Ready to view' : '\n⏳ Preparing file...'}\nTap to open in Excel viewer',
                                ),
                                leading: Icon(
                                  isCached ? Icons.check_circle : Icons.hourglass_empty,
                                  color: isCached ? Colors.green : Colors.orange,
                                ),
                                onTap: () => _openInAppViewer(file),
                                trailing: const Icon(Icons.open_in_new),
                              );
                            },
                          ),
              ),
            ],
          ),
        );
      },
    );
  }
}

