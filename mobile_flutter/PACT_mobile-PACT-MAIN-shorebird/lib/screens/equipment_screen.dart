// lib/screens/equipment_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../models/equipment.dart';
import '../services/local_storage_service.dart';
import '../providers/sync_provider.dart';
import '../theme/app_colors.dart';
import '../l10n/app_localizations.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';

class EquipmentScreen extends StatefulWidget {
  const EquipmentScreen({super.key});

  @override
  State<EquipmentScreen> createState() => _EquipmentScreenState();
}

class _EquipmentScreenState extends State<EquipmentScreen> {
  late LocalStorageService _localStorage;
  List<Equipment> _equipment = [];
  String _selectedFilter = 'All';
  String _searchQuery = '';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initializeService();
  }

  Future<void> _initializeService() async {
    _localStorage = LocalStorageService();
    _loadEquipment();

    // Trigger sync when screen loads if online
    final syncProvider = Provider.of<SyncProvider>(context, listen: false);
    if (syncProvider.isOnline) {
      syncProvider.syncEquipment();
    }
  }

  void _loadEquipment() {
    setState(() {
      _isLoading = true;
    });

    final allEquipment = _localStorage.getAllEquipments();

    // Apply filters
    List<Equipment> filteredEquipment = allEquipment;
    if (_selectedFilter != 'All') {
      filteredEquipment = filteredEquipment
          .where((eq) => eq.status == _selectedFilter)
          .toList();
    }
    if (_searchQuery.isNotEmpty) {
      filteredEquipment = filteredEquipment
          .where(
            (eq) => eq.name.toLowerCase().contains(_searchQuery.toLowerCase()),
          )
          .toList();
    }

    setState(() {
      _equipment = filteredEquipment;
      _isLoading = false;
    });
  }

  Future<void> _showAddEquipmentDialog() async {
    final nameController = TextEditingController();
    final maintenanceDateController = TextEditingController();
    String selectedStatus = 'OK';

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          AppLocalizations.of(context)!.addNewEquipment,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.equipmentName,
                  hintText: AppLocalizations.of(context)!.enterEquipmentName,
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: selectedStatus,
                items: ['OK', 'Needs Service']
                    .map(
                      (status) =>
                          DropdownMenuItem(value: status, child: Text(status)),
                    )
                    .toList(),
                onChanged: (value) {
                  selectedStatus = value!;
                },
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.status,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: maintenanceDateController,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.nextMaintenanceDate,
                  hintText: AppLocalizations.of(context)!.yyyyMmDd,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty &&
                  maintenanceDateController.text.isNotEmpty) {
                final newEquipment = Equipment(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  name: nameController.text,
                  status: selectedStatus,
                  isCheckedIn: true,
                  nextMaintenance: maintenanceDateController.text,
                );

                await _localStorage.saveEquipment(newEquipment);
                _loadEquipment();
                if (mounted) Navigator.pop(context);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryOrange,
              foregroundColor: Colors.white, // Ensure text is visible
            ),
            child: Text(AppLocalizations.of(context)!.add),
          ),
        ],
      ),
    );
  }

  Future<void> _showInspectionDialog(Equipment? equipment) async {
    if (equipment == null) return;

    final conditionController = TextEditingController();
    final concernsController = TextEditingController();
    final recommendationsController = TextEditingController();

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          AppLocalizations.of(context)!.inspectionForm,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                equipment.name,
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: conditionController,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.condition,
                  hintText: AppLocalizations.of(context)!.enterCurrentCondition,
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: concernsController,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.concerns,
                  hintText: AppLocalizations.of(context)!.enterAnyConcerns,
                ),
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: recommendationsController,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context)!.recommendations,
                  hintText: AppLocalizations.of(context)!.enterRecommendations,
                ),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          ElevatedButton(
            onPressed: () async {
              if (conditionController.text.isNotEmpty) {
                final inspection = Inspection(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  date: DateTime.now().toIso8601String(),
                  condition: conditionController.text,
                  concerns: concernsController.text,
                  recommendations: recommendationsController.text,
                );

                // Get current equipment and add inspection
                final currentEquipment = _localStorage.getEquipment(
                  equipment.id,
                );
                if (currentEquipment != null) {
                  final updatedInspections = List<Inspection>.from(
                    currentEquipment.inspections ?? [],
                  );
                  updatedInspections.add(inspection);

                  final updatedEquipment = Equipment(
                    id: currentEquipment.id,
                    name: currentEquipment.name,
                    status: currentEquipment.status,
                    isCheckedIn: currentEquipment.isCheckedIn,
                    nextMaintenance: currentEquipment.nextMaintenance,
                    inspections: updatedInspections,
                  );

                  await _localStorage.saveEquipment(updatedEquipment);
                }
                _loadEquipment();
                if (mounted) Navigator.pop(context);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryOrange,
            ),
            child: Text(AppLocalizations.of(context)!.submit),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.all(16.0),
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildFilterChips(),
                            const SizedBox(height: 16),
                            if (_equipment.isNotEmpty)
                              ...List.generate(
                                _equipment.length,
                                (index) => _buildEquipmentItem(
                                  name: _equipment[index].name,
                                  status: _equipment[index].status,
                                  isCheckedIn: _equipment[index].isCheckedIn,
                                  nextMaintenance:
                                      _equipment[index].nextMaintenance,
                                  statusColor: _equipment[index].status == 'OK'
                                      ? AppColors.accentGreen
                                      : AppColors.accentRed,
                                  onCheckedChanged: (value) async {
                                    final updatedEquipment = Equipment(
                                      id: _equipment[index].id,
                                      name: _equipment[index].name,
                                      status: _equipment[index].status,
                                      isCheckedIn: value,
                                      nextMaintenance:
                                          _equipment[index].nextMaintenance,
                                      inspections:
                                          _equipment[index].inspections,
                                    );
                                    await _localStorage.saveEquipment(
                                      updatedEquipment,
                                    );
                                    _loadEquipment();
                                  },
                                  onTap: () =>
                                      _showInspectionDialog(_equipment[index]),
                                ),
                              ),
                            if (_equipment.isEmpty)
                              Center(
                                child: Padding(
                                  padding: EdgeInsets.all(
                                    AppDesignSystem.spaceLG,
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Container(
                                        padding: EdgeInsets.all(
                                          AppDesignSystem.spaceLG,
                                        ),
                                        decoration: BoxDecoration(
                                          color: AppColors.primaryOrange
                                              .withOpacity(0.1),
                                          shape: BoxShape.circle,
                                        ),
                                        child: Icon(
                                          Icons.inventory_2_outlined,
                                          size: 64,
                                          color: AppColors.primaryOrange,
                                        ),
                                      ).animate().scale(
                                        duration: 600.ms,
                                        curve: Curves.elasticOut,
                                      ),
                                      SizedBox(height: AppDesignSystem.spaceMD),
                                      Text(
                                        AppLocalizations.of(
                                          context,
                                        )!.noEquipmentFound,
                                        style: AppDesignSystem.headlineMedium,
                                      ).animate().fadeIn(delay: 200.ms),
                                      SizedBox(height: AppDesignSystem.spaceSM),
                                      Text(
                                        AppLocalizations.of(
                                          context,
                                        )!.tapPlusButtonToAddEquipment,
                                        style: AppDesignSystem.bodyMedium
                                            .copyWith(
                                              color: AppColors.textLight,
                                            ),
                                      ).animate().fadeIn(delay: 300.ms),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          HapticFeedback.mediumImpact();
          _showAddEquipmentDialog();
        },
        backgroundColor: AppColors.primaryOrange,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Add Equipment',
          style: AppDesignSystem.labelLarge.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
      ).animate().scale(delay: 400.ms, duration: 400.ms),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.only(left: 16, right: 8, top: 16, bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Text(
            AppLocalizations.of(context)!.equipment,
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.w600,
              color: AppColors.textDark,
            ),
          ),
          const Spacer(),
          IconButton(
            onPressed: () {
              // Show bottom sheet with filter options
              HapticFeedback.lightImpact();
              showModalBottomSheet(
                context: context,
                builder: (context) => Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        AppLocalizations.of(context)!.filterEquipment,
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 16),
                      _buildFilterChips(),
                    ],
                  ),
                ),
              );
            },
            icon: Icon(
              Icons.filter_list,
              color: AppColors.primaryOrange,
              size: 28,
            ),
          ),
          IconButton(
            onPressed: () {
              // Show search dialog
              HapticFeedback.lightImpact();
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: Text(
                    AppLocalizations.of(context)!.searchEquipment,
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                  ),
                  content: TextField(
                    onChanged: (value) {
                      _searchQuery = value;
                      _loadEquipment();
                    },
                    decoration: InputDecoration(
                      hintText: AppLocalizations.of(
                        context,
                      )!.enterEquipmentNameSearch,
                      prefixIcon: Icon(Icons.search),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text(AppLocalizations.of(context)!.close),
                    ),
                  ],
                ),
              );
            },
            icon: Icon(Icons.search, color: AppColors.primaryOrange, size: 28),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms);
  }

  Widget _buildFilterChips() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          _buildFilterChip(AppLocalizations.of(context)!.all, true),
          _buildFilterChip(AppLocalizations.of(context)!.available, false),
          _buildFilterChip(AppLocalizations.of(context)!.inUse, false),
          _buildFilterChip(
            AppLocalizations.of(context)!.needsMaintenance,
            false,
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 100.ms);
  }

  Widget _buildFilterChip(String label, bool isSelected) {
    return Container(
      margin: const EdgeInsets.only(right: 12),
      child: FilterChip(
        selected: isSelected,
        showCheckmark: false,
        selectedColor: AppColors.primaryOrange.withOpacity(0.1),
        backgroundColor: Colors.white,
        side: BorderSide(
          color: isSelected ? AppColors.primaryOrange : AppColors.borderColor,
          width: 1.5,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        label: Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? AppColors.primaryOrange : AppColors.textLight,
          ),
        ),
        onSelected: (value) {
          setState(() {
            _selectedFilter = label;
          });
          _loadEquipment();
        },
      ),
    );
  }

  Widget _buildEquipmentItem({
    required String name,
    required String status,
    required bool isCheckedIn,
    required String nextMaintenance,
    required Color statusColor,
    required Function(bool) onCheckedChanged,
    required VoidCallback onTap,
  }) {
    return AppCard(
      margin: EdgeInsets.only(bottom: AppDesignSystem.spaceMD),
      shadows: AppDesignSystem.shadowSM,
      onTap: onTap,
      child: Row(
        children: [
          // Status Icon
          Container(
            padding: EdgeInsets.all(AppDesignSystem.spaceMD),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppDesignSystem.radiusMD),
            ),
            child: Icon(
              status == 'OK' ? Icons.check_circle : Icons.warning,
              color: statusColor,
              size: 28,
            ),
          ),
          SizedBox(width: AppDesignSystem.spaceMD),
          // Equipment Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: AppDesignSystem.titleLarge.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: AppDesignSystem.spaceXS),
                Row(
                  children: [
                    StatusBadge(
                      text: status,
                      type: status == 'OK'
                          ? StatusType.success
                          : StatusType.error,
                    ),
                    SizedBox(width: AppDesignSystem.spaceSM),
                    Expanded(
                      child: Text(
                        '${AppLocalizations.of(context)!.next}: $nextMaintenance',
                        style: AppDesignSystem.bodySmall.copyWith(
                          color: AppColors.textLight,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Check-in Switch
          Switch(
            value: isCheckedIn,
            onChanged: onCheckedChanged,
            activeThumbColor: AppColors.primaryOrange,
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.2, end: 0);
  }
}
