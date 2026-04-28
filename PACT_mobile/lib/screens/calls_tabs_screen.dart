import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import 'calls/call_contacts_screen.dart';
import 'call_history_screen.dart';

class CallsTabsScreen extends StatefulWidget {
  const CallsTabsScreen({super.key});

  @override
  State<CallsTabsScreen> createState() => _CallsTabsScreenState();
}

class _CallsTabsScreenState extends State<CallsTabsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Tabs: Contacts | History
        Container(
          color: AppColors.primaryBlue,
          child: TabBar(
            controller: _tabController,
            indicatorColor: Colors.white,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            labelStyle: GoogleFonts.poppins(
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
            tabs: const [
              Tab(text: 'Contacts'),
              Tab(text: 'History'),
            ],
          ),
        ),
        // Tab content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [CallContactsScreen(), CallHistoryScreen()],
          ),
        ),
      ],
    );
  }
}
