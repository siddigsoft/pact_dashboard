import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class ExchangeRatesScreen extends StatefulWidget {
  const ExchangeRatesScreen({super.key});
  @override
  State<ExchangeRatesScreen> createState() => _ExchangeRatesScreenState();
}

class _ExchangeRatesScreenState extends State<ExchangeRatesScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _rates = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRates();
  }

  Future<void> _loadRates() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase.from('exchange_rates').select('*').order('effective_date', ascending: false);
      if (mounted) setState(() { _rates = List<Map<String, dynamic>>.from(data); _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Exchange Rates', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadRates)],
      ),
      body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : _rates.isEmpty
          ? Center(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.currency_exchange, size: 64, color: Colors.grey),
                const SizedBox(height: 12),
                const Text('No exchange rates configured.', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 8),
                const Text('Exchange rates are managed by the Finance Admin on the web platform.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)),
              ]),
            )
          : RefreshIndicator(
              onRefresh: _loadRates,
              child: ListView.builder(
                padding: const EdgeInsets.all(14),
                itemCount: _rates.length,
                itemBuilder: (_, i) {
                  final r = _rates[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: AppColors.primaryDark.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.currency_exchange, color: AppColors.primaryDark, size: 24),
                        ),
                        const SizedBox(width: 14),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r['from_currency'] ?? 'USD'} → ${r['to_currency'] ?? 'SDG'}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          const SizedBox(height: 2),
                          Text('Rate: ${r['rate']?.toString() ?? 'N/A'}', style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
                          if (r['effective_date'] != null)
                            Text('Effective: ${r['effective_date'].toString().split('T')[0]}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                        ])),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: (r['is_active'] == true) ? Colors.green.withOpacity(0.1) : Colors.grey.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(r['is_active'] == true ? 'Active' : 'Inactive', style: TextStyle(color: r['is_active'] == true ? Colors.green : Colors.grey, fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      ]),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
