part of 'site_verification_screen.dart';

extension _SiteVerificationActionWidgets on _SiteVerificationScreenState {
  Widget _buildActionButtons(Map<String, dynamic> site, String category) {
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
    var hasStatePermit =
        additionalData['state_permit_attached'] == true ||
        additionalData['state_permit_not_required'] == true;
    if (!hasStatePermit) {
      hasStatePermit = _hasStatePermitFromMmpFile(site);
    }
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    if (category == 'new_state_tab_site') {
      // State Permit sub-tab: no per-site upload; state permit is managed at state level only
      return Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _returnToFOM(site),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Return'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      );
    } else if (category == 'new') {
      // Show Upload Permits button for new sites (e.g. in Locality Permit sub-tab)
      return Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _showPermitVerificationDialog(site),
              icon: Icon(
                !hasStatePermit
                    ? Icons.upload_file
                    : !hasLocalityPermit
                    ? Icons.location_on
                    : Icons.check_circle,
                size: 18,
              ),
              label: Text(
                !hasStatePermit
                    ? 'Upload State Permit'
                    : !hasLocalityPermit
                    ? 'Upload Locality Permit'
                    : 'Permits Complete',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                elevation: 6,
                shadowColor: AppColors.primaryBlue.withValues(alpha: 0.25),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _returnToFOM(site),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Return'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      );
    } else if (category == 'locality_permit') {
      // Sites in Locality Permit tab - state permit already uploaded
      // Show dialog asking if state permit is uploaded before proceeding to locality
      return Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _showLocalityPermitDialog(site),
              icon: const Icon(Icons.location_on, size: 18),
              label: const Text('Permit Status'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                elevation: 6,
                shadowColor: AppColors.primaryBlue.withValues(alpha: 0.25),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _returnToFOM(site),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Return'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      );
    } else if (category == 'cp_verification') {
      // Show Verify Site button for CP verification sites
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _verifySite(site),
          icon: const Icon(Icons.verified, size: 20),
          label: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Verify Site',
                style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
              ),
              Text(
                'تأكيد الموقـــع',
                style: GoogleFonts.poppins(fontSize: 12),
                textDirection: ui.TextDirection.rtl,
              ),
            ],
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF10B981),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 6,
            shadowColor: const Color(0xFF10B981).withValues(alpha: 0.25),
          ),
        ),
      );
    } else if (category == 'rejected') {
      // Show Re-verify button for rejected sites
      return Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _verifySite(site),
              icon: const Icon(
                Icons.refresh,
                size: 18,
                color: AppColors.primaryBlue,
              ),
              label: const Text('Re-verify Site'),
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.primaryBlue,
                side: BorderSide(
                  color: AppColors.primaryBlue.withValues(alpha: 0.12),
                ),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }

  void _showSiteDetails(Map<String, dynamic> site, String category) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _SiteDetailsSheet(
        site: site,
        category: category,
        onVerify: () => _verifySite(site),
        onReturn: () => _returnToFOM(site),
        onPermitVerify: () => _showPermitVerificationDialog(site),
      ),
    );
  }

  void _showPermitVerificationDialog(Map<String, dynamic> site) {
    showDialog(
      context: context,
      builder: (context) => _PermitVerificationDialog(
        site: site,
        onComplete: (permitDecision) async {
          await _updatePermitDecision(site, permitDecision);
        },
        onSendBackToFOM: (reason) async {
          // Handle sending back to FOM
          await _returnToFOMWithReason(site, reason);
        },
      ),
    );
  }

  Future<void> _returnToFOMWithReason(
    Map<String, dynamic> site,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'verification_notes': reason,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Site returned to FOM: $reason'),
            backgroundColor: AppColors.primaryBlue,
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error returning site to FOM: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Show Locality Permit Dialog for sites in Locality Permit tab
  /// This dialog first asks if locality permit is required, then proceeds accordingly
  void _showLocalityPermitDialog(Map<String, dynamic> site) async {
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    // First show locality permit requirement dialog
    final requirementResult = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _BulkLocalityPermitRequirementDialog(
        locality: locality,
        state: state,
        siteCount: 1,
        isArabic: isArabic,
      ),
    );

    if (requirementResult == null) return;

    final localityPermitRequirement = requirementResult['requirement'];

    // If not required, mark as not required
    if (localityPermitRequirement == 'not_required') {
      await _markLocalityPermitNotRequiredSingle(site);
      return;
    }

    // If required but don't have it, show follow-up options
    if (localityPermitRequirement == 'required_dont_have_it') {
      final followUpResult = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => _BulkLocalityPermitFollowUpDialog(
          locality: locality,
          state: state,
          siteCount: 1,
          isArabic: isArabic,
        ),
      );

      if (followUpResult == null) return;

      final followUpChoice = followUpResult['canWorkWithout'];

      if (followUpChoice == 'yes') {
        // Can proceed without - complete without upload
        await _completeLocalityWithoutUploadSingle(site);
      } else {
        // Cannot proceed - send back to FOM
        await _sendSiteBackToFOM(
          site,
          'Locality permit is required for $locality but coordinator cannot proceed without it.',
        );
      }
      return;
    }

    // If required and will upload, proceed to upload dialog
    final uploadResult = await showDialog<dynamic>(
      context: context,
      builder: (context) => _LocalityPermitDialog(
        site: site,
        onComplete: (decision) async {
          Navigator.pop(context);
          await _updateLocalityPermitDecision(site, decision);
        },
        onStatePermitMissing: () {
          // If state permit is not uploaded, redirect to full permit dialog
          Navigator.pop(context);
          _showPermitVerificationDialog(site);
        },
        startOnUpload: true,
        initialStateConfirmed:
            true, // assume state is uploaded since in locality tab
      ),
    );

    // If user clicked back, reshow the BulkLocalityPermitRequirementDialog
    if (uploadResult == 'back') {
      _showLocalityPermitDialog(site);
    }
  }

  /// Update locality permit decision - simplified flow for Locality Permit tab
  Future<void> _updateLocalityPermitDecision(
    Map<String, dynamic> site,
    Map<String, dynamic> decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      // Mark locality permit as uploaded
      if (decision['locality_permit_uploaded'] == true) {
        additionalData['locality_permit_attached'] = true;
        additionalData['locality_permit_uploaded_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_uploaded_by'] = _userId;

        // If coordinator provided issue/expiry dates, persist them in additional_data
        if (decision['locality_permit_issue_date'] != null) {
          additionalData['locality_permit_issue_date'] =
              decision['locality_permit_issue_date'];
        }
        if (decision['locality_permit_expiry_date'] != null) {
          additionalData['locality_permit_expiry_date'] =
              decision['locality_permit_expiry_date'];
        }

        // Attach metadata into mmp_files.permits.localPermits for discoverability/search
        final mmpFiles = Map<String, dynamic>.from(
          site['mmp_files'] as Map<String, dynamic>? ?? {},
        );
        final permits = Map<String, dynamic>.from(
          mmpFiles['permits'] as Map<String, dynamic>? ?? {},
        );
        final localPermits = List<Map<String, dynamic>>.from(
          permits['localPermits'] as List? ?? [],
        );

        final newLocalPermit = {
          'uploaded_at': additionalData['locality_permit_uploaded_at'],
          'uploaded_by': additionalData['locality_permit_uploaded_by'],
          if (additionalData['locality_permit_issue_date'] != null)
            'issue_date': additionalData['locality_permit_issue_date'],
          if (additionalData['locality_permit_expiry_date'] != null)
            'expiry_date': additionalData['locality_permit_expiry_date'],
          'source': 'coordinator',
        };

        localPermits.add(newLocalPermit);
        permits['localPermits'] = localPermits;
        mmpFiles['permits'] = permits;

        // Since state permit is already verified (that's why it's in locality tab),
        // move to permits_attached status and persist mmp_files + additional data
        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'permits_attached',
                'additional_data': additionalData,
                'mmp_files': mmpFiles,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        } catch (e) {
          // Some deployments may not have an `mmp_files` column in the table.
          // Fall back to updating only additional_data to avoid hard failures.
          final err = e.toString();
          debugPrint('Failed updating with mmp_files: $err');

          if (err.contains("Could not find the 'mmp_files' column")) {
            try {
              await _supabase
                  .from('mmp_site_entries')
                  .update({
                    'status': 'permits_attached',
                    'additional_data': additionalData,
                    'updated_at': DateTime.now().toIso8601String(),
                  })
                  .eq('id', siteId);

              debugPrint('Updated site without mmp_files column fallback.');
            } catch (e2) {
              debugPrint('Fallback update also failed: $e2');
              rethrow;
            }
          } else {
            rethrow;
          }
        }

        // Try to also insert a record into coordinator_locality_permits table for indexing
        try {
          await _supabase.from('coordinator_locality_permits').insert({
            'site_entry_id': siteId,
            'uploaded_at': additionalData['locality_permit_uploaded_at'],
            'uploaded_by': additionalData['locality_permit_uploaded_by'],
            'issue_date': additionalData['locality_permit_issue_date'],
            'expiry_date': additionalData['locality_permit_expiry_date'],
            'metadata': {'source': 'mobile_coordinator'},
          });
        } catch (e) {
          final err = e.toString();
          debugPrint(
            'Could not insert coordinator_locality_permits record: $err',
          );
          if (err.contains(
            "Could not find the table 'public.coordinator_locality_permits'",
          )) {
            debugPrint(
              'coordinator_locality_permits table not found; skipping insert.',
            );
          }
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.white),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Locality permit uploaded - Site ready for verification',
                      style: GoogleFonts.poppins(),
                    ),
                  ),
                ],
              ),
              backgroundColor: Colors.green,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          );
        }
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error updating locality permit: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updatePermitDecision(
    Map<String, dynamic> site,
    PermitDecision decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      // Attachable mmp_files/permits metadata
      final mmpFiles = Map<String, dynamic>.from(
        site['mmp_files'] as Map<String, dynamic>? ?? {},
      );
      final permits = Map<String, dynamic>.from(
        mmpFiles['permits'] as Map<String, dynamic>? ?? {},
      );

      // ========================================================================
      // CONSTRAINT 2: PERMIT GATE LOGIC
      // ========================================================================

      // Update additional_data with permit decision
      additionalData['permit_decision'] = decision.toJson();

      // Determine new status based on permit decision
      String newStatus = site['status']?.toString() ?? 'Pending';
      String? notificationMessage;

      final stateReq = decision.statePermit.requirement;
      final canWorkWithout = decision.statePermit.canWorkWithout;

      // STATE PERMIT GATE
      if (stateReq == 'required_dont_have_it' && canWorkWithout == 'no') {
        // TIER 1 BLOCKING: State permit required but not available + cannot proceed
        newStatus = 'returned_to_fom';
        additionalData['return_reason'] =
            'State permit required but not available - Cannot proceed without permit';
        additionalData['returned_at'] = DateTime.now().toIso8601String();
        additionalData['returned_by'] = _userId;
        notificationMessage = 'Site returned to FOM - State permit required';
      } else if (stateReq == 'required_have_it') {
        // State permit uploaded - mark as attached
        additionalData['state_permit_attached'] = true;
        additionalData['state_permit_verified_at'] = DateTime.now()
            .toIso8601String();
        additionalData['state_permit_verified_by'] = _userId;

        // If coordinator supplied dates with the decision, persist them
        if (decision.statePermit.issueDate != null) {
          additionalData['state_permit_issue_date'] =
              decision.statePermit.issueDate;
        }
        if (decision.statePermit.expiryDate != null) {
          additionalData['state_permit_expiry_date'] =
              decision.statePermit.expiryDate;
        }

        // Attach metadata into mmp_files.permits.statePermits for discoverability/search
        final statePermits = List<Map<String, dynamic>>.from(
          permits['statePermits'] as List? ?? [],
        );

        final newStatePermit = {
          'uploaded_at': additionalData['state_permit_verified_at'],
          'uploaded_by': additionalData['state_permit_verified_by'],
          if (additionalData['state_permit_issue_date'] != null)
            'issue_date': additionalData['state_permit_issue_date'],
          if (additionalData['state_permit_expiry_date'] != null)
            'expiry_date': additionalData['state_permit_expiry_date'],
          'state': site['state']?.toString() ?? '',
          'source': 'coordinator',
        };

        statePermits.add(newStatePermit);
        permits['statePermits'] = statePermits;
        mmpFiles['permits'] = permits;

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'All permits attached - Site ready for verification';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit recorded - Upload locality permit to continue';
        }
      } else if (stateReq == 'not_required') {
        // State permit not required - skip to locality
        additionalData['state_permit_not_required'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage = 'Permits ready - Site can now be verified';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit not required - Upload locality permit to continue';
        }
      } else if (stateReq == 'required_dont_have_it' &&
          canWorkWithout == 'yes') {
        // Can proceed without state permit
        additionalData['state_permit_can_work_without'] = true;
        // Mark as not required so validation allows proceeding to locality
        additionalData['state_permit_not_required'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'Proceeding without state permit - Site ready for verification';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit skipped - Upload locality permit to continue';
        }
      } else if (stateReq == 'required_dont_have_it' &&
          (canWorkWithout == null || canWorkWithout == 'no')) {
        // State permit required but not available - wait for locality permit
        additionalData['state_permit_required_but_missing'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'Locality permit uploaded - State permit still required but missing';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit required but missing - Upload locality permit to continue';
        }
      }

      // Update the site entry (include mmp_files when available)
      try {
        await _supabase
            .from('mmp_site_entries')
            .update({
              'status': newStatus,
              'additional_data': additionalData,
              'mmp_files': mmpFiles,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', siteId);
      } catch (e) {
        final err = e.toString();
        debugPrint('Failed updating mmp_files: $err');

        if (err.contains("Could not find the 'mmp_files' column")) {
          // Fallback to update ONLY additional_data
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': newStatus,
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        } else {
          rethrow;
        }
      }

      // If a state permit was uploaded, try to insert a coordinator_state_permits record (best-effort)
      if (decision.statePermit.uploaded) {
        try {
          await _supabase.from('coordinator_state_permits').insert({
            'site_entry_id': siteId,
            'uploaded_at': additionalData['state_permit_verified_at'],
            'uploaded_by': additionalData['state_permit_verified_by'],
            'issue_date': additionalData['state_permit_issue_date'],
            'expiry_date': additionalData['state_permit_expiry_date'],
            'state': site['state']?.toString() ?? '',
            'metadata': {'source': 'mobile_coordinator'},
          });
        } catch (e) {
          debugPrint('Could not insert coordinator_state_permits record: $e');
        }
      }

      // Locality permit info is stored in additional_data on mmp_site_entries
      // No need for separate coordinator_locality_permits table
      if (decision.localityPermit.uploaded) {
        final siteLocality = site['locality']?.toString();
        final siteState = site['state']?.toString();
        debugPrint(
          'Locality permit marked as uploaded for $siteLocality, $siteState',
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  newStatus == 'returned_to_fom'
                      ? Icons.undo
                      : newStatus == 'permits_attached'
                      ? Icons.check_circle
                      : Icons.info_outline,
                  color: Colors.white,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    notificationMessage ?? 'Permit status updated',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: newStatus == 'returned_to_fom'
                ? AppColors.primaryBlue
                : newStatus == 'permits_attached'
                ? Colors.green
                : AppColors.primaryBlue,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error updating permit decision: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // Bulk handlers: state permit, locality permit, and locality verification
  Future<void> _handleStateCardClick(
    String state,
    List<Map<String, dynamic>> sites,
  ) async {
    // If any site in state already has a state permit or marked not required, show info and still allow decision
    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;

    final PermitDecision? decision = await showDialog<PermitDecision>(
      context: context,
      builder: (context) => _PermitVerificationDialog(
        site: firstSite,
        onComplete: (d) => Navigator.of(context).pop(d),
      ),
    );

    if (decision == null) return;

    await _bulkUpdateStatePermit(state, decision);
  }

  Future<void> _bulkUpdateStatePermit(
    String state,
    PermitDecision decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final sitesInState = _newSites
          .where((s) => (s['state']?.toString() ?? '') == state)
          .toList();
      int updated = 0;
      for (final site in sitesInState) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );
        additionalData['permit_decision'] = decision.toJson();

        final stateReq = decision.statePermit.requirement;
        final canWorkWithout = decision.statePermit.canWorkWithout;

        String newStatus = site['status']?.toString() ?? 'Pending';

        if (stateReq == 'required_dont_have_it' && canWorkWithout == 'no') {
          newStatus = 'returned_to_fom';
          additionalData['return_reason'] =
              'State permit required but not available - Cannot proceed without permit';
          additionalData['returned_at'] = DateTime.now().toIso8601String();
          additionalData['returned_by'] = _userId;
        } else if (stateReq == 'required_have_it') {
          additionalData['state_permit_attached'] = true;
          additionalData['state_permit_verified_at'] = DateTime.now()
              .toIso8601String();
          additionalData['state_permit_verified_by'] = _userId;

          if (decision.statePermit.issueDate != null) {
            additionalData['state_permit_issue_date'] =
                decision.statePermit.issueDate;
          }
          if (decision.statePermit.expiryDate != null) {
            additionalData['state_permit_expiry_date'] =
                decision.statePermit.expiryDate;
          }
          // Do not change status here; wait for locality permits
        } else if (stateReq == 'not_required') {
          additionalData['state_permit_not_required'] = true;
          additionalData['state_permit_decision_at'] = DateTime.now()
              .toIso8601String();
          // Do not change status here; wait for locality permits
        } else if (stateReq == 'required_dont_have_it' &&
            canWorkWithout == 'yes') {
          additionalData['state_permit_can_work_without'] = true;
          // Mark as not required so mobile validation allows proceeding
          additionalData['state_permit_not_required'] = true;
          additionalData['state_permit_decision_at'] = DateTime.now()
              .toIso8601String();
          // Do not change status here; wait for locality permits
        }

        await _supabase
            .from('mmp_site_entries')
            .update({
              'status': newStatus,
              'additional_data': additionalData,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', siteId);

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Updated $updated site(s) for state $state'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      debugPrint('Error performing bulk state update: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleLocalityCardClick(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    // First show locality permit requirement dialog
    final requirementResult = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _BulkLocalityPermitRequirementDialog(
        locality: locality,
        state: state,
        siteCount: sites.length,
        isArabic: isArabic,
      ),
    );

    if (requirementResult == null) return;

    final localityPermitRequirement = requirementResult['requirement'];

    // If not required, mark as not required for all sites
    if (localityPermitRequirement == 'not_required') {
      await _markLocalityPermitNotRequired(state, locality, sites);
      return;
    }

    // If required but don't have it, show follow-up options
    if (localityPermitRequirement == 'required_dont_have_it') {
      final followUpResult = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => _BulkLocalityPermitFollowUpDialog(
          locality: locality,
          state: state,
          siteCount: sites.length,
          isArabic: isArabic,
        ),
      );

      if (followUpResult == null) return;

      final followUpChoice = followUpResult['canWorkWithout'];

      if (followUpChoice == 'yes') {
        // Can proceed without - complete with locality required but not uploaded
        await _completeBulkLocalityWithoutUpload(state, locality, sites);
      } else {
        // Cannot proceed - send back to FOM
        await _sendBulkSitesBackToFOM(
          state,
          locality,
          sites,
          'Locality permit is required for $locality but coordinator cannot proceed without it.',
        );
      }
      return;
    }

    // If required and will upload, proceed to upload dialog
    final siteAdditional = Map<String, dynamic>.from(
      firstSite['additional_data'] as Map<String, dynamic>? ?? {},
    );
    final hasStatePermit =
        siteAdditional['state_permit_attached'] == true ||
        siteAdditional['state_permit_not_required'] == true;

    final decision = await showDialog<dynamic>(
      context: context,
      builder: (context) => _LocalityPermitDialog(
        site: firstSite,
        onComplete: (d) => Navigator.of(context).pop(d),
        onStatePermitMissing: () {
          Navigator.of(context).pop(); // close and show a note
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'State permit not found - upload state permit first',
              ),
              backgroundColor: AppColors.primaryBlue,
            ),
          );
        },
        startOnUpload: true,
        initialStateConfirmed: hasStatePermit,
      ),
    );

    if (decision == null) return;

    // If user clicked back, reshow the BulkLocalityPermitRequirementDialog
    if (decision == 'back') {
      await _handleLocalityCardClick(state, locality, sites);
      return;
    }

    // User provided complete locality permit data (photo + dates required)
    if (decision is Map) {
      await _bulkUpdateLocalityPermit(
        state,
        locality,
        decision as Map<String, dynamic>,
      );
    }
  }

  Future<void> _markLocalityPermitNotRequired(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    try {
      setState(() => _isLoading = true);

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_not_required'] = true;
        additionalData['locality_permit_requirement_set_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_requirement_set_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': additionalData,
                'status': 'permits_attached',
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Marked locality permit as not required for $updated site(s)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating sites: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _completeBulkLocalityWithoutUpload(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    try {
      setState(() => _isLoading = true);

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_required_but_not_uploaded'] = true;
        additionalData['locality_permit_requirement_set_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_requirement_set_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': additionalData,
                'status': 'permits_attached',
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Completed locality verification without upload for $updated site(s)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating sites: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _sendBulkSitesBackToFOM(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final eligibleStatuses = [
        'Pending',
        'Dispatched',
        'assigned',
        'inProgress',
        'in_progress',
      ];
      final targetSites = _newSites.where((s) {
        final sState = (s['state']?.toString() ?? '');
        final sLocality = (s['locality']?.toString() ?? '');
        final status = s['status']?.toString() ?? '';
        return sState == state &&
            sLocality == locality &&
            eligibleStatuses.contains(status);
      }).toList();

      int updated = 0;

      for (final site in targetSites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['sent_back_to_fom'] = true;
        additionalData['sent_back_reason'] = reason;
        additionalData['sent_back_at'] = DateTime.now().toIso8601String();
        additionalData['sent_back_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'returned_to_fom',
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sent $updated site(s) back to FOM: $reason'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sending sites back to FOM: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // Single site versions for individual locality verification
  Future<void> _markLocalityPermitNotRequiredSingle(
    Map<String, dynamic> site,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      additionalData['locality_permit_not_required'] = true;
      additionalData['locality_permit_requirement_set_at'] = DateTime.now()
          .toIso8601String();
      additionalData['locality_permit_requirement_set_by'] = _userId;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'additional_data': additionalData,
            'status': 'permits_attached',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Locality permit marked as not required - moved to CP verification',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating site: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _completeLocalityWithoutUploadSingle(
    Map<String, dynamic> site,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      final localityPermit =
          additionalData['locality_permit'] as Map<String, dynamic>? ?? {};
      localityPermit['requirement'] = 'required_dont_have_it';
      localityPermit['canWorkWithout'] = 'yes';
      additionalData['locality_permit'] = localityPermit;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'additional_data': additionalData,
            'status': 'permits_attached',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Proceeding without locality permit - moved to CP verification',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating site: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _sendSiteBackToFOM(
    Map<String, dynamic> site,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      additionalData['sent_back_to_fom'] = true;
      additionalData['sent_back_reason'] = reason;
      additionalData['sent_back_at'] = DateTime.now().toIso8601String();
      additionalData['sent_back_by'] = _userId;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'additional_data': additionalData,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Site sent back to FOM: $reason'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sending site back to FOM: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _bulkUpdateLocalityPermit(
    String state,
    String locality,
    Map<String, dynamic> decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final eligibleStatuses = [
        'Pending',
        'Dispatched',
        'assigned',
        'inProgress',
        'in_progress',
      ];
      final targetSites = _newSites.where((s) {
        final sState = (s['state']?.toString() ?? '');
        final sLocality = (s['locality']?.toString() ?? '');
        final status = s['status']?.toString() ?? '';
        return sState == state &&
            sLocality == locality &&
            eligibleStatuses.contains(status);
      }).toList();

      int updated = 0;
      // Track whether we've observed missing DB schema to avoid repeated attempts/log noise
      bool mmpFilesColumnMissing = false;
      bool coordLocalityTableMissing = false;

      for (final site in targetSites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_attached'] = true;
        additionalData['locality_permit_uploaded_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_uploaded_by'] = _userId;

        if (decision['locality_permit_issue_date'] != null) {
          additionalData['locality_permit_issue_date'] =
              decision['locality_permit_issue_date'];
        }
        if (decision['locality_permit_expiry_date'] != null) {
          additionalData['locality_permit_expiry_date'] =
              decision['locality_permit_expiry_date'];
        }

        // Attempt mmp_files update like single-update flow (best-effort)
        final mmpFiles = Map<String, dynamic>.from(
          site['mmp_files'] as Map<String, dynamic>? ?? {},
        );
        final permits = Map<String, dynamic>.from(
          mmpFiles['permits'] as Map<String, dynamic>? ?? {},
        );
        final localPermits = List<Map<String, dynamic>>.from(
          permits['localPermits'] as List? ?? [],
        );

        final newLocalPermit = {
          'uploaded_at': additionalData['locality_permit_uploaded_at'],
          'uploaded_by': additionalData['locality_permit_uploaded_by'],
          if (additionalData['locality_permit_issue_date'] != null)
            'issue_date': additionalData['locality_permit_issue_date'],
          if (additionalData['locality_permit_expiry_date'] != null)
            'expiry_date': additionalData['locality_permit_expiry_date'],
          'source': 'coordinator',
        };

        localPermits.add(newLocalPermit);
        permits['localPermits'] = localPermits;
        mmpFiles['permits'] = permits;

        if (!mmpFilesColumnMissing) {
          try {
            await _supabase
                .from('mmp_site_entries')
                .update({
                  'status': 'permits_attached',
                  'additional_data': additionalData,
                  'mmp_files': mmpFiles,
                  'updated_at': DateTime.now().toIso8601String(),
                })
                .eq('id', siteId);
          } catch (e) {
            final err = e.toString();
            debugPrint(
              'Failed updating mmp_files during bulk locality update: $err',
            );
            if (err.contains("Could not find the 'mmp_files' column")) {
              mmpFilesColumnMissing = true;
              // Fallback to update without mmp_files
              await _supabase
                  .from('mmp_site_entries')
                  .update({
                    'status': 'permits_attached',
                    'additional_data': additionalData,
                    'updated_at': DateTime.now().toIso8601String(),
                  })
                  .eq('id', siteId);
            } else {
              rethrow;
            }
          }
        } else {
          // Column already known to be missing; do the simpler update
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'permits_attached',
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        }

        // Try to insert a coordinator_locality_permits record (best-effort)
        if (!coordLocalityTableMissing) {
          try {
            await _supabase.from('coordinator_locality_permits').insert({
              'site_entry_id': siteId,
              'uploaded_at': additionalData['locality_permit_uploaded_at'],
              'uploaded_by': additionalData['locality_permit_uploaded_by'],
              'issue_date': additionalData['locality_permit_issue_date'],
              'expiry_date': additionalData['locality_permit_expiry_date'],
              'metadata': {'source': 'mobile_coordinator_bulk'},
            });
          } catch (e) {
            final err = e.toString();
            debugPrint(
              'Could not insert coordinator_locality_permits record during bulk: $err',
            );
            if (err.contains(
              "Could not find the table 'public.coordinator_locality_permits'",
            )) {
              coordLocalityTableMissing = true;
              debugPrint(
                'coordinator_locality_permits table not found; skipping further inserts.',
              );
            }
          }
        }

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Uploaded locality permit for $updated site(s) in $locality, $state',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error performing bulk locality update: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _showBulkVerifyDialog(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    // Determine activity mix across sites
    final anyDm = sites.any((s) => _isDmActivity(s));
    final anyMulti = sites.any((s) => _isMultiVisitActivity(s));
    final anyUrgent = sites.any((s) => _isUrgentActivity(s));

    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;

    // Use the existing VerificationDialog to collect the relevant dates/inputs
    final Map<String, dynamic>? result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _VerificationDialog(
        site: firstSite,
        isDMActivity: anyDm,
        isMultiVisitActivity: anyMulti,
        isUrgentActivity: anyUrgent,
      ),
    );

    if (result == null) return;

    await _bulkVerifyLocality(state, locality, sites, result);
  }

  Future<void> _bulkVerifyLocality(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
    Map<String, dynamic> result,
  ) async {
    try {
      setState(() => _isLoading = true);

      // Validate result depending on activity types
      final activityType = result['activity_type'] as String? ?? 'standard';
      final visitDate = result['visit_date'] as DateTime?;
      final distributionStart = result['distribution_start'] as DateTime?;
      final distributionEnd = result['distribution_end'] as DateTime?;
      final followUpDate = result['follow_up_date'] as DateTime?;
      final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
      final verificationNotes =
          (result['verification_notes'] as String?)?.trim() ?? '';

      if (visitDate == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please select a visit date'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      if (activityType == 'distribution') {
        if (distributionStart == null || distributionEnd == null) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Please select distribution start and end dates'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
        if (visitDate.isBefore(distributionStart) ||
            visitDate.isAfter(distributionEnd)) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Visit date must be within distribution period'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      if (activityType == 'multi_visit' && requiresFollowUp) {
        if (followUpDate == null) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Please select a follow-up date'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
        if (followUpDate.isBefore(visitDate)) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Follow-up date must be after the primary visit'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final existingAdditionalData =
            site['additional_data'] as Map<String, dynamic>? ?? {};

        // Determine per-site activity type (use site-specific detection)
        final isDm = _isDmActivity(site);
        final isMulti = _isMultiVisitActivity(site);
        final isUrgent = _isUrgentActivity(site);

        // Build expected_visit per site
        final Map<String, dynamic> expectedVisit;
        if (isDm) {
          expectedVisit = {
            'type': 'range',
            'start_date': DateFormat('yyyy-MM-dd').format(distributionStart!),
            'end_date': DateFormat('yyyy-MM-dd').format(distributionEnd!),
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          };
        } else if (isMulti) {
          expectedVisit = {
            'type': 'multi_visit',
            'primary_visit': DateFormat('yyyy-MM-dd').format(visitDate),
            'follow_up_visit': requiresFollowUp && followUpDate != null
                ? DateFormat('yyyy-MM-dd').format(followUpDate)
                : null,
            'requires_follow_up': requiresFollowUp,
          };
        } else if (isUrgent) {
          expectedVisit = {
            'type': 'urgent',
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
            'priority': 'high',
          };
        } else {
          expectedVisit = {
            'type': 'single',
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          };
        }

        final updatedAdditionalData = {
          ...existingAdditionalData,
          'expected_visit': expectedVisit,
          'cp_verification': {
            'status': 'verified',
            'verified_at': DateTime.now().toIso8601String(),
            'verified_by': _userId,
          },
        };

        final updatePayload = {
          'status': 'verified',
          'verified_at': DateTime.now().toIso8601String(),
          'verified_by': _userId,
          'visit_date': DateFormat('yyyy-MM-dd').format(visitDate),
          'additional_data': updatedAdditionalData,
          'updated_at': DateTime.now().toIso8601String(),
        };

        if (verificationNotes.isNotEmpty) {
          updatePayload['verification_notes'] = verificationNotes;
        }

        await _supabase
            .from('mmp_site_entries')
            .update(updatePayload)
            .eq('id', siteId);

        final mmpFileId = site['mmp_file_id']?.toString();
        if (mmpFileId != null && mmpFileId.isNotEmpty) {
          await _updateMmpWorkflowAfterVerification(mmpFileId);
        }

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verified $updated site(s) in $locality, $state'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      debugPrint('Error during bulk verify: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _verifySite(Map<String, dynamic> site) async {
    // ========================================================================
    // CONSTRAINT 5: PRE-VERIFICATION CHECKS
    // ========================================================================
    final preCheck = _performPreVerificationChecks(site);

    if (!preCheck['success']) {
      final tier = preCheck['tier'] as int;
      final error = preCheck['error'] as String;

      if (tier == 1) {
        // TIER 1: BLOCKING - Show error and prevent verification
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.error_outline, color: Colors.red, size: 28),
                SizedBox(width: 12),
                Text('Cannot Verify'),
              ],
            ),
            content: Text(error),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        return;
      } else if (tier == 2) {
        // TIER 2: WARNING - Ask for confirmation
        final proceed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(
                  Icons.warning_amber,
                  color: AppColors.primaryBlue,
                  size: 28,
                ),
                SizedBox(width: 12),
                Text('Warning'),
              ],
            ),
            content: Text('$error\n\nDo you want to proceed anyway?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                ),
                child: const Text('Proceed'),
              ),
            ],
          ),
        );

        if (proceed != true) return;
      }
    }

    // Check if this is a DM activity that requires date range
    // Uses the same logic as CoordinatorSites.tsx - check for GFA, CBT, EBSFP
    final mainActivity = (site['main_activity'] ?? '').toString().toUpperCase();
    final activity = (site['activity'] ?? '').toString().toUpperCase();

    final isDMActivity = _isDmActivity(site);
    final isMultiVisitActivity = _isMultiVisitActivity(site);
    final isUrgentActivity = _isUrgentActivity(site);

    // Debug logging - include activity_at_site for clarity
    debugPrint(
      'Activity detection: main=${site['main_activity'] ?? ''}, activity=${site['activity'] ?? ''}, activity_at_site=${site['activity_at_site'] ?? ''}',
    );
    debugPrint(
      'isDMActivity=$isDMActivity, isMultiVisit=$isMultiVisitActivity, isUrgent=$isUrgentActivity',
    );

    // Optional visual debug during development: show a short message when opened in debug mode
    assert(() {
      // ignore: avoid_print
      print(
        'DEBUG: DM detection -> $isDMActivity (combined="${(site['main_activity'] ?? '')} ${(site['activity'] ?? '')} ${(site['activity_at_site'] ?? '')}")',
      );
      return true;
    }());

    // Show verification dialog with date inputs
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _VerificationDialog(
        site: site,
        isDMActivity: isDMActivity,
        isMultiVisitActivity: isMultiVisitActivity,
        isUrgentActivity: isUrgentActivity,
      ),
    );

    if (result == null) return; // User cancelled

    final visitDate = result['visit_date'] as DateTime?;
    final distributionStart = result['distribution_start'] as DateTime?;
    final distributionEnd = result['distribution_end'] as DateTime?;
    final followUpDate = result['follow_up_date'] as DateTime?;
    final activityType = result['activity_type'] as String? ?? 'standard';
    final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
    final verificationNotes =
        (result['verification_notes'] as String?)?.trim() ?? '';

    // Validate dates based on activity type
    if (visitDate == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please select a visit date'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // Validate activity-specific requirements
    if (activityType == 'distribution') {
      if (distributionStart == null || distributionEnd == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please select distribution start and end dates'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Validate visit date is within distribution period
      if (visitDate.isBefore(distributionStart) ||
          visitDate.isAfter(distributionEnd)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Visit date must be within the distribution period',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    } else if (activityType == 'multi_visit' && requiresFollowUp) {
      if (followUpDate == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please select a follow-up date'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Validate follow-up is after primary visit
      if (followUpDate.isBefore(visitDate)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Follow-up date must be after the primary visit'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    }

    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final mmpFileId = site['mmp_file_id']?.toString();

      // Build expected_visit data based on activity type
      final Map<String, dynamic> expectedVisit;
      final activityType = result['activity_type'] as String? ?? 'standard';

      if (activityType == 'distribution') {
        expectedVisit = {
          'type': 'range',
          'start_date': DateFormat('yyyy-MM-dd').format(distributionStart!),
          'end_date': DateFormat('yyyy-MM-dd').format(distributionEnd!),
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
        };
      } else if (activityType == 'multi_visit') {
        final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
        final followUpDate = result['follow_up_date'] as DateTime?;
        expectedVisit = {
          'type': 'multi_visit',
          'primary_visit': DateFormat('yyyy-MM-dd').format(visitDate),
          'follow_up_visit': requiresFollowUp && followUpDate != null
              ? DateFormat('yyyy-MM-dd').format(followUpDate)
              : null,
          'requires_follow_up': requiresFollowUp,
        };
      } else if (activityType == 'urgent') {
        expectedVisit = {
          'type': 'urgent',
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          'priority': 'high',
        };
      } else {
        expectedVisit = {
          'type': 'single',
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
        };
      }

      // Update additional_data with expected_visit
      final existingAdditionalData =
          site['additional_data'] as Map<String, dynamic>? ?? {};
      final updatedAdditionalData = {
        ...existingAdditionalData,
        'expected_visit': expectedVisit,
        'cp_verification': {
          'status': 'verified',
          'verified_at': DateTime.now().toIso8601String(),
          'verified_by': _userId,
        },
      };

      // ========================================================================
      // CONSTRAINT 6: POST-VERIFICATION ACTIONS
      // ========================================================================

      // Action 1: Update mmp_site_entries with visit date and status
      final updatePayload = {
        'status': 'verified',
        'verified_at': DateTime.now().toIso8601String(),
        'verified_by': _userId,
        'visit_date': DateFormat('yyyy-MM-dd').format(visitDate),
        'additional_data': updatedAdditionalData,
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (verificationNotes.isNotEmpty) {
        updatePayload['verification_notes'] = verificationNotes;
      }

      await _supabase
          .from('mmp_site_entries')
          .update(updatePayload)
          .eq('id', siteId);

      // Action 2: Update MMP file workflow
      if (mmpFileId != null && mmpFileId.isNotEmpty) {
        await _updateMmpWorkflowAfterVerification(mmpFileId);
      }

      // Action 3: Create notifications (handled by database triggers/service)
      // The NotificationTriggerService should handle this automatically
      // But we can also call it explicitly here if needed
      // Action 4: Success message
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Site "${site['site_name']}" verified successfully',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error verifying site: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Error verifying site: $e',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updateMmpWorkflowAfterVerification(String mmpFileId) async {
    if (mmpFileId.isEmpty) {
      return;
    }

    try {
      final mmpFile = await _supabase
          .from('mmp_files')
          .select('workflow')
          .eq('id', mmpFileId)
          .maybeSingle();

      if (mmpFile != null) {
        final workflow = Map<String, dynamic>.from(
          mmpFile['workflow'] as Map<String, dynamic>? ?? {},
        );

        final nowIso = DateTime.now().toIso8601String();

        workflow['coordinatorVerified'] = true;
        workflow['coordinatorVerifiedAt'] = nowIso;
        workflow['coordinatorVerifiedBy'] = _userId;

        final currentStage = workflow['currentStage']?.toString();
        if (currentStage == 'awaitingCoordinatorVerification') {
          workflow['currentStage'] = 'verified';
        } else {
          workflow['currentStage'] =
              (currentStage != null && currentStage.isNotEmpty)
              ? currentStage
              : 'verified';
        }

        await _supabase
            .from('mmp_files')
            .update({
              'workflow': workflow,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', mmpFileId);
      }
    } catch (e) {
      debugPrint('Error updating MMP workflow: $e');
      // Don’t fail the overall operation if workflow update fails
    }
  }

  Future<void> _returnToFOM(Map<String, dynamic> site) async {
    final TextEditingController reasonController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Return to FOM'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Return "${site['site_name']}" to Field Operations Manager?',
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason for returning',
                hintText: 'Enter reason...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Return'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'verification_notes': reasonController.text,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Site returned to FOM'),
          backgroundColor: AppColors.primaryBlue,
        ),
      );
      await _loadData();
    } catch (e) {
      debugPrint('Error returning site: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

}
