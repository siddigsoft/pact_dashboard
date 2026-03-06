part of 'site_verification_screen.dart';

}

// Site Details Bottom Sheet
class _SiteDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> site;
  final String category;
  final VoidCallback onVerify;
  final VoidCallback onReturn;
  final VoidCallback onPermitVerify;

  const _SiteDetailsSheet({
    required this.site,
    required this.category,
    required this.onVerify,
    required this.onReturn,
    required this.onPermitVerify,
  });

  @override
  Widget build(BuildContext context) {
    final siteName = site['site_name']?.toString() ?? 'Unknown Site';
    final siteCode = site['site_code']?.toString() ?? '';
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';
    final hubOffice = site['hub_office']?.toString() ?? '';
    final cpName = site['cp_name']?.toString() ?? '';
    final visitType = site['visit_type']?.toString() ?? '';
    final mainActivity = site['main_activity']?.toString() ?? '';
    // Local helper to format statuses within this sheet
    String formatStatus(String status) {
      return status
          .replaceAll('_', ' ')
          .split(' ')
          .map(
            (word) => word.isNotEmpty
                ? '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}'
                : '',
          )
          .join(' ');
    }

    final comments = site['comments']?.toString() ?? '';
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};

    final visitDateRaw = site['visit_date']?.toString();
    final visitDate = visitDateRaw != null && visitDateRaw.isNotEmpty
        ? DateTime.tryParse(visitDateRaw)
        : null;
    final verifiedAtRaw = site['verified_at']?.toString();
    final verifiedAt = verifiedAtRaw != null && verifiedAtRaw.isNotEmpty
        ? DateTime.tryParse(verifiedAtRaw)
        : null;
    final verifiedBy = site['verified_by']?.toString() ?? '';
    final verificationNotes =
        (site['verification_notes']?.toString() ??
        additionalData['verification_notes']?.toString() ??
        '');
    final toolsToBeUsed =
        (site['tool_to_be_used'] ??
                site['tools_to_be_used'] ??
                site['survey_tool'] ??
                site['tool'] ??
                additionalData['tool_to_be_used'] ??
                additionalData['tools_to_be_used'] ??
                additionalData['survey_tool'] ??
                additionalData['tool'] ??
                '')
            .toString()
            .trim();
    final marketDiversion = additionalData['market_diversion_monitoring'];
    final warehouseMonitoring = additionalData['warehouse_monitoring'];

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.symmetric(vertical: 12),
            width: 48,
            height: 5,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          // Title with gradient background
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.primaryBlue.withValues(alpha: 0.1),
                  AppColors.primaryBlue.withValues(alpha: 0.05),
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.primaryBlue, AppColors.darkBlue],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.location_on,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        siteName,
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF111827),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        siteCode,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: const Color(0xFF6B7280),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: Color(0xFF6B7280)),
                  ),
                ),
              ],
            ),
          ),
          // Content
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildInfoRow('Location', '$locality, $state'),
                  _buildInfoRow('Hub Office', hubOffice),
                  _buildInfoRow('CP Name', cpName),
                  if (site['status'] != null)
                    _buildInfoRow(
                      'Status',
                      formatStatus(site['status'].toString()),
                    ),
                  if (visitDate != null)
                    _buildInfoRow(
                      'Visit Date',
                      '${visitDate.day}/${visitDate.month}/${visitDate.year}',
                    ),
                  if (verificationNotes.isNotEmpty)
                    _buildInfoRow('Verification Notes', verificationNotes),
                  if (verifiedAt != null)
                    _buildInfoRow(
                      'Verified At',
                      '${verifiedAt.day}/${verifiedAt.month}/${verifiedAt.year} by ${verifiedBy.isNotEmpty ? verifiedBy : 'Unknown'}',
                    ),
                  if (additionalData['locality_permit_issue_date'] != null)
                    _buildInfoRow(
                      'Locality Permit Issue',
                      additionalData['locality_permit_issue_date'].toString(),
                    ),
                  if (additionalData['locality_permit_expiry_date'] != null)
                    _buildInfoRow(
                      'Locality Permit Expiry',
                      additionalData['locality_permit_expiry_date'].toString(),
                    ),
                  if (marketDiversion != null)
                    _buildInfoRow(
                      'Market Diversion Monitoring',
                      marketDiversion is bool
                          ? (marketDiversion ? 'Yes' : 'No')
                          : marketDiversion.toString(),
                    ),
                  if (warehouseMonitoring != null)
                    _buildInfoRow(
                      'Warehouse Monitoring',
                      warehouseMonitoring is bool
                          ? (warehouseMonitoring ? 'Yes' : 'No')
                          : warehouseMonitoring.toString(),
                    ),
                  if ((additionalData['isFlagged'] == true) &&
                      (additionalData['flagReason'] != null))
                    _buildInfoRow(
                      'Flag Reason',
                      additionalData['flagReason'].toString(),
                    ),
                  const SizedBox(height: 16),
                  _buildInfoRow('Visit Type', visitType),
                  if (toolsToBeUsed.isNotEmpty)
                    _buildInfoRow('Tools to be Used', toolsToBeUsed),
                  _buildInfoRow('Main Activity', mainActivity),
                  if (comments.isNotEmpty) _buildInfoRow('Comments', comments),
                  const SizedBox(height: 16),
                  Text(
                    'Permit Status',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildPermitStatus(additionalData),
                  const SizedBox(height: 24),
                  // Action buttons
                  if (category == 'pending') ...[
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [AppColors.primaryBlue, AppColors.darkBlue],
                          ),
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primaryBlue.withValues(
                                alpha: 0.3,
                              ),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onPermitVerify();
                          },
                          icon: const Icon(Icons.verified_user),
                          label: const Text('Verify Permits'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            foregroundColor: Colors.white,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          onReturn();
                        },
                        icon: const Icon(Icons.undo),
                        label: const Text('Return to FOM'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFEF4444),
                          side: const BorderSide(
                            color: Color(0xFFEF4444),
                            width: 1.5,
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (category == 'permits')
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF10B981), Color(0xFF059669)],
                          ),
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(
                                0xFF10B981,
                              ).withValues(alpha: 0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onVerify();
                          },
                          icon: const Icon(Icons.verified),
                          label: const Text('Verify Site'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            foregroundColor: Colors.white,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[600]),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermitStatus(Map<String, dynamic> additionalData) {
    final hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    return Column(
      children: [
        _buildPermitRow(
          'State Permit',
          hasStatePermit
              ? 'Attached'
              : stateNotRequired
              ? 'Not Required'
              : 'Pending',
          hasStatePermit || stateNotRequired,
        ),
        const SizedBox(height: 8),
        _buildPermitRow(
          'Locality Permit',
          hasLocalityPermit ? 'Attached' : 'Pending',
          hasLocalityPermit,
        ),
      ],
    );
  }

  Widget _buildPermitRow(String label, String status, bool isComplete) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isComplete
            ? Colors.green.withValues(alpha: 0.1)
            : AppColors.primaryBlue.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isComplete
              ? Colors.green.withValues(alpha: 0.3)
              : AppColors.primaryBlue.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isComplete ? Icons.check_circle : Icons.pending,
            color: isComplete ? Colors.green : AppColors.primaryBlue,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                ),
                Text(
                  status,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: isComplete
                        ? Colors.green[700]
                        : AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

