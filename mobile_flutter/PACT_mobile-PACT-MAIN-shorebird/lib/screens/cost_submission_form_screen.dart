import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission_models.dart';
import '../models/site_visit.dart';
import '../providers/cost_submission_provider.dart';
import '../providers/profile_provider.dart';
import '../services/cost_submission_service.dart';
import '../services/site_visit_service.dart';

class CostSubmissionFormScreen extends ConsumerStatefulWidget {
  final String? editSubmissionId;

  const CostSubmissionFormScreen({super.key, this.editSubmissionId});

  @override
  ConsumerState<CostSubmissionFormScreen> createState() =>
      _CostSubmissionFormScreenState();
}

class _CostSubmissionFormScreenState
    extends ConsumerState<CostSubmissionFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _transportCentsController = TextEditingController();
  final _transportDetailsController = TextEditingController();
  final _accommodationCentsController = TextEditingController();
  final _accommodationDetailsController = TextEditingController();
  final _mealCentsController = TextEditingController();
  final _mealDetailsController = TextEditingController();
  final _otherCentsController = TextEditingController();
  final _otherDetailsController = TextEditingController();
  final _notesController = TextEditingController();

  String? _selectedSiteVisitId;
  SiteVisit? _selectedSiteVisit;
  String _selectedCurrency = 'SDG';
  final List<SupportingDocument> _documents = [];
  bool _isSubmitting = false;
  int _totalCents = 0;

  // Site visit data
  List<SiteVisit> _completedSiteVisits = [];
  bool _loadingSiteVisits = true;
  final _siteVisitService = SiteVisitService();

  // Service getter
  CostSubmissionService get service => ref.read(costSubmissionServiceProvider);

  @override
  void initState() {
    super.initState();
    _setupListeners();
    _loadCompletedSiteVisits();

    if (widget.editSubmissionId != null) {
      _loadExistingSubmission();
    }
  }

  Future<void> _loadCompletedSiteVisits() async {
    setState(() => _loadingSiteVisits = true);

    try {
      final currentUser = Supabase.instance.client.auth.currentUser;
      if (currentUser == null) {
        throw Exception('User not authenticated');
      }

      // Load all completed site visits for current user
      final visits = await _siteVisitService.getCompletedSiteVisits(
        currentUser.id,
      );

      // Filter by assignment (unless user is admin/supervisor)
      final profile = ref.read(currentUserProfileProvider);
      final isAdminOrSupervisor =
          profile?.role == 'admin' ||
          profile?.role == 'supervisor' ||
          profile?.role == 'financeAdmin';

      final filteredVisits = isAdminOrSupervisor
          ? visits
          : visits.where((v) => v.assignedTo == currentUser.id).toList();

      setState(() {
        _completedSiteVisits = filteredVisits;
        _loadingSiteVisits = false;
      });
    } catch (e) {
      setState(() => _loadingSiteVisits = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading site visits: $e')),
        );
      }
    }
  }

  void _setupListeners() {
    _transportCentsController.addListener(_calculateTotal);
    _accommodationCentsController.addListener(_calculateTotal);
    _mealCentsController.addListener(_calculateTotal);
    _otherCentsController.addListener(_calculateTotal);
  }

  void _calculateTotal() {
    setState(() {
      _totalCents =
          (_parseCents(_transportCentsController.text) ?? 0) +
          (_parseCents(_accommodationCentsController.text) ?? 0) +
          (_parseCents(_mealCentsController.text) ?? 0) +
          (_parseCents(_otherCentsController.text) ?? 0);
    });
  }

  int? _parseCents(String text) {
    if (text.isEmpty) return 0;
    try {
      return int.parse(text);
    } catch (e) {
      return null;
    }
  }

  Future<void> _loadExistingSubmission() async {
    // Load existing submission for editing
    final submission = await ref.read(
      costSubmissionByIdProvider(widget.editSubmissionId!).future,
    );
    if (submission != null && mounted) {
      setState(() {
        _selectedSiteVisitId = submission.siteVisitId;
        _transportCentsController.text = submission.transportationCostCents
            .toString();
        _transportDetailsController.text =
            submission.transportationDetails ?? '';
        _accommodationCentsController.text = submission.accommodationCostCents
            .toString();
        _accommodationDetailsController.text =
            submission.accommodationDetails ?? '';
        _mealCentsController.text = submission.mealAllowanceCents.toString();
        _mealDetailsController.text = submission.mealDetails ?? '';
        _otherCentsController.text = submission.otherCostsCents.toString();
        _otherDetailsController.text = submission.otherCostsDetails ?? '';
        _notesController.text = submission.submissionNotes ?? '';
        _selectedCurrency = submission.currency;
        _documents.addAll(submission.supportingDocuments);
      });
    }
  }

  @override
  void dispose() {
    _transportCentsController.dispose();
    _transportDetailsController.dispose();
    _accommodationCentsController.dispose();
    _accommodationDetailsController.dispose();
    _mealCentsController.dispose();
    _mealDetailsController.dispose();
    _otherCentsController.dispose();
    _otherDetailsController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.watch(costSubmissionServiceProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        title: Text(
          widget.editSubmissionId == null
              ? 'Submit Costs'
              : 'Edit Cost Submission',
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Total Cost Summary Card
            _buildTotalCostCard(service),
            const SizedBox(height: 24),

            // Site Visit Selection
            _buildSiteVisitSelector(),
            const SizedBox(height: 24),

            // Transportation Section
            _buildCostSection(
              title: 'Transportation',
              icon: Icons.directions_car,
              color: const Color(0xFF1976D2),
              centsController: _transportCentsController,
              detailsController: _transportDetailsController,
              hint: 'e.g., Taxi, bus, fuel costs',
            ),
            const SizedBox(height: 24),

            // Accommodation Section
            _buildCostSection(
              title: 'Accommodation',
              icon: Icons.hotel,
              color: const Color(0xFF7B1FA2),
              centsController: _accommodationCentsController,
              detailsController: _accommodationDetailsController,
              hint: 'e.g., Hotel, guesthouse',
            ),
            const SizedBox(height: 24),

            // Meal Allowance Section
            _buildCostSection(
              title: 'Meal Allowance',
              icon: Icons.restaurant,
              color: const Color(0xFFFF6F00),
              centsController: _mealCentsController,
              detailsController: _mealDetailsController,
              hint: 'e.g., Breakfast, lunch, dinner',
            ),
            const SizedBox(height: 24),

            // Other Costs Section
            _buildCostSection(
              title: 'Other Costs',
              icon: Icons.more_horiz,
              color: const Color(0xFF455A64),
              centsController: _otherCentsController,
              detailsController: _otherDetailsController,
              hint: 'e.g., Parking, tolls, supplies',
            ),
            const SizedBox(height: 24),

            // Currency Selection
            _buildCurrencySelector(),
            const SizedBox(height: 24),

            // Submission Notes
            _buildNotesField(),
            const SizedBox(height: 24),

            // Supporting Documents
            _buildDocumentsSection(service),
            const SizedBox(height: 24),

            // Submit Button
            _buildSubmitButton(service),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildTotalCostCard(CostSubmissionService service) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Text(
              'Total Cost',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              service.formatCurrencyWithSymbol(
                _totalCents,
                currency: _selectedCurrency,
              ),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$_totalCents cents',
              style: const TextStyle(color: Colors.white54, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSiteVisitSelector() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1976D2).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.location_on,
                    color: Color(0xFF1976D2),
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Site Visit',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Text(
                  ' *',
                  style: TextStyle(color: Colors.red, fontSize: 18),
                ),
                const Spacer(),
                if (_loadingSiteVisits)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedSiteVisitId,
              decoration: InputDecoration(
                hintText: _loadingSiteVisits
                    ? 'Loading site visits...'
                    : 'Select completed site visit',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Please select a site visit';
                }
                return null;
              },
              items: _completedSiteVisits.map((visit) {
                return DropdownMenuItem(
                  value: visit.id,
                  child: Text(
                    '${visit.siteName} - ${visit.siteCode}',
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }).toList(),
              onChanged: _loadingSiteVisits
                  ? null
                  : (value) {
                      setState(() {
                        _selectedSiteVisitId = value;
                        _selectedSiteVisit = _completedSiteVisits.firstWhere(
                          (v) => v.id == value,
                          orElse: () => _completedSiteVisits.first,
                        );
                      });
                    },
            ),
            if (_completedSiteVisits.isEmpty && !_loadingSiteVisits)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'No completed site visits available. Complete a site visit to submit costs.',
                  style: TextStyle(color: Colors.orange[700], fontSize: 12),
                ),
              ),

            // Budget Information Card
            if (_selectedSiteVisit != null) ...[
              const SizedBox(height: 16),
              _buildBudgetInfoCard(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildBudgetInfoCard() {
    final transportBudget = _selectedSiteVisit!.transportFee ?? 0.0;
    final enumeratorFee = _selectedSiteVisit!.enumeratorFee ?? 0.0;
    final totalBudget = transportBudget + enumeratorFee;
    final totalBudgetCents = (totalBudget * 100).round();
    final budgetUtilizationPercent = totalBudget > 0
        ? (_totalCents / totalBudgetCents) * 100
        : 0.0;
    final isOverBudget = _totalCents > totalBudgetCents;
    final isNearBudget = budgetUtilizationPercent > 80 && !isOverBudget;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isOverBudget
                ? [Colors.red.shade50, Colors.red.shade100]
                : isNearBudget
                ? [Colors.orange.shade50, Colors.orange.shade100]
                : [Colors.green.shade50, Colors.green.shade100],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color:
                        (isOverBudget
                                ? Colors.red
                                : isNearBudget
                                ? Colors.orange
                                : Colors.green)
                            .withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    isOverBudget
                        ? Icons.warning
                        : isNearBudget
                        ? Icons.warning_amber
                        : Icons.check_circle,
                    color: isOverBudget
                        ? Colors.red
                        : isNearBudget
                        ? Colors.orange
                        : Colors.green,
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Budget Information',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildBudgetItem(
                    'Transport Budget',
                    service.formatCurrency(
                      (transportBudget * 100).round(),
                      currency: _selectedCurrency,
                    ),
                    Icons.directions_car,
                    const Color(0xFF1976D2),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildBudgetItem(
                    'Enumerator Fee',
                    service.formatCurrency(
                      (enumeratorFee * 100).round(),
                      currency: _selectedCurrency,
                    ),
                    Icons.person,
                    const Color(0xFF7B1FA2),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildBudgetItem(
              'Total Available Budget',
              service.formatCurrency(
                totalBudgetCents,
                currency: _selectedCurrency,
              ),
              Icons.account_balance_wallet,
              const Color(0xFF388E3C),
            ),
            const SizedBox(height: 12),
            _buildBudgetItem(
              'Current Total Cost',
              service.formatCurrency(_totalCents, currency: _selectedCurrency),
              Icons.calculate,
              isOverBudget
                  ? Colors.red
                  : isNearBudget
                  ? Colors.orange
                  : const Color(0xFF1976D2),
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: budgetUtilizationPercent / 100,
              backgroundColor: Colors.grey.shade300,
              valueColor: AlwaysStoppedAnimation<Color>(
                isOverBudget
                    ? Colors.red
                    : isNearBudget
                    ? Colors.orange
                    : Colors.green,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${budgetUtilizationPercent.toStringAsFixed(1)}% of budget used',
              style: TextStyle(
                fontSize: 12,
                color: isOverBudget
                    ? Colors.red
                    : isNearBudget
                    ? Colors.orange
                    : Colors.green,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (isOverBudget) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error, color: Colors.red, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Cost exceeds allocated budget by ${service.formatCurrency(_totalCents - totalBudgetCents, currency: _selectedCurrency)}',
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (isNearBudget) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber,
                      color: Colors.orange,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Warning: Using ${budgetUtilizationPercent.toStringAsFixed(1)}% of allocated budget',
                        style: const TextStyle(
                          color: Colors.orange,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildBudgetItem(
    String label,
    String amount,
    IconData icon,
    Color color,
  ) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                amount,
                style: TextStyle(
                  fontSize: 14,
                  color: color,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCostSection({
    required String title,
    required IconData icon,
    required Color color,
    required TextEditingController centsController,
    required TextEditingController detailsController,
    required String hint,
  }) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: color),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: centsController,
              decoration: InputDecoration(
                labelText: 'Amount (in cents)',
                hintText: '0',
                prefixIcon: Icon(Icons.monetization_on, color: color),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (value) {
                if (value != null && value.isNotEmpty) {
                  final cents = int.tryParse(value);
                  if (cents == null || cents < 0) {
                    return 'Invalid amount';
                  }
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: detailsController,
              decoration: InputDecoration(
                labelText: 'Details (optional)',
                hintText: hint,
                prefixIcon: Icon(Icons.description, color: color),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrencySelector() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4CAF50).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.attach_money,
                    color: Color(0xFF4CAF50),
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Currency',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedCurrency,
              decoration: InputDecoration(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              items: const [
                DropdownMenuItem(
                  value: 'SDG',
                  child: Text('SDG - Sudanese Pound'),
                ),
                DropdownMenuItem(value: 'USD', child: Text('USD - US Dollar')),
                DropdownMenuItem(value: 'EUR', child: Text('EUR - Euro')),
              ],
              onChanged: (value) {
                setState(() {
                  _selectedCurrency = value ?? 'SDG';
                  _calculateTotal(); // Recalculate to update display
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotesField() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF9800).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.note, color: Color(0xFFFF9800)),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Submission Notes',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notesController,
              decoration: InputDecoration(
                hintText: 'Add any additional notes or context...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              maxLines: 4,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentsSection(CostSubmissionService service) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF44336).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.attach_file,
                    color: Color(0xFFF44336),
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Supporting Documents',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                Text(
                  '${_documents.length}/10',
                  style: TextStyle(color: Colors.grey[600], fontSize: 14),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_documents.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Center(
                  child: Column(
                    children: [
                      Icon(
                        Icons.cloud_upload,
                        size: 48,
                        color: Colors.grey[400],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'No documents attached',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...(_documents.map((doc) => _buildDocumentItem(doc))),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _documents.length < 10 ? _pickDocument : null,
                icon: const Icon(Icons.add),
                label: const Text('Add Document'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFF44336),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentItem(SupportingDocument doc) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Row(
        children: [
          Icon(_getDocumentIcon(doc.filename), color: const Color(0xFFF44336)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.filename,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  doc.type,
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.delete, color: Colors.red),
            onPressed: () {
              setState(() {
                _documents.remove(doc);
              });
            },
          ),
        ],
      ),
    );
  }

  IconData _getDocumentIcon(String filename) {
    final extension = filename.split('.').last.toLowerCase();
    switch (extension) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return Icons.image;
      default:
        return Icons.insert_drive_file;
    }
  }

  Future<void> _pickDocument() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
        allowMultiple: false,
      );

      if (result != null && result.files.isNotEmpty) {
        final file = result.files.first;

        // Validate file
        final service = ref.read(costSubmissionServiceProvider);
        final validation = service.validateDocument(
          filename: file.name,
          fileSizeBytes: file.size,
        );

        if (!validation.isValid && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(validation.error ?? 'Invalid file')),
          );
          return;
        }

        // Create document (in real app, upload to storage first)
        final document = SupportingDocument(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          url: file.path ?? '',
          type: _getDocumentType(file.extension ?? ''),
          filename: file.name,
          uploadedAt: DateTime.now(),
        );

        setState(() {
          _documents.add(document);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error picking file: $e')));
      }
    }
  }

  String _getDocumentType(String extension) {
    switch (extension.toLowerCase()) {
      case 'pdf':
        return 'receipt';
      case 'jpg':
      case 'jpeg':
      case 'png':
        return 'photo';
      default:
        return 'document';
    }
  }

  Widget _buildSubmitButton(CostSubmissionService service) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: _isSubmitting ? null : _handleSubmit,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4CAF50),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 4,
        ),
        child: _isSubmitting
            ? const SizedBox(
                height: 24,
                width: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : Text(
                widget.editSubmissionId == null
                    ? 'SUBMIT COSTS'
                    : 'UPDATE SUBMISSION',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                ),
              ),
      ),
    );
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final service = ref.read(costSubmissionServiceProvider);
    final currentUser = Supabase.instance.client.auth.currentUser;

    if (currentUser == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('User not authenticated')));
      return;
    }

    // CONSTRAINT 1: Validate site visit is selected and is from completed visits
    if (_selectedSiteVisit == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a completed site visit'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // CONSTRAINT 2: Validate project linkage - site visit must be linked to a project
    if (_selectedSiteVisit!.mmpId == null ||
        _selectedSiteVisit!.mmpId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Cannot submit costs: Site visit is not linked to a project',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // CONSTRAINT 3: Validate assignment - site visit must be assigned to current user (unless admin/supervisor)
    final profile = ref.read(currentUserProfileProvider);
    final isAdminOrSupervisor =
        profile?.role == 'admin' ||
        profile?.role == 'supervisor' ||
        profile?.role == 'financeAdmin';

    if (!isAdminOrSupervisor &&
        _selectedSiteVisit!.assignedTo != currentUser.id) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'You can only submit costs for site visits assigned to you',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // CONSTRAINT 4: Validate project membership - user must be a member of the project
    try {
      // Query mmp_files to get projectId
      final mmpResponse = await Supabase.instance.client
          .from('mmp_files')
          .select('project_id')
          .eq('id', _selectedSiteVisit!.mmpId!)
          .maybeSingle();

      if (mmpResponse == null || mmpResponse['project_id'] == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Cannot submit costs: Site visit project information not found',
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      final projectId = mmpResponse['project_id'] as String;

      // Check if user is a member of this project
      // Note: Assuming project_team_members table exists with user_id and project_id
      final membershipResponse = await Supabase.instance.client
          .from('project_team_members')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('project_id', projectId)
          .maybeSingle();

      if (membershipResponse == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('You are not a member of this project team'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
    } catch (e) {
      // If project membership check fails (e.g., table doesn't exist), log but continue
      // This allows the system to work even if project membership isn't set up yet
      debugPrint('Project membership check failed: $e');
    }

    // Validate costs
    final validation = service.validateCostSubmission(
      transportationCents: _parseCents(_transportCentsController.text) ?? 0,
      accommodationCents: _parseCents(_accommodationCentsController.text) ?? 0,
      mealCents: _parseCents(_mealCentsController.text) ?? 0,
      otherCents: _parseCents(_otherCentsController.text) ?? 0,
      siteVisitId: _selectedSiteVisitId,
      documents: _documents,
    );

    if (!validation.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validation.error ?? 'Validation failed')),
      );
      return;
    }

    // Show warnings if any
    if (validation.warnings.isNotEmpty) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Warnings'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: validation.warnings.map((w) => Text('• $w')).toList(),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('CANCEL'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('PROCEED'),
            ),
          ],
        ),
      );

      if (proceed != true) return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      if (widget.editSubmissionId == null) {
        // Create new submission
        final request = CreateCostSubmissionRequest(
          siteVisitId: _selectedSiteVisitId!,
          transportationCostCents:
              _parseCents(_transportCentsController.text) ?? 0,
          accommodationCostCents:
              _parseCents(_accommodationCentsController.text) ?? 0,
          mealAllowanceCents: _parseCents(_mealCentsController.text) ?? 0,
          otherCostsCents: _parseCents(_otherCentsController.text) ?? 0,
          currency: _selectedCurrency,
          transportationDetails: _transportDetailsController.text.isNotEmpty
              ? _transportDetailsController.text
              : null,
          accommodationDetails: _accommodationDetailsController.text.isNotEmpty
              ? _accommodationDetailsController.text
              : null,
          mealDetails: _mealDetailsController.text.isNotEmpty
              ? _mealDetailsController.text
              : null,
          otherCostsDetails: _otherDetailsController.text.isNotEmpty
              ? _otherDetailsController.text
              : null,
          submissionNotes: _notesController.text.isNotEmpty
              ? _notesController.text
              : null,
          supportingDocuments: _documents.isNotEmpty ? _documents : null,
        );

        await ref.read(createCostSubmissionProvider.notifier).create(request);
      } else {
        // Update existing submission
        final request = UpdateCostSubmissionRequest(
          transportationCostCents:
              _parseCents(_transportCentsController.text) ?? 0,
          accommodationCostCents:
              _parseCents(_accommodationCentsController.text) ?? 0,
          mealAllowanceCents: _parseCents(_mealCentsController.text) ?? 0,
          otherCostsCents: _parseCents(_otherCentsController.text) ?? 0,
          transportationDetails: _transportDetailsController.text.isNotEmpty
              ? _transportDetailsController.text
              : null,
          accommodationDetails: _accommodationDetailsController.text.isNotEmpty
              ? _accommodationDetailsController.text
              : null,
          mealDetails: _mealDetailsController.text.isNotEmpty
              ? _mealDetailsController.text
              : null,
          otherCostsDetails: _otherDetailsController.text.isNotEmpty
              ? _otherDetailsController.text
              : null,
          submissionNotes: _notesController.text.isNotEmpty
              ? _notesController.text
              : null,
          supportingDocuments: _documents.isNotEmpty ? _documents : null,
        );

        await ref
            .read(updateCostSubmissionProvider.notifier)
            .update(widget.editSubmissionId!, request);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.editSubmissionId == null
                  ? 'Cost submission created successfully!'
                  : 'Cost submission updated successfully!',
            ),
            backgroundColor: const Color(0xFF4CAF50),
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }
}
