part of '../../screens/site_verification_screen.dart';

extension _SiteVerificationCardWidgets on _SiteVerificationScreenState {
  Widget _buildSiteCard(
    Map<String, dynamic> site,
    String category, {
    bool isSelectable = false,
    bool isSelected = false,
    VoidCallback? onToggle,
  }) {
    final siteName = site['site_name']?.toString() ?? 'Unknown Site';
    final siteCode = site['site_code']?.toString() ?? '';
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';
    final status = site['status']?.toString() ?? '';
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
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
    final mainActivity =
        (site['main_activity'] ??
                site['activity_type'] ??
                site['activity'] ??
                additionalData['main_activity'] ??
                additionalData['activity_type'] ??
                additionalData['activity'] ??
                '')
            .toString()
            .trim();
    final plannedActivity =
        (site['activity_at_site'] ?? additionalData['activity_at_site'] ?? '')
            .toString()
            .trim();
    final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
    final projectName = mmpFile['name']?.toString() ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: AppColors.shadowColor.withValues(alpha: 0.06),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: InkWell(
          onTap: () => _showSiteDetails(site, category),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(
                  children: [
                    if (isSelectable && onToggle != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Checkbox(
                          value: isSelected,
                          onChanged: (_) => onToggle(),
                          activeColor: AppColors.primaryBlue,
                        ),
                      ),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _getStatusColor(status).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        _getStatusIcon(status),
                        color: _getStatusColor(status),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            siteName,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                              color: const Color(0xFF111827),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            siteCode,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: const Color(0xFF6B7280),
                              letterSpacing: 0.5,
                            ),
                          ),
                          if (projectName.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.backgroundGray,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.folder,
                                    size: 14,
                                    color: AppColors.textDark,
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      projectName,
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: const Color(0xFF374151),
                                      ),
                                      maxLines: 2,
                                      softWrap: true,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    Flexible(
                      fit: FlexFit.loose,
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: _buildStatusChip(status),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Location info with improved styling
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: const Color(0xFFE5E7EB),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppColors.primaryBlue.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.location_on,
                          size: 16,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              locality,
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: const Color(0xFF374151),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              state,
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: const Color(0xFF6B7280),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (projectName.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(
                        Icons.folder_outlined,
                        size: 16,
                        color: Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          projectName,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B7280),
                          ),
                          maxLines: 2,
                          softWrap: true,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],

                // Coordinator summary fields (CP, Activity, Tool)
                const SizedBox(height: 8),
                if (additionalData['cp_name'] != null) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.person_outline,
                        size: 14,
                        color: Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          additionalData['cp_name'].toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF374151),
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],

                if (toolsToBeUsed.isNotEmpty) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.analytics_outlined,
                        size: 14,
                        color: Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Tools to be Used: $toolsToBeUsed',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B7280),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                if (mainActivity.isNotEmpty || plannedActivity.isNotEmpty) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.work_outline,
                        size: 14,
                        color: Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Main Activity
                            if (mainActivity.isNotEmpty)
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _bi('Main Activity', 'النشاط الرئيسي'),
                                    style: GoogleFonts.poppins(
                                      fontSize: 10,
                                      color: const Color(0xFF9CA3AF),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    mainActivity,
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: const Color(0xFF374151),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            // Activity at Site
                            if (plannedActivity.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _bi('Planned Activity', 'النشاط المخطط'),
                                    style: GoogleFonts.poppins(
                                      fontSize: 10,
                                      color: const Color(0xFF9CA3AF),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    plannedActivity,
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: const Color(0xFF374151),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // Flag indicator
                if (additionalData['isFlagged'] == true) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.red.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.report_problem,
                          size: 14,
                          color: Colors.red,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Flagged: ${additionalData['flagReason'] ?? 'Issue reported'}',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.red[700],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                // Permit status indicators
                const SizedBox(height: 16),
                _buildPermitIndicators(additionalData, site),
                // Action buttons based on category
                if (category == 'new' ||
                    category == 'new_state_tab_site' ||
                    category == 'locality_permit' ||
                    category == 'cp_verification' ||
                    category == 'rejected') ...[
                  const SizedBox(height: 16),
                  _buildActionButtons(site, category),
                ],
              ],
            ),
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildStatusChip(String status) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 120),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: _getStatusColor(status).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: _getStatusColor(status).withValues(alpha: 0.3),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: _getStatusColor(status),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              _formatStatus(status),
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: _getStatusColor(status),
              ),
              maxLines: 2,
              softWrap: true,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  String _formatStatus(String status) {
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

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'dispatched':
      case 'assigned':
        return AppColors.primaryBlue;
      case 'permits_attached':
        return Colors.blue;
      case 'verified':
        return Colors.green;
      case 'returned_to_fom':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'dispatched':
      case 'assigned':
        return Icons.pending_actions;
      case 'permits_attached':
        return Icons.attach_file;
      case 'verified':
        return Icons.verified;
      case 'returned_to_fom':
        return Icons.undo;
      default:
        return Icons.help_outline;
    }
  }

  Widget _buildPermitIndicators(
    Map<String, dynamic> additionalData, [
    Map<String, dynamic>? site,
  ]) {
    var hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;
    if (!hasStatePermit && !stateNotRequired && site != null) {
      hasStatePermit = _hasStatePermitFromMmpFile(site);
    }
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    return Row(
      children: [
        Expanded(
          child: _buildPermitChip(
            'State Permit',
            hasStatePermit
                ? 'Attached'
                : stateNotRequired
                ? 'N/A'
                : 'Pending',
            hasStatePermit || stateNotRequired,
            Icons.shield_outlined,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _buildPermitChip(
            'Locality',
            hasLocalityPermit ? 'Attached' : 'Pending',
            hasLocalityPermit,
            Icons.location_city_outlined,
          ),
        ),
      ],
    );
  }

  Widget _buildPermitChip(
    String label,
    String status,
    bool isComplete,
    IconData icon,
  ) {
    final color = isComplete ? const Color(0xFF10B981) : AppColors.primaryBlue;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF6B7280),
                  ),
                  maxLines: 2,
                  softWrap: true,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 4),
              Text(
                status,
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
