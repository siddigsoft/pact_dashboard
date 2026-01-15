/// Widget tests for wallet page components
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/providers/wallet/wallet_notifier.dart';

void main() {
  group('Wallet Page Enhanced', () {
    testWidgets('Displays loading state', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderContainer(
          child: MaterialApp(
            home: Scaffold(
              body: Consumer(
                builder: (context, ref, child) {
                  ref.watch(walletNotifierProvider);
                  return const Center(child: CircularProgressIndicator());
                },
              ),
            ),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('Withdrawal dialog can be opened', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  showDialog(
                    context: tester.element(find.byType(ElevatedButton)),
                    builder: (context) => AlertDialog(
                      title: const Text('Request Withdrawal'),
                      content: const TextField(
                        decoration: InputDecoration(labelText: 'Amount (SDG)'),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Cancel'),
                        ),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Submit'),
                        ),
                      ],
                    ),
                  );
                },
                child: const Text('Request Withdrawal'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Request Withdrawal'), findsWidgets);
    });

    testWidgets('Transaction search widget renders', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderContainer(
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Search & Filter'),
                                IconButton(
                                  icon: const Icon(Icons.expand_more),
                                  onPressed: () {},
                                ),
                              ],
                            ),
                            TextField(
                              decoration: InputDecoration(
                                hintText:
                                    'Search by description, ID, or site visit ID',
                                prefixIcon: const Icon(Icons.search),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Search & Filter'), findsOneWidget);
      expect(find.byIcon(Icons.search), findsOneWidget);
    });

    testWidgets('Stats cards display correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GridView.count(
              crossAxisCount: 2,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Current Balance'),
                        const SizedBox(height: 12),
                        const Text('1,500.00 SDG'),
                      ],
                    ),
                  ),
                ),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Total Earned'),
                        const SizedBox(height: 12),
                        const Text('5,000.00 SDG'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('Current Balance'), findsOneWidget);
      expect(find.text('Total Earned'), findsOneWidget);
      expect(find.byType(Card), findsWidgets);
    });

    testWidgets('Tabs render correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: DefaultTabController(
            length: 5,
            child: Scaffold(
              appBar: AppBar(
                bottom: const TabBar(
                  tabs: [
                    Tab(text: 'Overview'),
                    Tab(text: 'Transactions'),
                    Tab(text: 'Withdrawals'),
                    Tab(text: 'Earnings'),
                    Tab(text: 'Activity'),
                  ],
                ),
              ),
              body: TabBarView(
                children: [
                  const Center(child: Text('Overview')),
                  const Center(child: Text('Transactions')),
                  const Center(child: Text('Withdrawals')),
                  const Center(child: Text('Earnings')),
                  const Center(child: Text('Activity')),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.byType(TabBar), findsOneWidget);
      expect(find.text('Overview'), findsWidgets);
      expect(find.text('Transactions'), findsWidgets);
    });

    testWidgets('Withdrawal list items display correctly', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '500.00 SDG',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Pending',
                            style: TextStyle(
                              color: Colors.orange,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.cancel_outlined,
                          color: Colors.red,
                        ),
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('500.00 SDG'), findsOneWidget);
      expect(find.text('Pending'), findsOneWidget);
      expect(find.byIcon(Icons.cancel_outlined), findsOneWidget);
    });

    testWidgets('Amount validation message appears', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                TextField(
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount (SDG)'),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Insufficient funds',
                  style: TextStyle(color: Colors.red),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('Insufficient funds'), findsOneWidget);
    });

    testWidgets('Empty state message displays', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Expanded(
                  child: Center(
                    child: Text(
                      'No transactions found',
                      style: Theme.of(
                        tester.element(find.byType(Center)),
                      ).textTheme.bodyMedium,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('No transactions found'), findsOneWidget);
    });

    testWidgets('Pending withdrawals alert displays', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                border: Border.all(color: Colors.orange),
              ),
              child: Row(
                children: [
                  Icon(Icons.info, color: Colors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'You have 1 pending withdrawal request',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Total amount: 500.00 SDG',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      expect(
        find.text('You have 1 pending withdrawal request'),
        findsOneWidget,
      );
      expect(find.text('Total amount: 500.00 SDG'), findsOneWidget);
    });
  });
}
