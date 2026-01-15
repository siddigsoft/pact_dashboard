// MMP File View Screen - COMMENTED OUT
// This screen is no longer used. MMP functionality has been frozen.
// Uncomment if you need to re-enable MMP file viewing in the future.

/*
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../models/mmp_file.dart';

class MMPFileViewScreen extends StatelessWidget {
  final MMPFile mmpFile;

  const MMPFileViewScreen({super.key, required this.mmpFile});

  Future<void> _openFile() async {
    if (mmpFile.fileUrl == null) return;

    final Uri url = Uri.parse(mmpFile.fileUrl!);
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      throw 'Could not launch ${mmpFile.fileUrl}';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      appBar: AppBar(
        title: Text(
          'MMP Details',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
            color: AppColors.textDark,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          color: AppColors.textDark,
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildInfoCard(),
            const SizedBox(height: 16),
            _buildActionButtons(context),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildDetailRow(
              icon: Icons.insert_drive_file,
              label: 'Document Name',
              value: mmpFile.fileName,
            ),
            const Divider(height: 24),
            _buildDetailRow(
              icon: Icons.calendar_today,
              label: 'Date Sent',
              value: mmpFile.formatDate(),
            ),
            if (mmpFile.siteVisit != null) ...[
              const Divider(height: 24),
              _buildDetailRow(
                icon: Icons.location_on,
                label: 'Site',
                value: mmpFile.siteVisit!.siteName,
              ),
            ],
            const Divider(height: 24),
            _buildDetailRow(
              icon: Icons.description,
              label: 'Description',
              value: mmpFile.description ?? 'No description available',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            onPressed: _openFile,
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open Document'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryOrange,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDetailRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.textLight),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
                ),
              ),
              Text(
                value,
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  color: AppColors.textDark,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
*/
