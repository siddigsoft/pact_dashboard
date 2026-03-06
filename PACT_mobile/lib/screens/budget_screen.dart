import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';

class BudgetScreen extends StatefulWidget {
  const BudgetScreen({super.key});
  @override
  State<BudgetScreen> createState() => _BudgetScreenState();
}

class _BudgetScreenState extends State<BudgetScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _budgets = [];
  bool _isLoading = true;
  bool _isOffline = false;
  String? _selectedProject;
  List<Map<String, dynamic>> _projects = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final projectsData = await _supabase.from('projects').select('id, name').order('name');
      final budgetData = await _supabase.from('project_budgets').select('*, projects(name)').order('created_at', ascending: false);
      final box = await Hive.openBox('offline_cache');
      await box.put('budget_projects', projectsData);
      await box.put('budget_data', budgetData);
      if (!mounted) return;
      setState(() {
        _projects = List<Map<String, dynamic>>.from(projectsData);
        _budgets = List<Map<String, dynamic>>.from(budgetData);
        _isLoading = false;
        _isOffline = false;
      });
    } catch (e) {
      if (!mounted) return;
      try {
        final box = await Hive.openBox('offline_cache');
        final cachedProjects = box.get('budget_projects');
        final cachedBudgets = box.get('budget_data');
        if (cachedBudgets != null) {
          setState(() {
            _projects = cachedProjects != null
                ? List<Map<String, dynamic>>.from((cachedProjects as List).map((e) => Map<String, dynamic>.from(e)))
                : [];
            _budgets = List<Map<String, dynamic>>.from((cachedBudgets as List).map((e) => Map<String, dynamic>.from(e)));
            _isLoading = false;
            _isOffline = true;
          });
          return;
        }
      } catch (_) {}
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_selectedProject == null) return _budgets;
    return _budgets.where((b) => b['project_id'] == _selectedProject).toList();
  }

  double _getTotal(String field) {
    return _filtered.fold(0.0, (sum, b) => sum + ((b[field] ?? 0) as num).toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final totalBudget = _getTotal('total_budget');
    final totalSpent = _getTotal('spent_amount');
    final pct = totalBudget > 0 ? (totalSpent / totalBudget).clamp(0.0, 1.0) : 0.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Budget', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadData)],
      ),
      body: _isLoading
          ? const ShimmerBody(layout: ShimmerLayout.budget, hasStats: true, listItems: 5)
          : Column(
              children: [
                if (_isOffline) const OfflineBanner(),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadData,
                    child: ListView(
                      padding: const EdgeInsets.all(14),
                      children: [
                        if (_projects.isNotEmpty) ...[
                          DropdownButtonFormField<String>(
                            value: _selectedProject,
                            decoration: InputDecoration(
                              labelText: 'Filter by Project',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            ),
                            items: [
                              const DropdownMenuItem(value: null, child: Text('All Projects')),
                              ..._projects.map((p) => DropdownMenuItem(value: p['id']?.toString(), child: Text(p['name'] ?? 'Unnamed'))),
                            ],
                            onChanged: (v) => setState(() => _selectedProject = v),
                          ),
                          const SizedBox(height: 14),
                        ],
                        Card(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          color: AppColors.primaryDark,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              const Text('Budget Overview', style: TextStyle(color: Colors.white70, fontSize: 13)),
                              const SizedBox(height: 8),
                              Row(children: [
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  const Text('Total Budget', style: TextStyle(color: Colors.white60, fontSize: 12)),
                                  Text('\$${totalBudget.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                                ])),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  const Text('Spent', style: TextStyle(color: Colors.white60, fontSize: 12)),
                                  Text('\$${totalSpent.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                                ])),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  const Text('Remaining', style: TextStyle(color: Colors.white60, fontSize: 12)),
                                  Text('\$${(totalBudget - totalSpent).toStringAsFixed(0)}', style: TextStyle(color: pct > 0.9 ? Colors.red.shade300 : Colors.greenAccent, fontSize: 22, fontWeight: FontWeight.bold)),
                                ])),
                              ]),
                              const SizedBox(height: 12),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: pct,
                                  backgroundColor: Colors.white24,
                                  valueColor: AlwaysStoppedAnimation<Color>(pct > 0.9 ? Colors.red : pct > 0.7 ? Colors.orange : Colors.greenAccent),
                                  minHeight: 8,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text('${(pct * 100).toStringAsFixed(1)}% utilised', style: const TextStyle(color: Colors.white60, fontSize: 12)),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 14),
                        if (_filtered.isEmpty)
                          const Center(child: Padding(padding: EdgeInsets.all(32), child: Column(children: [Icon(Icons.account_balance, size: 48, color: Colors.grey), SizedBox(height: 8), Text('No budget records found.', style: TextStyle(color: Colors.grey))])))
                        else
                          ..._filtered.map((b) {
                            final budget = (b['total_budget'] ?? 0) as num;
                            final spent = (b['spent_amount'] ?? 0) as num;
                            final p = budget > 0 ? (spent / budget).clamp(0.0, 1.0) : 0.0;
                            final proj = b['projects'];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(b['category'] ?? (proj != null ? proj['name'] : 'Budget Line'), style: const TextStyle(fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  Row(children: [
                                    Expanded(child: Text('Budget: \$${budget.toStringAsFixed(0)}', style: const TextStyle(fontSize: 13))),
                                    Expanded(child: Text('Spent: \$${spent.toStringAsFixed(0)}', style: const TextStyle(fontSize: 13))),
                                  ]),
                                  const SizedBox(height: 8),
                                  LinearProgressIndicator(value: p, backgroundColor: Colors.grey.shade200, valueColor: AlwaysStoppedAnimation<Color>(p > 0.9 ? Colors.red : p > 0.7 ? Colors.orange : Colors.green), minHeight: 6),
                                  const SizedBox(height: 4),
                                  Text('${(p * 100).toStringAsFixed(1)}% used', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                                ]),
                              ),
                            );
                          }).toList(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
