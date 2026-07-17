import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';
import 'survey_fill_screen.dart';

class SurveysScreen extends StatefulWidget {
  const SurveysScreen({super.key});
  @override
  State<SurveysScreen> createState() => _SurveysScreenState();
}

class _SurveysScreenState extends State<SurveysScreen> {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _surveys = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase
          .from('surveys')
          .select('id, title, description, status, created_at, expires_at, survey_questions(count)')
          .eq('status', 'active')
          .order('created_at', ascending: false);
      if (!mounted) return;
      setState(() {
        _surveys = List<Map<String, dynamic>>.from(data);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  bool _isExpired(Map<String, dynamic> s) {
    final exp = s['expires_at'] as String?;
    if (exp == null) return false;
    final d = DateTime.tryParse(exp);
    return d != null && d.isBefore(DateTime.now());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Surveys',
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),
            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.list, listItems: 6)
                  : _surveys.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.poll_outlined, size: 64, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Text('No active surveys available',
                                  style: TextStyle(color: Colors.grey.shade600)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: _surveys.length,
                            itemBuilder: (_, i) {
                              final s = _surveys[i];
                              final expired = _isExpired(s);
                              final questionCount = (s['survey_questions'] as List?)?.isNotEmpty == true
                                  ? (s['survey_questions'] as List).first['count'] ?? 0
                                  : 0;
                              return Card(
                                margin: const EdgeInsets.only(bottom: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(
                                    color: expired
                                        ? Colors.red.shade200
                                        : Colors.grey.shade200,
                                  ),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(12),
                                  onTap: expired
                                      ? null
                                      : () {
                                          Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) => SurveyFillScreen(
                                                surveyId: s['id'],
                                                surveyTitle: s['title'] ?? 'Survey',
                                              ),
                                            ),
                                          );
                                        },
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
                                                color: expired
                                                    ? Colors.grey.shade100
                                                    : Colors.blue.shade50,
                                                borderRadius: BorderRadius.circular(8),
                                              ),
                                              child: Icon(
                                                Icons.poll_outlined,
                                                color: expired
                                                    ? Colors.grey
                                                    : Colors.blue.shade600,
                                                size: 22,
                                              ),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    s['title'] ?? 'Survey',
                                                    style: TextStyle(
                                                      fontWeight: FontWeight.bold,
                                                      fontSize: 15,
                                                      color: expired
                                                          ? Colors.grey
                                                          : Colors.black87,
                                                    ),
                                                  ),
                                                  if (expired)
                                                    const Text(
                                                      'Expired',
                                                      style: TextStyle(
                                                          color: Colors.red,
                                                          fontSize: 12,
                                                          fontWeight: FontWeight.w600),
                                                    ),
                                                ],
                                              ),
                                            ),
                                            if (!expired)
                                              const Icon(Icons.chevron_right,
                                                  color: Colors.grey),
                                          ],
                                        ),
                                        if (s['description'] != null) ...[
                                          const SizedBox(height: 10),
                                          Text(
                                            s['description'],
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                                fontSize: 13,
                                                color: Colors.grey.shade600),
                                          ),
                                        ],
                                        const SizedBox(height: 10),
                                        Row(
                                          children: [
                                            Icon(Icons.help_outline,
                                                size: 13, color: Colors.grey.shade500),
                                            const SizedBox(width: 4),
                                            Text(
                                              '$questionCount questions',
                                              style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.grey.shade600),
                                            ),
                                            if (s['expires_at'] != null) ...[
                                              const SizedBox(width: 12),
                                              Icon(Icons.schedule,
                                                  size: 13,
                                                  color: expired
                                                      ? Colors.red
                                                      : Colors.grey.shade500),
                                              const SizedBox(width: 4),
                                              Text(
                                                'Expires: ${(s['expires_at'] as String).split('T').first}',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: expired
                                                      ? Colors.red
                                                      : Colors.grey.shade600,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
