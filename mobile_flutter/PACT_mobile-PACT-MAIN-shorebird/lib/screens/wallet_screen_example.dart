// Example: Integrating PaymentMethodsCardWidget into Wallet Screen
// This shows how to add payment method management to your wallet/profile screens

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/wallet_models.dart';
import '../providers/wallet_provider.dart';
import '../widgets/payment_methods_card_widget.dart';

/// Example Wallet Screen with Payment Methods Integration
class WalletScreenWithPaymentMethods extends ConsumerWidget {
  const WalletScreenWithPaymentMethods({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final walletAsync = ref.watch(walletProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Wallet'),
        backgroundColor: const Color(0xFF1976D2),
      ),
      body: walletAsync.when(
        data: (wallet) {
          if (wallet == null) {
            return const Center(child: Text('Wallet not found'));
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Balance Card
                _buildBalanceCard(wallet),
                const SizedBox(height: 24),

                // 2. Quick Actions
                _buildQuickActions(context),
                const SizedBox(height: 24),

                // 3. Payment Methods Card Widget
                // This is the key integration point!
                PaymentMethodsCardWidget(),
                const SizedBox(height: 24),

                // 4. Recent Transactions
                _buildRecentTransactions(),
                const SizedBox(height: 24),

                // 5. Withdrawal Requests
                _buildWithdrawalRequests(),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Text('Error: $error'),
        ),
      ),
    );
  }

  /// Build balance display card
  Widget _buildBalanceCard(Wallet wallet) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1976D2).withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Available Balance',
            style: TextStyle(
              color: Colors.white.withOpacity(0.9),
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${wallet.currentBalance.toStringAsFixed(2)} ${wallet.currency}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  /// Build quick action buttons
  Widget _buildQuickActions(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () {
              // Navigate to withdrawal request screen
              Navigator.pushNamed(context, '/withdrawal-request');
            },
            icon: const Icon(Icons.send),
            label: const Text('Withdraw'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF9800),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () {
              // Navigate to transaction history
              Navigator.pushNamed(context, '/transactions');
            },
            icon: const Icon(Icons.history),
            label: const Text('History'),
          ),
        ),
      ],
    );
  }

  /// Build recent transactions section
  Widget _buildRecentTransactions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Recent Transactions',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        // Add transaction list here
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text('No recent transactions'),
        ),
      ],
    );
  }

  /// Build withdrawal requests section
  Widget _buildWithdrawalRequests() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Withdrawal Requests',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        // Add withdrawal requests list here
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text('No pending withdrawals'),
        ),
      ],
    );
  }
}

/// Alternative: Standalone Payment Methods Screen
class PaymentMethodsScreen extends ConsumerWidget {
  const PaymentMethodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Methods'),
        backgroundColor: const Color(0xFF1976D2),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Manage your payment methods for withdrawals',
              style: TextStyle(
                fontSize: 14,
                color: Color(0xFF263238),
              ),
            ),
            const SizedBox(height: 24),

            // Payment Methods Card
            PaymentMethodsCardWidget(),

            const SizedBox(height: 24),

            // Info section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF1976D2).withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Tips for Payment Methods',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1976D2),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '• Ensure account details are correct\n'
                    '• Only one payment method can be default\n'
                    '• Use the same account for withdrawals\n'
                    '• Verify your bank or mobile account',
                    style: TextStyle(
                      fontSize: 13,
                      color: Color(0xFF263238),
                      height: 1.6,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Example Profile Screen with Payment Methods Tab
class ProfileScreenWithPaymentMethods extends ConsumerWidget {
  const ProfileScreenWithPaymentMethods({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Profile'),
          backgroundColor: const Color(0xFF1976D2),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Personal'),
              Tab(text: 'Payment Methods'),
              Tab(text: 'Settings'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            // Personal Info Tab
            const Center(child: Text('Personal Info')),

            // Payment Methods Tab - This is where PaymentMethodsCardWidget goes
            SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: PaymentMethodsCardWidget(),
            ),

            // Settings Tab
            const Center(child: Text('Settings')),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// Usage Instructions
// ============================================================================
//
// To integrate PaymentMethodsCardWidget into your screens:
//
// 1. WALLET SCREEN (Primary location)
//    ✓ Import the widget
//    ✓ Add it to the main wallet display
//    ✓ Place after balance card, before transactions
//    ✓ Users can add payment methods before withdrawal
//
// 2. PROFILE SCREEN (Secondary location)
//    ✓ Add as a dedicated tab or section
//    ✓ Allow users to manage methods anytime
//    ✓ Independent of withdrawal flow
//
// 3. WITHDRAWAL SCREEN (Dependency)
//    ✓ Already integrated in WithdrawalRequestScreen
//    ✓ Shows saved payment methods from provider
//    ✓ Prevents withdrawal if no methods exist
//    ✓ Stores payment_method_id (UUID) in database
//
// Example in existing code:
//
// if (userRole == 'dataCollector') {
//   return Scaffold(
//     body: ListView(
//       children: [
//         BalanceCard(),
//         TransactionList(),
//         PaymentMethodsCardWidget(),  // ← Add here
//         WithdrawalHistory(),
//       ],
//     ),
//   );
// }
//
// ============================================================================
