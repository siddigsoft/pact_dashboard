part of '../../screens/site_verification_screen.dart';

extension _SiteVerificationTabContent on _SiteVerificationScreenState {
  Widget _buildNewTabContent() {
    if (_newSites.isEmpty) {
      return _buildEmptyState('new');
    }

    final filteredNewSites = _applySearchFilter(_newSites);

    if (filteredNewSites.isEmpty) {
      return _buildEmptyState('new');
    }

    // STATE-LEVEL permit grouping (matching web CoordinatorSites.tsx logic)
    // A state has its permit if ANY site in that state has state_permit_attached/not_required
    // OR if the MMP file has statePermits for that state
    final statesWithPermit = <String>{};
    for (final site in filteredNewSites) {
      final stateName = site['state']?.toString() ?? '';
      final additionalData =
          site['additional_data'] as Map<String, dynamic>? ?? {};
      if (additionalData['state_permit_attached'] == true ||
          additionalData['state_permit_not_required'] == true) {
        statesWithPermit.add(stateName);
      }
      if (_hasStatePermitFromMmpFile(site)) {
        statesWithPermit.add(stateName);
      }
    }

    // Filter sites that need STATE permit (state does NOT have state permit)
    final sitesNeedingStatePermit = filteredNewSites.where((s) {
      final stateName = s['state']?.toString() ?? '';
      return !statesWithPermit.contains(stateName);
    }).toList();

    // Filter sites that need LOCALITY permit (state HAS state permit but no locality permit)
    final sitesNeedingLocalityPermit = filteredNewSites.where((s) {
      final stateName = s['state']?.toString() ?? '';
      final additionalData =
          s['additional_data'] as Map<String, dynamic>? ?? {};
      return statesWithPermit.contains(stateName) &&
          additionalData['locality_permit_attached'] != true;
    }).toList();

    // Group sites needing state permit by state
    final sitesByState = <String, List<Map<String, dynamic>>>{};
    for (final site in sitesNeedingStatePermit) {
      final state = site['state']?.toString() ?? 'Unknown';
      sitesByState.putIfAbsent(state, () => []).add(site);
    }

    // Group sites needing locality permit by locality
    final sitesByLocality = <String, List<Map<String, dynamic>>>{};
    for (final site in sitesNeedingLocalityPermit) {
      final state = site['state']?.toString() ?? 'Unknown';
      final locality = site['locality']?.toString() ?? 'Unknown';
      sitesByLocality.putIfAbsent('$state - $locality', () => []).add(site);
    }

    return Column(
      children: [
        // Sub-tab selector with counts
        Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: Colors.grey[200],
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _newSubTabIndex = 0),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _newSubTabIndex == 0
                          ? AppColors.primaryBlue
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          size: 16,
                          color: _newSubTabIndex == 0
                              ? Colors.white
                              : Colors.grey[600],
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            _bi(
                              'State (${sitesNeedingStatePermit.length})',
                              'تصريح الولاية (${sitesNeedingStatePermit.length})',
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            softWrap: true,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: _newSubTabIndex == 0
                                  ? Colors.white
                                  : Colors.grey[700],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _newSubTabIndex = 1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _newSubTabIndex == 1
                          ? AppColors.primaryBlue
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.location_on_outlined,
                          size: 16,
                          color: _newSubTabIndex == 1
                              ? Colors.white
                              : Colors.grey[600],
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            _bi(
                              'Locality (${sitesNeedingLocalityPermit.length})',
                              'تصريح المحلية (${sitesNeedingLocalityPermit.length})',
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            softWrap: true,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: _newSubTabIndex == 1
                                  ? Colors.white
                                  : Colors.grey[700],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Sub-tab content
        Expanded(
          child: _newSubTabIndex == 0
              ? _buildStatePermitSubTab(sitesByState)
              : _buildLocalityPermitSubTab(sitesByLocality),
        ),
      ],
    );
  }

  /// Build State Permit sub-tab content grouped by state
  Widget _buildStatePermitSubTab(
    Map<String, List<Map<String, dynamic>>> sitesByState,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      itemCount: sitesByState.length,
      itemBuilder: (context, index) {
        final state = sitesByState.keys.elementAt(index);
        final sites = sitesByState[state]!;
        final sitesNeedingStatePermit = sites.where((s) {
          final additionalData =
              s['additional_data'] as Map<String, dynamic>? ?? {};
          return additionalData['state_permit_attached'] != true &&
              additionalData['state_permit_not_required'] != true;
        }).toList();

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
          child: ExpansionTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.backgroundGray,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.warning_amber_rounded,
                color: AppColors.primaryBlue,
                size: 20,
              ),
            ),
            title: Text(
              state,
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
            subtitle: Text(
              '${sitesNeedingStatePermit.length} sites need state permit',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.primaryBlue.withValues(alpha: 0.12),
                ),
              ),
              child: Text(
                '${sites.length}',
                style: GoogleFonts.poppins(
                  color: AppColors.primaryBlue,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            children: [
              if (sitesNeedingStatePermit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.upload_file),
                          label: Flexible(
                            child: Text(
                              _bi(
                                'Manage state permit (${sitesNeedingStatePermit.length})',
                                'إدارة تصريح الولاية (${sitesNeedingStatePermit.length})',
                              ),
                              maxLines: 2,
                              softWrap: true,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.poppins(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: AppColors.primaryBlue,
                            side: BorderSide(
                              color: AppColors.primaryBlue.withValues(
                                alpha: 0.12,
                              ),
                            ),
                            elevation: 0,
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 10,
                            ),
                          ),
                          onPressed: () => _handleStateCardClick(state, sites),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.undo, size: 16),
                          label: Flexible(
                            child: Text(
                              () {
                                final selectedSites = _getSelectedReturnSites(
                                  sites,
                                );
                                if (selectedSites.isNotEmpty) {
                                  return _bi(
                                    'Return Selected (${selectedSites.length})',
                                    'إرجاع المحدد (${selectedSites.length})',
                                  );
                                }
                                return _bi(
                                  'Return All (${sites.length})',
                                  'إرجاع الكل (${sites.length})',
                                );
                              }(),
                              maxLines: 2,
                              softWrap: true,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.poppins(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFEF4444),
                            side: const BorderSide(
                              color: Color(0xFFEF4444),
                              width: 1.5,
                            ),
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () async {
                            final selectedSites = _getSelectedReturnSites(sites);
                            final targets = selectedSites.isNotEmpty
                                ? selectedSites
                                : sites;
                            await _bulkReturnSitesToFOM(state, targets);
                            if (!mounted || selectedSites.isEmpty) return;
                            setState(() {
                              for (final s in selectedSites) {
                                _selectedReturnSiteIds.remove(
                                  s['id']?.toString(),
                                );
                              }
                            });
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ...sites.map(
                (site) {
                  final siteId = site['id']?.toString();
                  return _buildSiteCard(
                    site,
                    'new_state_tab_site',
                    isSelectable: true,
                    isSelected:
                        siteId != null && _selectedReturnSiteIds.contains(siteId),
                    onToggle: () => _toggleReturnSiteSelection(siteId),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }

  /// Build Locality Permit sub-tab content grouped by locality
  Widget _buildLocalityPermitSubTab(
    Map<String, List<Map<String, dynamic>>> sitesByLocality,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      itemCount: sitesByLocality.length,
      itemBuilder: (context, index) {
        final locality = sitesByLocality.keys.elementAt(index);
        final sites = sitesByLocality[locality]!;
        final sitesNeedingLocalityPermit = sites.where((s) {
          final additionalData =
              s['additional_data'] as Map<String, dynamic>? ?? {};
          return additionalData['locality_permit_attached'] != true;
        }).toList();

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
          child: ExpansionTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.location_on_outlined,
                color: Colors.blue,
                size: 20,
              ),
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    locality,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                if (sites.any((s) {
                  final additional =
                      s['additional_data'] as Map<String, dynamic>? ?? {};
                  return additional['locality_permit_skipped'] == true;
                }))
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.primaryBlue.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Text(
                      'Skipped',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
            subtitle: Text(
              '${sitesNeedingLocalityPermit.length} sites need locality permit',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.blue,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${sites.length}',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            // Use 'locality_permit' category for different handling
            children: [
              if (sitesNeedingLocalityPermit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.upload_file),
                          label: Flexible(
                            child: Text(
                              _bi(
                                'Upload locality permit (${sitesNeedingLocalityPermit.length})',
                                'رفع تصريح المحلية (${sitesNeedingLocalityPermit.length})',
                              ),
                              maxLines: 2,
                              softWrap: true,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.poppins(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          onPressed: () {
                            final parts = locality.split(' - ');
                            final stateName = parts.isNotEmpty ? parts[0] : '';
                            final localityName = parts.length > 1
                                ? parts[1]
                                : '';
                            _handleLocalityCardClick(
                              stateName,
                              localityName,
                              sites,
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 10,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.undo, size: 16),
                          label: Flexible(
                            child: Text(
                              () {
                                final selectedSites = _getSelectedReturnSites(
                                  sites,
                                );
                                if (selectedSites.isNotEmpty) {
                                  return _bi(
                                    'Return Selected (${selectedSites.length})',
                                    'إرجاع المحدد (${selectedSites.length})',
                                  );
                                }
                                return _bi(
                                  'Return All (${sites.length})',
                                  'إرجاع الكل (${sites.length})',
                                );
                              }(),
                              maxLines: 2,
                              softWrap: true,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.poppins(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFEF4444),
                            side: const BorderSide(
                              color: Color(0xFFEF4444),
                              width: 1.5,
                            ),
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () async {
                            final selectedSites = _getSelectedReturnSites(sites);
                            final targets = selectedSites.isNotEmpty
                                ? selectedSites
                                : sites;
                            await _bulkReturnSitesToFOM(locality, targets);
                            if (!mounted || selectedSites.isEmpty) return;
                            setState(() {
                              for (final s in selectedSites) {
                                _selectedReturnSiteIds.remove(
                                  s['id']?.toString(),
                                );
                              }
                            });
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ...sites.map((site) {
                final siteId = site['id']?.toString();
                return _buildSiteCard(
                  site,
                  'locality_permit',
                  isSelectable: true,
                  isSelected:
                      siteId != null && _selectedReturnSiteIds.contains(siteId),
                  onToggle: () => _toggleReturnSiteSelection(siteId),
                );
              }),
            ],
          ),
        );
      },
    );
  }

  /// Build empty state widget
  Widget _buildEmptyState(String category) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              _getEmptyIcon(category),
              size: 64,
              color: AppColors.primaryBlue.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            _getEmptyMessage(category),
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.grey[600],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildSelectionBar() {
    final selectedSites = _getSelectedSitesForBulkVerify();
    final n = selectedSites.length;
    if (n == 0) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: AppColors.primaryBlue.withValues(alpha: 0.08),
      child: Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () async {
                await _showBulkVerifyDialog(
                  'Selected',
                  '$n sites',
                  selectedSites,
                );
                if (mounted) setState(() => _selectedSiteIds.clear());
              },
              icon: const Icon(Icons.verified, size: 20),
              label: Text(
                _bi('Verify selected ($n)', 'تأكيد المحدد ($n)'),
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          OutlinedButton(
            onPressed: () => setState(() => _selectedSiteIds.clear()),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF6B7280),
              side: BorderSide(color: Colors.grey[400] ?? Colors.grey),
            ),
            child: Text(
              _bi('Clear', 'مسح'),
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds "Verify All (DM)" and "Verify All (Non-DM)" buttons for bulk verification.
  /// DM = 3 dates (distribution start, end, expected visit); Non-DM = 1 date.
  List<Widget> _buildBulkVerifyButtonsByActivity(
    String stateName,
    String localityName,
    List<Map<String, dynamic>> localitySites,
  ) {
    final dmSites = localitySites.where((s) => _isDmActivity(s)).toList();
    final nonDmSites = localitySites.where((s) => !_isDmActivity(s)).toList();

    final buttons = <Widget>[];
    void addButton(String activityLabel, List<Map<String, dynamic>> sites) {
      if (sites.isEmpty) return;
      if (buttons.isNotEmpty) buttons.add(const SizedBox(width: 8));
      buttons.add(
        ElevatedButton.icon(
          onPressed: () =>
              _showBulkVerifyDialog(stateName, localityName, sites),
          icon: const Icon(Icons.verified, size: 18),
          label: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Verify All ($activityLabel)',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                '(${sites.length})',
                style: GoogleFonts.poppins(fontSize: 10),
              ),
            ],
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF10B981),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 6,
          ),
        ),
      );
    }

    addButton('DM', dmSites);
    addButton('Non-DM', nonDmSites);
    return buttons;
  }

  Widget _buildSiteList(List<Map<String, dynamic>> sites, String category) {
    final filteredSites = _applySearchFilter(sites);

    if (filteredSites.isEmpty) {
      if (sites.isNotEmpty && _searchQuery.isNotEmpty) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.search_off, size: 64, color: Color(0xFF9CA3AF)),
              const SizedBox(height: 12),
              Text(
                'No sites match your search',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: const Color(0xFF6B7280),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  setState(() => _searchQuery = '');
                },
                child: const Text('Clear search'),
              ),
            ],
          ),
        );
      }

      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _getEmptyIcon(category),
                size: 64,
                color: AppColors.primaryBlue.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              _getEmptyMessage(category),
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF374151),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _getEmptySubMessage(category),
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: const Color(0xFF6B7280),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 3,
              ),
            ),
          ],
        ),
      );
    }

    // Special grouping for CP Verification: group sites by state + locality
    if (category == 'cp_verification') {
      final grouped = <String, List<Map<String, dynamic>>>{};
      for (final site in filteredSites) {
        final state = site['state']?.toString() ?? 'Unknown';
        final locality = site['locality']?.toString() ?? 'Unknown';
        final key = '$state - $locality';
        grouped.putIfAbsent(key, () => []).add(site);
      }

      return RefreshIndicator(
        color: AppColors.primaryBlue,
        onRefresh: _loadData,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_selectedSiteIds.isNotEmpty) _buildSelectionBar(),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: grouped.length,
                itemBuilder: (context, index) {
                  final key = grouped.keys.elementAt(index);
                  final localitySites = grouped[key]!;
                  final parts = key.split(' - ');
                  final stateName = parts.isNotEmpty ? parts[0] : '';
                  final localityName = parts.length > 1 ? parts[1] : '';

                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 3,
                    child: Column(
                      children: [
                        // Header row for group
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      stateName,
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                        color: const Color(0xFF111827),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      localityName,
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: const Color(0xFF6B7280),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              // Verify All filtered by activity: DM (3 dates), TSFP (1 date), Other (1 date)
                              Flexible(
                                child: SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: _buildBulkVerifyButtonsByActivity(
                                      stateName,
                                      localityName,
                                      localitySites,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton.icon(
                                onPressed: () async {
                                  final selectedSites =
                                      _getSelectedReturnSites(localitySites);
                                  final targets = selectedSites.isNotEmpty
                                      ? selectedSites
                                      : localitySites;
                                  await _bulkReturnSitesToFOM(
                                    '$stateName - $localityName',
                                    targets,
                                  );
                                  if (!mounted || selectedSites.isEmpty) return;
                                  setState(() {
                                    for (final s in selectedSites) {
                                      _selectedReturnSiteIds.remove(
                                        s['id']?.toString(),
                                      );
                                    }
                                  });
                                },
                                icon: const Icon(Icons.undo, size: 16),
                                label: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _getSelectedReturnSites(
                                            localitySites,
                                          ).isNotEmpty
                                          ? 'Return Selected'
                                          : 'Return All',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    Text(
                                      'إرجاع الكل',
                                      style: GoogleFonts.poppins(fontSize: 11),
                                      textDirection: ui.TextDirection.rtl,
                                    ),
                                    Text(
                                      '(${_getSelectedReturnSites(localitySites).isNotEmpty ? _getSelectedReturnSites(localitySites).length : localitySites.length})',
                                      style: GoogleFonts.poppins(fontSize: 10),
                                    ),
                                  ],
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: const Color(0xFFEF4444),
                                  side: const BorderSide(
                                    color: Color(0xFFEF4444),
                                    width: 1.5,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 10,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Divider
                        const Divider(height: 1),

                        // Site list under group (with selection for bulk verify)
                        Column(
                          children: localitySites.map((s) {
                            final siteId = s['id']?.toString();
                            return Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              child: _buildSiteCard(
                                s,
                                category,
                                isSelectable: true,
                                isSelected:
                                    siteId != null &&
                                    _selectedSiteIds.contains(siteId),
                                onToggle: () => _toggleSiteSelection(siteId),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primaryBlue,
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: filteredSites.length,
        itemBuilder: (context, index) {
          final site = filteredSites[index];
          return _buildSiteCard(site, category);
        },
      ),
    );
  }

  IconData _getEmptyIcon(String category) {
    switch (category) {
      case 'new':
        return Icons.fiber_new_rounded;
      case 'cp_verification':
        return Icons.fact_check_outlined;
      case 'verified':
        return Icons.verified_user;
      case 'approved':
        return Icons.thumb_up_outlined;
      case 'completed':
        return Icons.check_circle_outline;
      case 'submitted':
        return Icons.upload_file;
      case 'wfp_confirmed':
        return Icons.verified_user;
      case 'not_covered':
        return Icons.location_off_outlined;
      case 'rejected':
        return Icons.cancel_outlined;
      default:
        return Icons.folder;
    }
  }

  String _getEmptyMessage(String category) {
    switch (category) {
      case 'new':
        return 'No new sites';
      case 'cp_verification':
        return 'No sites ready for CP verification';
      case 'verified':
        return 'No verified sites';
      case 'approved':
        return 'No approved sites';
      case 'completed':
        return 'No completed sites';
      case 'submitted':
        return 'No submitted sites';
      case 'wfp_confirmed':
        return 'No WFP confirmed sites';
      case 'not_covered':
        return 'No not-covered sites';
      case 'rejected':
        return 'No rejected sites';
      default:
        return 'No sites found';
    }
  }

  String _getEmptySubMessage(String category) {
    switch (category) {
      case 'new':
        return 'Newly assigned sites requiring permit verification will appear here';
      case 'cp_verification':
        return 'Sites with permits attached and ready for verification';
      case 'verified':
        return 'Sites verified by you, waiting for supervisor approval';
      case 'approved':
        return 'Sites approved by hub supervisor';
      case 'completed':
        return 'Sites with completed visits and payment info';
      case 'submitted':
        return 'Visit reports submitted to WFP for confirmation';
      case 'wfp_confirmed':
        return 'Sites confirmed by WFP after visit report review';
      case 'not_covered':
        return 'Sites that were not visited or covered this cycle';
      case 'rejected':
        return 'Rejected sites that need re-verification';
      default:
        return '';
    }
  }

  List<Map<String, dynamic>> _applySearchFilter(
    List<Map<String, dynamic>> sites,
  ) {
    var result = sites;

    // Apply MMP filter
    if (_selectedMmpId != null) {
      result = result
          .where((site) => site['mmp_file_id']?.toString() == _selectedMmpId)
          .toList();
    }

    // Apply activity filter (DM = 3 dates, Non-DM = 1 date)
    if (_activityFilter == 'dm') {
      result = result.where((s) => _isDmActivity(s)).toList();
    } else if (_activityFilter == 'non_dm') {
      result = result.where((s) => !_isDmActivity(s)).toList();
    }

    // Apply text search
    if (_searchQuery.isEmpty) return result;
    final query = _searchQuery.toLowerCase();
    return result.where((site) {
      final name = site['site_name']?.toString().toLowerCase() ?? '';
      final code = site['site_code']?.toString().toLowerCase() ?? '';
      final locality = site['locality']?.toString().toLowerCase() ?? '';
      final state = site['state']?.toString().toLowerCase() ?? '';

      return name.contains(query) ||
          code.contains(query) ||
          locality.contains(query) ||
          state.contains(query);
    }).toList();
  }
}
