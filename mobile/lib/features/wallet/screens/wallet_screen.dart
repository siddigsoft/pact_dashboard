import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});
  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  Map<String, dynamic>? _wallet;
  List<Map<String, dynamic>> _transactions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('wallets').select().eq('user_id', user.id).maybeSingle(),
        client.from('wallet_transactions').select().eq('user_id', user.id).order('created_at', ascending: false).limit(50),
      ]);
      setState(() {
        _wallet = results[0] as Map<String, dynamic>?;
        _transactions = List<Map<String, dynamic>>.from(results[1]);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _requestWithdrawal() async {
    final amtCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    await showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Request Withdrawal'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: amtCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (SDG)', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: reasonCtrl, decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder())),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          Navigator.pop(context);
          try {
            final user = ref.read(currentUserProvider);
            await Supabase.instance.client.from('withdrawal_requests').insert({
              'user_id': user?.id,
              'amount': double.tryParse(amtCtrl.text) ?? 0,
              'currency': 'SDG',
              'reason': reasonCtrl.text.trim(),
              'status': 'pending',
              'created_at': DateTime.now().toIso8601String(),
            });
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal request submitted'), backgroundColor: AppColors.success));
          } catch (e) {
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
          }
        }, child: const Text('Submit')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) {
    final balanceSdg = (_wallet?['balance_sdg'] as num?)?.toDouble() ?? 0;
    final balanceUsd = (_wallet?['balance_usd'] as num?)?.toDouble() ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Wallet'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                const OfflineBanner(),
                // Balance header
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF065F46), Color(0xFF059669)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Available Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 8),
                    Text('SDG ${balanceSdg.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700)),
                    if (balanceUsd > 0) Text('USD ${balanceUsd.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white70, fontSize: 16)),
                    const SizedBox(height: 20),
                    Row(children: [
                      Expanded(child: OutlinedButton.icon(
                        onPressed: _requestWithdrawal,
                        icon: const Icon(Icons.arrow_upward, size: 16, color: Colors.white),
                        label: const Text('Withdraw', style: TextStyle(color: Colors.white)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white54)),
                      )),
                      const SizedBox(width: 12),
                      Expanded(child: OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.receipt_outlined, size: 16, color: Colors.white),
                        label: const Text('Statement', style: TextStyle(color: Colors.white)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white54)),
                      )),
                    ]),
                  ]),
                ),
                // Transactions
                Expanded(
                  child: _transactions.isEmpty
                      ? const Center(child: Text('No transactions yet', style: TextStyle(color: AppColors.textSecondary)))
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _transactions.length,
                          itemBuilder: (_, i) {
                            final t = _transactions[i];
                            final type = t['type'] as String? ?? 'credit';
                            final isCredit = type == 'credit' || type == 'earning' || type == 'payment';
                            final amount = (t['amount'] as num?)?.toStringAsFixed(2) ?? '0';
                            final currency = t['currency'] as String? ?? 'SDG';
                            final desc = t['description'] as String? ?? type;
                            final date = t['created_at'] as String? ?? '';
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: (isCredit ? AppColors.success : AppColors.error).withOpacity(0.1),
                                  child: Icon(isCredit ? Icons.arrow_downward : Icons.arrow_upward, color: isCredit ? AppColors.success : AppColors.error, size: 18),
                                ),
                                title: Text(desc, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                subtitle: Text(_fmt(date), style: const TextStyle(fontSize: 12)),
                                trailing: Text(
                                  '${isCredit ? '+' : '-'}$currency $amount',
                                  style: TextStyle(color: isCredit ? AppColors.success : AppColors.error, fontWeight: FontWeight.w700, fontSize: 14),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }

  String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return iso; }
  }
}
