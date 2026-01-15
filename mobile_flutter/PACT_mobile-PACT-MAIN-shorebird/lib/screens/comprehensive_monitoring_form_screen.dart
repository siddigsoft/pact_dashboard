import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../models/comprehensive_safety_checklist.dart';
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';
import '../services/comprehensive_monitoring_service.dart';

class ComprehensiveMonitoringFormScreen extends StatefulWidget {
  const ComprehensiveMonitoringFormScreen({super.key});

  @override
  State<ComprehensiveMonitoringFormScreen> createState() =>
      _ComprehensiveMonitoringFormScreenState();
}

class _ComprehensiveMonitoringFormScreenState
    extends State<ComprehensiveMonitoringFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _scrollController = ScrollController();

  // Enumerator & Site Details
  final _enumeratorNameController = TextEditingController();
  final _enumeratorContactController = TextEditingController();
  final _teamLeaderController = TextEditingController();
  final _locationHubController = TextEditingController();
  final _siteNameIdController = TextEditingController();
  DateTime _visitDate = DateTime.now();
  TimeOfDay _visitTime = TimeOfDay.now();

  // Activities Monitored Checkboxes
  final Map<String, bool> _activitiesMonitored = {
    'AM': false,
    'DM': false,
    'PDM': false,
    'MDM': false,
    'PHL': false,
  };

  // Activity Monitoring (AM) Responses
  final Map<String, TextEditingController> _amControllers = {};
  final Map<String, String> _amPriorities = {};
  final List<String> _amPhotos = [];

  // Distribution Monitoring (DM) Responses
  final Map<String, TextEditingController> _dmControllers = {};
  final List<String> _dmPhotos = [];

  // Post-Distribution Monitoring (PDM) Responses
  final Map<String, TextEditingController> _pdmControllers = {};
  final List<String> _pdmPhotos = [];

  // Post-Harvest Loss (PHL) Responses
  final Map<String, TextEditingController> _phlControllers = {};
  final List<String> _phlPhotos = [];

  // Market Diversion Monitoring (MDM) Responses
  final Map<String, TextEditingController> _mdmControllers = {};
  final List<String> _mdmPhotos = [];

  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  // Activity Monitoring Questions
  final List<Map<String, dynamic>> _amQuestions = [
    {
      'question':
          'What stood out about the environment today (security, weather, or access conditions)?',
      'answer': 'Site overview (queues, shelter)',
      'priority': true,
    },
    {
      'question':
          'How would you describe the condition and use of WASH facilities by beneficiaries?',
      'answer': 'WASH facilities',
      'priority': true,
    },
    {
      'question':
          'What did you notice about the shelter, waiting areas, or furniture provided?',
      'answer': 'Waiting areas/furniture',
      'priority': true,
    },
    {
      'question':
          'How did the food/NFIs look when handed out (packaging, completeness, quality)?',
      'answer': 'Food/NFI condition',
      'priority': true,
    },
    {
      'question':
          'How did people queue and interact during distribution — who seemed most comfortable or most disadvantaged?',
      'answer': 'Queue dynamics',
      'priority': true,
    },
    {
      'question':
          'What did the overall distribution process look like from start to finish?',
      'answer': 'Queue/crowd control',
      'priority': true,
    },
    {
      'question': 'How did staff check and hand over entitlements?',
      'answer': 'Distribution point',
      'priority': true,
    },
    {
      'question':
          'How would you describe the quality and condition of the commodities at the site?',
      'answer': 'Item condition',
      'priority': true,
    },
    {
      'question':
          'How were different groups (women, elderly, disabled) treated — what moments showed fairness or exclusion?',
      'answer': 'Distribution interactions',
      'priority': true,
    },
    {
      'question':
          'How did beneficiaries explain what they expected to receive — and how did this compare to what they got?',
      'answer': 'Posters/info boards',
      'priority': true,
    },
    {
      'question':
          'What kinds of feedback (positive or negative) did people share about the process?',
      'answer': 'Posters/info boards',
      'priority': true,
    },
  ];

  // Distribution Monitoring Questions
  final List<Map<String, dynamic>> _dmQuestions = [
    {
      'question':
          'What stories did you hear about how families are using the items (eating, storing, selling)?',
      'answer': 'Household use/storage',
    },
    {
      'question':
          'What coping strategies did people mention when food ran short?',
      'answer': 'Household storage',
    },
    {
      'question':
          'What risks or challenges did people mention when traveling to and from the site?',
      'answer': 'Road/access photos (if relevant)',
    },
  ];

  // Post-Distribution Monitoring Questions
  final List<Map<String, dynamic>> _pdmQuestions = [
    {
      'question':
          'How did farmers react to the quality of bags/tarps — any complaints or appreciation?',
      'answer': 'Bags/tarps in use',
    },
    {
      'question':
          'How are storage items being used in practice — what did you see inside households or stores?',
      'answer': 'Storage facilities',
    },
    {
      'question':
          'What examples or spoilage, pests, or loss did you come across?',
      'answer': 'Spoiled crops/infested storage',
    },
  ];

  // Post-Harvest Loss Questions
  final List<Map<String, dynamic>> _phlQuestions = [
    {
      'question':
          'What did shopkeepers say about selling these items — is it common or rare?',
      'answer': 'Market stalls',
    },
    {
      'question': 'What did you notice about prices compared to normal?',
      'answer': 'Price boards/items',
    },
    {
      'question':
          'What reasons did beneficiaries give for selling their rations — what stories did you hear?',
      'answer': 'WFP-branded items in market (no faces)',
    },
  ];

  // Market Diversion Monitoring Questions
  final List<Map<String, dynamic>> _mdmQuestions = [
    {
      'question':
          'What reasons did beneficiaries give for selling their rations — what stories did you hear?',
      'answer': 'WFP-branded items in market (no faces)',
    },
  ];

  @override
  void initState() {
    super.initState();
    _initializeControllers();
  }

  void _initializeControllers() {
    // Initialize AM controllers
    for (var q in _amQuestions) {
      final key = q['question'] as String;
      _amControllers[key] = TextEditingController();
      _amPriorities[key] = 'Low';
    }

    // Initialize DM controllers
    for (var q in _dmQuestions) {
      final key = q['question'] as String;
      _dmControllers[key] = TextEditingController();
    }

    // Initialize PDM controllers
    for (var q in _pdmQuestions) {
      final key = q['question'] as String;
      _pdmControllers[key] = TextEditingController();
    }

    // Initialize PHL controllers
    for (var q in _phlQuestions) {
      final key = q['question'] as String;
      _phlControllers[key] = TextEditingController();
    }

    // Initialize MDM controllers
    for (var q in _mdmQuestions) {
      final key = q['question'] as String;
      _mdmControllers[key] = TextEditingController();
    }
  }

  @override
  void dispose() {
    _enumeratorNameController.dispose();
    _enumeratorContactController.dispose();
    _teamLeaderController.dispose();
    _locationHubController.dispose();
    _siteNameIdController.dispose();
    _notesController.dispose();
    _scrollController.dispose();

    for (var c in _amControllers.values) {
      c.dispose();
    }
    for (var c in _dmControllers.values) {
      c.dispose();
    }
    for (var c in _pdmControllers.values) {
      c.dispose();
    }
    for (var c in _phlControllers.values) {
      c.dispose();
    }
    for (var c in _mdmControllers.values) {
      c.dispose();
    }

    super.dispose();
  }

  Future<void> _pickImage(List<String> photoList) async {
    final ImagePicker picker = ImagePicker();
    final XFile? image = await picker.pickImage(source: ImageSource.camera);

    if (image != null) {
      setState(() {
        photoList.add(image.path);
      });
    }
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) {
      AppSnackBar.show(
        context,
        message: 'Please fill in all required fields',
        type: SnackBarType.error,
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      // Create checklist object
      final checklist = ComprehensiveSafetyChecklist(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        createdAt: DateTime.now(),
        userId: 'current-user-id', // Replace with actual user ID
        enumeratorName: _enumeratorNameController.text,
        enumeratorContact: _enumeratorContactController.text,
        teamLeader: _teamLeaderController.text,
        locationHub: _locationHubController.text,
        siteNameId: _siteNameIdController.text,
        visitDate: _visitDate,
        visitTime: _visitTime.format(context),
        activitiesMonitored: _activitiesMonitored.entries
            .where((e) => e.value)
            .map((e) => e.key)
            .toList(),
        activityMonitoring: _amControllers.map((k, v) => MapEntry(k, v.text)),
        activityPriorities: _amPriorities,
        activityPhotos: _amPhotos,
        distributionMonitoring:
            _dmControllers.map((k, v) => MapEntry(k, v.text)),
        distributionPhotos: _dmPhotos,
        postDistributionMonitoring:
            _pdmControllers.map((k, v) => MapEntry(k, v.text)),
        postDistributionPhotos: _pdmPhotos,
        postHarvestLoss: _phlControllers.map((k, v) => MapEntry(k, v.text)),
        postHarvestPhotos: _phlPhotos,
        marketDiversionMonitoring:
            _mdmControllers.map((k, v) => MapEntry(k, v.text)),
        marketDiversionPhotos: _mdmPhotos,
        additionalNotes: _notesController.text,
        lastModified: DateTime.now(),
      );

      // Submit to Supabase
      await ComprehensiveMonitoringService().submitChecklist(checklist);

      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Monitoring form submitted successfully!',
          type: SnackBarType.success,
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Error submitting form: $e',
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      appBar: AppBar(
        title: const Text('Comprehensive Monitoring Form'),
        elevation: 0,
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: AppColors.primaryGradient,
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          controller: _scrollController,
          padding: const EdgeInsets.all(16),
          children: [
            _buildEnumeratorDetailsSection(),
            const SizedBox(height: 20),
            _buildSiteInformationSection(),
            const SizedBox(height: 20),
            _buildActivitiesMonitoredSection(),
            const SizedBox(height: 20),
            if (_activitiesMonitored['AM'] == true) ...[
              _buildActivityMonitoringSection(),
              const SizedBox(height: 20),
            ],
            if (_activitiesMonitored['DM'] == true) ...[
              _buildDistributionMonitoringSection(),
              const SizedBox(height: 20),
            ],
            if (_activitiesMonitored['PDM'] == true) ...[
              _buildPostDistributionMonitoringSection(),
              const SizedBox(height: 20),
            ],
            if (_activitiesMonitored['PHL'] == true) ...[
              _buildPostHarvestLossSection(),
              const SizedBox(height: 20),
            ],
            if (_activitiesMonitored['MDM'] == true) ...[
              _buildMarketDiversionMonitoringSection(),
              const SizedBox(height: 20),
            ],
            _buildNotesSection(),
            const SizedBox(height: 20),
            _buildInfoBox(),
            const SizedBox(height: 20),
            _buildSubmitButton(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildEnumeratorDetailsSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primaryOrange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.person_outline,
                  color: AppColors.primaryOrange,
                ),
              ),
              const SizedBox(width: 12),
              const Text(
                'Enumerator Details',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          TextFormField(
            controller: _enumeratorNameController,
            decoration: InputDecoration(
              labelText: 'Name *',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              prefixIcon: const Icon(Icons.person),
            ),
            validator: (value) => value?.isEmpty == true ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _enumeratorContactController,
            decoration: InputDecoration(
              labelText: 'Contact *',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              prefixIcon: const Icon(Icons.phone),
            ),
            keyboardType: TextInputType.phone,
            validator: (value) => value?.isEmpty == true ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _teamLeaderController,
            decoration: InputDecoration(
              labelText: 'Team Leader *',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              prefixIcon: const Icon(Icons.supervisor_account),
            ),
            validator: (value) => value?.isEmpty == true ? 'Required' : null,
          ),
        ],
      ),
    );
  }

  Widget _buildSiteInformationSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.location_on_outlined,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(width: 12),
              const Text(
                'Site Information',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          TextFormField(
            controller: _locationHubController,
            decoration: InputDecoration(
              labelText: 'Location/Hub *',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              prefixIcon: const Icon(Icons.location_city),
            ),
            validator: (value) => value?.isEmpty == true ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _siteNameIdController,
            decoration: InputDecoration(
              labelText: 'Site Name/ID *',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              prefixIcon: const Icon(Icons.badge),
            ),
            validator: (value) => value?.isEmpty == true ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.calendar_today),
            title: const Text('Date'),
            subtitle: Text(DateFormat('MMM dd, yyyy').format(_visitDate)),
            trailing: const Icon(Icons.edit),
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: _visitDate,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
              );
              if (date != null) {
                setState(() => _visitDate = date);
              }
            },
          ),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.access_time),
            title: const Text('Time'),
            subtitle: Text(_visitTime.format(context)),
            trailing: const Icon(Icons.edit),
            onTap: () async {
              final time = await showTimePicker(
                context: context,
                initialTime: _visitTime,
              );
              if (time != null) {
                setState(() => _visitTime = time);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildActivitiesMonitoredSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Activities Monitored *',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Select all that apply:',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _activitiesMonitored.entries.map((entry) {
              return FilterChip(
                label: Text(entry.key),
                selected: entry.value,
                onSelected: (selected) {
                  setState(() {
                    _activitiesMonitored[entry.key] = selected;
                  });
                },
                selectedColor: AppColors.primaryOrange.withOpacity(0.2),
                checkmarkColor: AppColors.primaryOrange,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityMonitoringSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.orange.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.monitor, color: Colors.orange.shade700),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Activity Monitoring (AM)',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ..._amQuestions.asMap().entries.map((entry) {
            final index = entry.key;
            final q = entry.value;
            final question = q['question'] as String;
            final answer = q['answer'] as String;
            final hasPriority = q['priority'] as bool;

            return Column(
              children: [
                _buildQuestionCard(
                  question: question,
                  answer: answer,
                  controller: _amControllers[question]!,
                  priority: hasPriority ? _amPriorities[question] : null,
                  onPriorityChanged: hasPriority
                      ? (value) {
                          setState(() {
                            _amPriorities[question] = value!;
                          });
                        }
                      : null,
                ),
                if (index < _amQuestions.length - 1) const SizedBox(height: 16),
              ],
            );
          }),
          const SizedBox(height: 20),
          _buildPhotoSection('Activity Monitoring Photos', _amPhotos),
        ],
      ),
    );
  }

  Widget _buildDistributionMonitoringSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.inventory, color: Colors.blue.shade700),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Distribution Monitoring (DM)',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ..._dmQuestions.asMap().entries.map((entry) {
            final index = entry.key;
            final q = entry.value;
            final question = q['question'] as String;
            final answer = q['answer'] as String;

            return Column(
              children: [
                _buildQuestionCard(
                  question: question,
                  answer: answer,
                  controller: _dmControllers[question]!,
                ),
                if (index < _dmQuestions.length - 1) const SizedBox(height: 16),
              ],
            );
          }),
          const SizedBox(height: 20),
          _buildPhotoSection('Distribution Monitoring Photos', _dmPhotos),
        ],
      ),
    );
  }

  Widget _buildPostDistributionMonitoringSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.checklist, color: Colors.green.shade700),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Post-Distribution Monitoring (PDM)',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ..._pdmQuestions.asMap().entries.map((entry) {
            final index = entry.key;
            final q = entry.value;
            final question = q['question'] as String;
            final answer = q['answer'] as String;

            return Column(
              children: [
                _buildQuestionCard(
                  question: question,
                  answer: answer,
                  controller: _pdmControllers[question]!,
                ),
                if (index < _pdmQuestions.length - 1)
                  const SizedBox(height: 16),
              ],
            );
          }),
          const SizedBox(height: 20),
          _buildPhotoSection('Post-Distribution Monitoring Photos', _pdmPhotos),
        ],
      ),
    );
  }

  Widget _buildPostHarvestLossSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.purple.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.agriculture, color: Colors.purple.shade700),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Post-Harvest Loss (PHL)',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ..._phlQuestions.asMap().entries.map((entry) {
            final index = entry.key;
            final q = entry.value;
            final question = q['question'] as String;
            final answer = q['answer'] as String;

            return Column(
              children: [
                _buildQuestionCard(
                  question: question,
                  answer: answer,
                  controller: _phlControllers[question]!,
                ),
                if (index < _phlQuestions.length - 1)
                  const SizedBox(height: 16),
              ],
            );
          }),
          const SizedBox(height: 20),
          _buildPhotoSection('Post-Harvest Loss Photos', _phlPhotos),
        ],
      ),
    );
  }

  Widget _buildMarketDiversionMonitoringSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.store, color: Colors.red.shade700),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Market Diversion Monitoring (MDM)',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ..._mdmQuestions.asMap().entries.map((entry) {
            final index = entry.key;
            final q = entry.value;
            final question = q['question'] as String;
            final answer = q['answer'] as String;

            return Column(
              children: [
                _buildQuestionCard(
                  question: question,
                  answer: answer,
                  controller: _mdmControllers[question]!,
                ),
                if (index < _mdmQuestions.length - 1)
                  const SizedBox(height: 16),
              ],
            );
          }),
          const SizedBox(height: 20),
          _buildPhotoSection('Market Diversion Monitoring Photos', _mdmPhotos),
        ],
      ),
    );
  }

  Widget _buildQuestionCard({
    required String question,
    required String answer,
    required TextEditingController controller,
    String? priority,
    void Function(String?)? onPriorityChanged,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            question,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.lightOrange.withOpacity(0.3),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              'Photo Request: $answer',
              style: TextStyle(
                fontSize: 12,
                color: Colors.orange.shade900,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: controller,
            decoration: InputDecoration(
              hintText: 'Enter your observations...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              filled: true,
              fillColor: Colors.white,
            ),
            maxLines: 3,
          ),
          if (priority != null && onPriorityChanged != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Text(
                  'Priority: ',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                        value: 'Low',
                        label: Text('Low'),
                        icon: Icon(Icons.arrow_downward, size: 16),
                      ),
                      ButtonSegment(
                        value: 'Med',
                        label: Text('Med'),
                        icon: Icon(Icons.drag_handle, size: 16),
                      ),
                      ButtonSegment(
                        value: 'High',
                        label: Text('High'),
                        icon: Icon(Icons.arrow_upward, size: 16),
                      ),
                    ],
                    selected: {priority},
                    onSelectionChanged: (Set<String> selected) {
                      onPriorityChanged(selected.first);
                    },
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPhotoSection(String title, List<String> photoList) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            ElevatedButton.icon(
              onPressed: () => _pickImage(photoList),
              icon: const Icon(Icons.camera_alt, size: 18),
              label: const Text('Add Photo'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryOrange,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (photoList.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300, width: 2),
              borderRadius: BorderRadius.circular(8),
              color: Colors.grey.shade50,
            ),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.photo_library,
                      size: 48, color: Colors.grey.shade400),
                  const SizedBox(height: 8),
                  Text(
                    'No photos added yet',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: photoList.asMap().entries.map((entry) {
              final index = entry.key;
              final path = entry.value;
              return Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      File(path),
                      width: 100,
                      height: 100,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: GestureDetector(
                      onTap: () {
                        setState(() {
                          photoList.removeAt(index);
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Colors.red,
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
              );
            }).toList(),
          ),
      ],
    );
  }

  Widget _buildNotesSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Notes',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Additional observations or comments',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey,
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _notesController,
            decoration: InputDecoration(
              hintText: 'Add any additional notes here...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            maxLines: 5,
          ),
        ],
      ),
    );
  }

  Widget _buildInfoBox() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue.shade700),
              const SizedBox(width: 8),
              Text(
                'Important Notes',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue.shade900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildInfoItem('Records must include Who, What, Where, When.'),
          _buildInfoItem(
              'Avoid vague descriptions; link clearly to issue category.'),
          _buildInfoItem(
              'Highlight impact on beneficiaries (safety, dignity, health).'),
          _buildInfoItem(
              'Use standard categories: Protection/Safety, Threat to Life, SEA, Access/Service.'),
        ],
      ),
    );
  }

  Widget _buildInfoItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 6),
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: Colors.blue.shade700,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: Colors.blue.shade900,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    return Container(
      width: double.infinity,
      height: 56,
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppDesignSystem.shadowMD,
      ),
      child: ElevatedButton(
        onPressed: _isSubmitting ? null : _submitForm,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: _isSubmitting
            ? const SizedBox(
                height: 24,
                width: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Text(
                'Submit Monitoring Form',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
      ),
    );
  }
}
