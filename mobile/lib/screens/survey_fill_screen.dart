import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

class SurveyFillScreen extends StatefulWidget {
  final String surveyId;
  final String surveyTitle;
  const SurveyFillScreen({super.key, required this.surveyId, required this.surveyTitle});

  @override
  State<SurveyFillScreen> createState() => _SurveyFillScreenState();
}

class _SurveyFillScreenState extends State<SurveyFillScreen> {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  bool _isSubmitting = false;
  List<Map<String, dynamic>> _questions = [];
  final Map<String, dynamic> _answers = {};
  final Map<String, TextEditingController> _textControllers = {};

  @override
  void initState() {
    super.initState();
    _loadQuestions();
  }

  @override
  void dispose() {
    for (final c in _textControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadQuestions() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase
          .from('survey_questions')
          .select('*')
          .eq('survey_id', widget.surveyId)
          .order('order_index');
      if (!mounted) return;
      final questions = List<Map<String, dynamic>>.from(data);
      for (final q in questions) {
        final id = q['id'] as String;
        final type = q['question_type'] as String? ?? 'text';
        if (type == 'text' || type == 'long_text' || type == 'number' ||
            type == 'email' || type == 'phone') {
          _textControllers[id] = TextEditingController();
        }
      }
      setState(() {
        _questions = questions;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submit() async {
    // Validate required questions
    final missing = _questions
        .where((q) => q['required'] == true)
        .where((q) {
          final id = q['id'] as String;
          final type = q['question_type'] as String? ?? 'text';
          if (type == 'text' || type == 'long_text' || type == 'number') {
            return _textControllers[id]?.text.trim().isEmpty ?? true;
          }
          return _answers[id] == null;
        })
        .toList();

    if (missing.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please answer all required questions'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      // Merge text controller values into answers
      final finalAnswers = Map<String, dynamic>.from(_answers);
      for (final entry in _textControllers.entries) {
        finalAnswers[entry.key] = entry.value.text.trim();
      }

      await _supabase.from('survey_responses').insert({
        'id': const Uuid().v4(),
        'survey_id': widget.surveyId,
        'submitted_by': user.id,
        'answers': finalAnswers,
        'submitted_at': DateTime.now().toIso8601String(),
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Survey submitted successfully! Thank you.'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Submission failed: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Widget _buildQuestion(Map<String, dynamic> q, int index) {
    final id = q['id'] as String;
    final type = q['question_type'] as String? ?? 'text';
    final label = q['question_text'] as String? ?? 'Question ${index + 1}';
    final required = q['required'] as bool? ?? false;
    final options = q['options'] as List?;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Question label
            RichText(
              text: TextSpan(
                text: '${index + 1}. $label',
                style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: Colors.black87),
                children: [
                  if (required)
                    const TextSpan(
                      text: ' *',
                      style: TextStyle(color: Colors.red),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),

            // Input based on type
            if (type == 'text' || type == 'email' || type == 'phone')
              TextField(
                controller: _textControllers[id],
                keyboardType: type == 'email'
                    ? TextInputType.emailAddress
                    : type == 'phone'
                        ? TextInputType.phone
                        : TextInputType.text,
                decoration: InputDecoration(
                  hintText: 'Enter your answer...',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.all(10),
                ),
              )
            else if (type == 'long_text')
              TextField(
                controller: _textControllers[id],
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: 'Enter your answer...',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.all(10),
                ),
              )
            else if (type == 'number')
              TextField(
                controller: _textControllers[id],
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: '0',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.all(10),
                ),
              )
            else if (type == 'yes_no')
              Row(
                children: [
                  Expanded(
                    child: _choiceButton(id, 'yes', 'Yes',
                        _answers[id] == 'yes', Colors.green),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _choiceButton(id, 'no', 'No',
                        _answers[id] == 'no', Colors.red),
                  ),
                ],
              )
            else if (type == 'select' && options != null)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: List<Widget>.from(
                  options.map((opt) => _choiceChip(
                      id, opt.toString(), opt.toString(),
                      _answers[id] == opt.toString())),
                ),
              )
            else if (type == 'multi_select' && options != null)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: List<Widget>.from(
                  options.map((opt) {
                    final selected = (_answers[id] as List? ?? [])
                        .contains(opt.toString());
                    return FilterChip(
                      label: Text(opt.toString()),
                      selected: selected,
                      onSelected: (_) {
                        setState(() {
                          final list = List<String>.from(
                              _answers[id] as List? ?? []);
                          if (selected) {
                            list.remove(opt.toString());
                          } else {
                            list.add(opt.toString());
                          }
                          _answers[id] = list;
                        });
                      },
                      selectedColor: AppColors.primaryDark.withOpacity(0.2),
                    );
                  }),
                ),
              )
            else if (type == 'rating')
              Row(
                children: List.generate(
                  5,
                  (i) => Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _answers[id] = i + 1),
                      child: Icon(
                        (_answers[id] ?? 0) > i
                            ? Icons.star
                            : Icons.star_border,
                        color: Colors.amber,
                        size: 32,
                      ),
                    ),
                  ),
                ),
              )
            else
              // fallback: text field
              TextField(
                controller: (_textControllers[id] ??= TextEditingController()),
                decoration: InputDecoration(
                  hintText: 'Enter your answer...',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.all(10),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _choiceButton(String qId, String value, String label, bool selected, Color color) =>
      GestureDetector(
        onTap: () => setState(() => _answers[qId] = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.15) : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: selected ? color : Colors.grey.shade300),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(
                    color: selected ? color : Colors.grey.shade700,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.normal)),
          ),
        ),
      );

  Widget _choiceChip(String qId, String value, String label, bool selected) =>
      GestureDetector(
        onTap: () => setState(() => _answers[qId] = value),
        child: Chip(
          label: Text(label,
              style: TextStyle(
                  color: selected ? Colors.white : Colors.grey.shade800,
                  fontSize: 13)),
          backgroundColor: selected ? AppColors.primaryDark : Colors.grey.shade200,
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: widget.surveyTitle,
              showBackButton: true,
            ),
            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.list, listItems: 5)
                  : ListView.builder(
                      padding: const EdgeInsets.all(14),
                      itemCount: _questions.length + 1,
                      itemBuilder: (_, i) {
                        if (i < _questions.length) {
                          return _buildQuestion(_questions[i], i);
                        }
                        // Submit button at bottom
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _isSubmitting ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primaryDark,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                              ),
                              child: _isSubmitting
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white),
                                    )
                                  : const Text('Submit Survey',
                                      style: TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600)),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
