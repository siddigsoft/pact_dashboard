// lib/screens/components/report_form_sheet.dart

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../models/report_model.dart';
import '../../models/site_visit.dart';
import '../../services/site_visit_service.dart';
import '../../services/storage_service.dart';
import '../../services/offline_data_service.dart';
import '../../theme/app_colors.dart';

class ReportFormSheet extends StatefulWidget {
  final SiteVisit visit;
  final Function(Report) onReportSubmitted;

  const ReportFormSheet({
    super.key,
    required this.visit,
    required this.onReportSubmitted,
  });

  @override
  State<ReportFormSheet> createState() => _ReportFormSheetState();
}

class _ReportFormSheetState extends State<ReportFormSheet> {
  final TextEditingController _notesController = TextEditingController();
  final List<String> _photoUrls = [];
  final SiteVisitService _visitService = SiteVisitService();
  bool _isSubmitting = false;
  bool _showAdvancedOptions = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    final ImagePicker picker = ImagePicker();
    final XFile? image = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
    );

    if (image != null) {
      // In a real app, we would encrypt the image here
      // For this demo, we'll just use the file path
      setState(() {
        _photoUrls.add(image.path);
      });
    }
  }

  Future<void> _submitReport() async {
    if (_notesController.text.trim().isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please enter some notes')));
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    // Show loading dialog
    if (mounted) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (BuildContext context) {
          return Dialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(
                    'Submitting report...',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Please wait',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    }

    try {
      // Show inline progress overlay (snackbar with spinner)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          duration: const Duration(minutes: 1),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.primaryBlue,
          content: Row(
            children: const [
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                  child: Text('Uploading report & photos...',
                      style: TextStyle(color: Colors.white))),
            ],
          ),
        ),
      );
      final offlineService = OfflineDataService();
      final isOnline = await offlineService.isOnline();

      print('🔄 Starting report submission - Online: $isOnline');

      // Create the report
      final report = Report(
        visitId: widget.visit.id,
        notes: _notesController.text.trim(),
        photoUrls: _photoUrls,
      );

      // Prepare report data
      final reportData = {
        'site_visit_id': widget.visit.id,
        'notes': _notesController.text.trim(),
        'submitted_at': DateTime.now().toIso8601String(),
        'is_synced': isOnline,
        'last_modified': DateTime.now().toIso8601String(),
      };

      print('📝 Report data prepared: $reportData');

      if (isOnline) {
        print('☁️ Saving report to Supabase...');
        // Save report to Supabase
        final reportResponse = await _visitService.supabase
            .from('reports')
            .insert(reportData)
            .select()
            .single();

        print('✅ Report saved to Supabase: ${reportResponse['id']}');

        print('✅ Report saved to Supabase: ${reportResponse['id']}');

        // Save photos to Supabase Storage and DB if any
        if (_photoUrls.isNotEmpty) {
          print('📸 Uploading ${_photoUrls.length} photos to storage...');
          final storage = StorageService();
          final reportId = reportResponse['id'];
          final bucket = 'report_photos';

          final List<Map<String, dynamic>> photoInserts = [];
          for (final localPath in _photoUrls) {
            try {
              final file = File(localPath);
              final filename = p.basename(localPath);
              final folder = 'reports/$reportId';

              // Upload file and get public URL
              final publicUrl = await storage.uploadFile(
                file,
                bucket,
                folder: folder,
              );

              photoInserts.add({
                'report_id': reportId,
                'photo_url': publicUrl,
                'storage_path': '$folder/$filename',
                'is_synced': true,
                'last_modified': DateTime.now().toIso8601String(),
              });
            } catch (e) {
              print('⚠️ Failed to upload photo $localPath: $e');
            }
          }

          if (photoInserts.isNotEmpty) {
            await _visitService.supabase
                .from('report_photos')
                .insert(photoInserts);
            print('✅ Photos metadata saved to report_photos');
          }
        }

        // Note: We do NOT update site_visits here per requirement.
        // Any visit status changes will be handled elsewhere in the workflow.
      } else {
        print('💾 Saving report offline...');
        // Save offline for later sync
        reportData['photos'] = _photoUrls
            .map((url) => {
                  'photo_url': url,
                  'storage_path': url,
                })
            .toList();

        await offlineService.saveReportOffline(reportData);
        print('✅ Report saved offline for later sync');

        // Note: Visit status will be updated when sync happens
      }

      // Dismiss loading dialog (if still open)
      if (mounted) {
        Navigator.of(context).pop(); // Close blocking dialog
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }

      // Notify parent
      widget.onReportSubmitted(report);

      print('🎉 Report submission complete!');

      // Close sheet with success message
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  isOnline ? Icons.check_circle : Icons.offline_pin,
                  color: Colors.white,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(isOnline
                      ? 'Report submitted successfully!'
                      : 'Report saved offline. Will sync when online.'),
                ),
              ],
            ),
            backgroundColor: isOnline ? Colors.green : Colors.orange,
            duration: const Duration(seconds: 3),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e, stackTrace) {
      print('❌ Error submitting report: $e');
      print('Stack trace: $stackTrace');

      // Dismiss loading dialog
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 8),
                Expanded(child: Text('Error submitting report: $e')),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _photoUrls.removeAt(index);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
        minHeight: MediaQuery.of(context).size.height * 0.5,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle and header
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Submit Visit Report',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textDark,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _showAdvancedOptions = !_showAdvancedOptions;
                    });
                  },
                  icon: Icon(
                    _showAdvancedOptions
                        ? Icons.expand_less
                        : Icons.expand_more,
                    color: AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ),

          // Visit info
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              widget.visit.siteName,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey,
              ),
            ),
          ),

          // Form content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Notes field
                  const Text(
                    'Visit Notes',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notesController,
                    decoration: InputDecoration(
                      hintText: 'Enter your observations and findings...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      contentPadding: const EdgeInsets.all(16),
                    ),
                    maxLines: 5,
                    minLines: 3,
                  ),

                  const SizedBox(height: 24),

                  // Photos section
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Photos',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: _takePhoto,
                        icon: const Icon(Icons.camera_alt, size: 16),
                        label: const Text('Add Photo'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryOrange,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Photos grid
                  if (_photoUrls.isNotEmpty)
                    GridView.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _photoUrls.length,
                      itemBuilder: (context, index) {
                        final photoUrl = _photoUrls[index];
                        return Stack(
                          children: [
                            Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                image: DecorationImage(
                                  image: FileImage(File(photoUrl)),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: InkWell(
                                onTap: () => _removePhoto(index),
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.5),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close,
                                    color: Colors.white,
                                    size: 16,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        )
                            .animate()
                            .fadeIn(duration: 300.ms, delay: 50.ms * index)
                            .slideY(begin: 0.2, end: 0, duration: 300.ms);
                      },
                    )
                  else
                    Container(
                      alignment: Alignment.center,
                      height: 100,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: Colors.grey.shade300,
                          width: 1,
                        ),
                      ),
                      child: Text(
                        'No photos added yet',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                    ),

                  // Advanced options (conditionally visible)
                  if (_showAdvancedOptions) ...[
                    const SizedBox(height: 24),
                    const Text(
                      'Advanced Options',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Add advanced options here
                  ],
                ],
              ),
            ),
          ),

          // Submit button
          Padding(
            padding: EdgeInsets.fromLTRB(
              24,
              0,
              24,
              24 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submitReport,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  disabledBackgroundColor: Colors.grey.shade300,
                ),
                child: _isSubmitting
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('Submitting...'),
                        ],
                      )
                    : const Text('Submit Report'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
