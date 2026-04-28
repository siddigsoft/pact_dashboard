part of '../../screens/site_verification_screen.dart';

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
    final verifiedByName =
        site['verified_by_name']?.toString() ??
        additionalData['verified_by_name']?.toString() ??
        '';
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
    final marketDiversion =
        additionalData['market_diversion_monitoring'] ??
        site['use_market_diversion'];
    final warehouseMonitoring =
        additionalData['warehouse_monitoring'] ??
        site['use_warehouse_monitoring'];

    // All site-detail fields from schema (mmp_site_entries + additional_data)
    final activityAtSite = site['activity_at_site']?.toString() ?? '';
    final monitoringBy = site['monitoring_by']?.toString() ?? '';
    final surveyTool = site['survey_tool']?.toString() ?? '';
    final cost = site['cost'];
    final enumeratorFee = site['enumerator_fee'];
    final transportFee = site['transport_fee'];
    final dispatchedBy = site['dispatched_by']?.toString() ?? '';
    final dispatchedByName =
        site['dispatched_by_name']?.toString() ??
        additionalData['dispatched_by_name']?.toString() ??
        '';
    final dispatchedAtRaw = site['dispatched_at']?.toString();
    final dispatchedAt = dispatchedAtRaw != null && dispatchedAtRaw.isNotEmpty
        ? DateTime.tryParse(dispatchedAtRaw)
        : null;
    final acceptedBy = site['accepted_by']?.toString() ?? '';
    final acceptedByName =
        site['accepted_by_name']?.toString() ??
        additionalData['accepted_by_name']?.toString() ??
        '';
    final acceptedAtRaw = site['accepted_at']?.toString();
    final acceptedAt = acceptedAtRaw != null && acceptedAtRaw.isNotEmpty
        ? DateTime.tryParse(acceptedAtRaw)
        : null;
    final visitStartedAtRaw = site['visit_started_at']?.toString();
    final visitStartedAt =
        visitStartedAtRaw != null && visitStartedAtRaw.isNotEmpty
        ? DateTime.tryParse(visitStartedAtRaw)
        : null;
    final visitCompletedAtRaw = site['visit_completed_at']?.toString();
    final visitCompletedAt =
        visitCompletedAtRaw != null && visitCompletedAtRaw.isNotEmpty
        ? DateTime.tryParse(visitCompletedAtRaw)
        : null;
    final rejectionComments = site['rejection_comments']?.toString() ?? '';
    final rejectedBy = site['rejected_by']?.toString() ?? '';
    final rejectedByName =
        site['rejected_by_name']?.toString() ??
        additionalData['rejected_by_name']?.toString() ??
        '';
    final rejectedAtRaw = site['rejected_at']?.toString();
    final rejectedAt = rejectedAtRaw != null && rejectedAtRaw.isNotEmpty
        ? DateTime.tryParse(rejectedAtRaw)
        : null;
    // registry_site_id: top-level or inside additional_data.registry_linkage (pactdb)
    final registryLinkage = additionalData['registry_linkage'] is Map
        ? additionalData['registry_linkage'] as Map<String, dynamic>
        : null;
    final topLevelRegId = site['registry_site_id']?.toString().trim() ?? '';
    final registrySiteId = topLevelRegId.isNotEmpty
        ? topLevelRegId
        : (registryLinkage?['registry_site_id']?.toString().trim() ?? '');

    String fmtDate(DateTime? d) =>
        d != null ? '${d.day}/${d.month}/${d.year}' : '';
    String fmtNum(dynamic v) {
      if (v == null) return '';
      if (v is num) return v.toString();
      return v.toString();
    }

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
          // Content — all site details from schema, grouped by section
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSectionHeader('Location & identity'),
                  _buildInfoRow(
                    'Location',
                    [locality, state].where((s) => s.isNotEmpty).join(', '),
                  ),
                  _buildInfoRow('Hub Office', hubOffice),
                  _buildInfoRow('CP Name', cpName),
                  if (registrySiteId.isNotEmpty)
                    _buildInfoRow('Registry Site ID', registrySiteId),

                  _buildSectionHeader('Visit & activity'),
                  if (site['status'] != null)
                    _buildInfoRow(
                      'Status',
                      formatStatus(site['status'].toString()),
                    ),
                  if (visitDate != null)
                    _buildInfoRow('Visit Date', fmtDate(visitDate)),
                  if (visitType.isNotEmpty)
                    _buildInfoRow('Visit Type', visitType),
                  if (mainActivity.isNotEmpty)
                    _buildInfoRow('Main Activity', mainActivity),
                  if (activityAtSite.isNotEmpty)
                    _buildInfoRow('Activity at Site', activityAtSite),
                  if (monitoringBy.isNotEmpty)
                    _buildInfoRow('Monitoring By', monitoringBy),
                  if (surveyTool.isNotEmpty)
                    _buildInfoRow('Survey Tool', surveyTool),
                  if (toolsToBeUsed.isNotEmpty)
                    _buildInfoRow('Tools to be Used', toolsToBeUsed),

                  if (cost != null ||
                      enumeratorFee != null ||
                      transportFee != null) ...[
                    _buildSectionHeader('Cost'),
                    if (cost != null) _buildInfoRow('Cost', fmtNum(cost)),
                    if (enumeratorFee != null)
                      _buildInfoRow('Enumerator Fee', fmtNum(enumeratorFee)),
                    if (transportFee != null)
                      _buildInfoRow('Transport Fee', fmtNum(transportFee)),
                  ],

                  _buildSectionHeader('Workflow'),
                  if (dispatchedBy.isNotEmpty || dispatchedAt != null)
                    _buildInfoRow(
                      'Dispatched',
                      [
                        if (dispatchedAt != null) fmtDate(dispatchedAt),
                        if (dispatchedBy.isNotEmpty ||
                            dispatchedByName.isNotEmpty)
                          'by ${dispatchedByName.isNotEmpty ? dispatchedByName : dispatchedBy}',
                      ].join(' ').trim(),
                    ),
                  if (acceptedBy.isNotEmpty || acceptedAt != null)
                    _buildInfoRow(
                      'Accepted',
                      [
                        if (acceptedAt != null) fmtDate(acceptedAt),
                        if (acceptedBy.isNotEmpty || acceptedByName.isNotEmpty)
                          'by ${acceptedByName.isNotEmpty ? acceptedByName : acceptedBy}',
                      ].join(' ').trim(),
                    ),
                  if (visitStartedAt != null)
                    _buildInfoRow('Visit Started', fmtDate(visitStartedAt)),
                  if (visitCompletedAt != null)
                    _buildInfoRow('Visit Completed', fmtDate(visitCompletedAt)),
                  if (verifiedAt != null)
                    _buildInfoRow(
                      'Verified',
                      '${fmtDate(verifiedAt)}${(verifiedBy.isNotEmpty || verifiedByName.isNotEmpty) ? ' by ${verifiedByName.isNotEmpty ? verifiedByName : verifiedBy}' : ''}',
                    ),
                  if (rejectedBy.isNotEmpty || rejectedAt != null)
                    _buildInfoRow(
                      'Rejected',
                      [
                        if (rejectedAt != null) fmtDate(rejectedAt),
                        if (rejectedBy.isNotEmpty || rejectedByName.isNotEmpty)
                          'by ${rejectedByName.isNotEmpty ? rejectedByName : rejectedBy}',
                      ].join(' ').trim(),
                    ),

                  _buildSectionHeader('Permit & options'),
                  if (additionalData['state_permit_issue_date'] != null)
                    _buildInfoRow(
                      'State Permit Issue',
                      additionalData['state_permit_issue_date'].toString(),
                    ),
                  if (additionalData['state_permit_expiry_date'] != null)
                    _buildInfoRow(
                      'State Permit Expiry',
                      additionalData['state_permit_expiry_date'].toString(),
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
                      'Market Diversion',
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
                  const SizedBox(height: 12),
                  Text(
                    'Permit Status',
                    style: GoogleFonts.poppins(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF374151),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildPermitStatus(additionalData),

                  if (verificationNotes.isNotEmpty ||
                      comments.isNotEmpty ||
                      rejectionComments.isNotEmpty) ...[
                    _buildSectionHeader('Notes'),
                    if (verificationNotes.isNotEmpty)
                      _buildInfoRow('Verification Notes', verificationNotes),
                    if (comments.isNotEmpty)
                      _buildInfoRow('Comments', comments),
                    if (rejectionComments.isNotEmpty)
                      _buildInfoRow('Rejection Comments', rejectionComments),
                  ],
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

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Text(
        title,
        style: GoogleFonts.poppins(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: AppColors.primaryBlue,
          letterSpacing: 0.3,
        ),
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
