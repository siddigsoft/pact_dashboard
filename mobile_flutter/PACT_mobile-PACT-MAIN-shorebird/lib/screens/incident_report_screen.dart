import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../models/incident_report.dart';
import '../services/local_storage_service.dart';
import '../services/auth_service.dart';
import '../providers/sync_provider.dart';
import '../theme/app_colors.dart';
import '../l10n/app_localizations.dart';

class IncidentReportScreen extends StatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  State<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends State<IncidentReportScreen> {
  late LocalStorageService _localStorage;
  late AuthService _authService;
  List<IncidentReport> _reports = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initializeService();
  }

  Future<void> _initializeService() async {
    _localStorage = LocalStorageService();
    _authService = AuthService();
    _loadReports();

    // Trigger sync when screen loads if online
    final syncProvider = Provider.of<SyncProvider>(context, listen: false);
    if (syncProvider.isOnline) {
      syncProvider.syncIncidentReports();
    }
  }

  Future<void> _loadReports() async {
    setState(() => _isLoading = true);
    final reports = _localStorage.getAllIncidentReports();
    setState(() {
      _reports = reports;
      _isLoading = false;
    });
  }

  Future<void> _showNewReportForm() async {
    final locationController = TextEditingController();
    final descriptionController = TextEditingController();
    final witnessesController = TextEditingController();
    final actionController = TextEditingController();
    String selectedType = 'other';
    bool requiresImmediate = false;

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          AppLocalizations.of(context)!.reportIncident,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                items:
                    [
                          'harassment',
                          'theft',
                          'accident',
                          'medicalEmergency',
                          'naturalDisaster',
                          'other',
                        ]
                        .map(
                          (type) =>
                              DropdownMenuItem(value: type, child: Text(type)),
                        )
                        .toList(),
                onChanged: (value) {
                  if (value != null) selectedType = value;
                },
                decoration: const InputDecoration(labelText: 'Incident Type'),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: locationController,
                decoration: const InputDecoration(
                  labelText: 'Location',
                  hintText: 'Enter incident location',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  hintText: 'Describe what happened',
                ),
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: witnessesController,
                decoration: const InputDecoration(
                  labelText: 'Witnesses',
                  hintText: 'List witnesses (comma-separated)',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: actionController,
                decoration: const InputDecoration(
                  labelText: 'Action Taken',
                  hintText: 'Describe any immediate action taken',
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              StatefulBuilder(
                builder: (context, setState) => SwitchListTile(
                  title: const Text('Requires Immediate Attention'),
                  value: requiresImmediate,
                  onChanged: (value) =>
                      setState(() => requiresImmediate = value),
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
              if (locationController.text.isNotEmpty &&
                  descriptionController.text.isNotEmpty) {
                final report = IncidentReport(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  userId: _authService.currentUser?.id ?? '',
                  incidentType: selectedType,
                  description: descriptionController.text,
                  severity: requiresImmediate ? 'critical' : 'moderate',
                  location: locationController.text,
                  incidentDate: DateTime.now(),
                  witnesses: witnessesController.text
                      .split(',')
                      .map((e) => e.trim())
                      .where((e) => e.isNotEmpty)
                      .toList(),
                  immediateActionTaken: actionController.text.isNotEmpty
                      ? actionController.text
                      : null,
                  requiresFollowUp: !requiresImmediate,
                  createdAt: DateTime.now(),
                  updatedAt: DateTime.now(),
                );

                await _localStorage.saveIncidentReport(report);
                _loadReports();
                if (mounted) Navigator.pop(context);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryOrange,
              foregroundColor: Colors.white,
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
      appBar: AppBar(
        title: Row(
          children: [
            Text(
              'Incident Reports',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
          ],
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          color: AppColors.textDark,
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _reports.length,
              itemBuilder: (context, index) {
                final report = _reports[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 16),
                  child: ListTile(
                    title: Text(
                      report.incidentType ?? 'Incident Report',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Location: ${report.location}',
                          style: GoogleFonts.poppins(),
                        ),
                        Text(
                          'Date: ${report.incidentDate.toString().split('.')[0] ?? report.createdAt.toString().split('.')[0]}',
                          style: GoogleFonts.poppins(),
                        ),
                      ],
                    ),
                    trailing: report.severity == 'critical'
                        ? Icon(Icons.warning, color: AppColors.accentRed)
                        : null,
                    onTap: () {
                      // Show detailed view
                      showDialog(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: Text(
                            report.incidentType ?? 'Incident Report',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          content: SingleChildScrollView(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _buildDetailItem('Location', report.location),
                                _buildDetailItem(
                                  'Date',
                                  report.incidentDate.toString().split(
                                        '.',
                                      )[0] ??
                                      report.createdAt.toString().split('.')[0],
                                ),
                                _buildDetailItem(
                                  'Description',
                                  report.description,
                                ),
                                if (report.witnesses != null &&
                                    report.witnesses!.isNotEmpty)
                                  _buildDetailItem(
                                    'Witnesses',
                                    report.witnesses!.join(', '),
                                  ),
                                if (report.immediateActionTaken != null)
                                  _buildDetailItem(
                                    'Immediate Action Taken',
                                    report.immediateActionTaken!,
                                  ),
                                _buildDetailItem('Severity', report.severity),
                                _buildDetailItem(
                                  'Requires Follow-up',
                                  report.requiresFollowUp ? 'Yes' : 'No',
                                ),
                              ],
                            ),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Close'),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ).animate().fadeIn(duration: 300.ms);
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          HapticFeedback.mediumImpact();
          _showNewReportForm();
        },
        backgroundColor: AppColors.primaryOrange,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildDetailItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w600,
              color: AppColors.textLight,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(fontSize: 16, color: AppColors.textDark),
          ),
        ],
      ),
    );
  }
}
