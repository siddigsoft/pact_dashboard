// lib/screens/components/visit_assignment_sheet.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/site_visit.dart';
import '../../theme/app_colors.dart';

class VisitAssignmentSheet extends StatefulWidget {
  final List<SiteVisit> availableVisits;
  final Function(SiteVisit) onVisitAssigned;

  const VisitAssignmentSheet({
    super.key,
    required this.availableVisits,
    required this.onVisitAssigned,
  });

  @override
  State<VisitAssignmentSheet> createState() => _VisitAssignmentSheetState();
}

class _VisitAssignmentSheetState extends State<VisitAssignmentSheet> {
  String _searchQuery = '';
  List<SiteVisit> _filteredVisits = [];

  @override
  void initState() {
    super.initState();
    _filteredVisits = widget.availableVisits;
  }

  void _filterVisits(String query) {
    setState(() {
      _searchQuery = query;
      if (query.isEmpty) {
        _filteredVisits = widget.availableVisits;
      } else {
        _filteredVisits = widget.availableVisits
            .where(
              (visit) =>
                  visit.siteName.toLowerCase().contains(query.toLowerCase()) ||
                  visit.locationString.toLowerCase().contains(
                    query.toLowerCase(),
                  ),
            )
            .toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
        minHeight: MediaQuery.of(context).size.height * 0.3,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle and header
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
            child: Text(
              'Available Visits',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppColors.textDark,
              ),
            ),
          ),

          // Search box
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              onChanged: _filterVisits,
              decoration: InputDecoration(
                hintText: 'Search by title or address',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Colors.grey.shade100,
              ),
            ),
          ),

          // Visit list
          Expanded(
            child: _filteredVisits.isEmpty
                ? Center(
                    child: Text(
                      _searchQuery.isEmpty
                          ? 'No available visits'
                          : 'No visits matching "$_searchQuery"',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 16,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: _filteredVisits.length,
                    itemBuilder: (context, index) {
                      final visit = _filteredVisits[index];
                      return _buildVisitCard(visit);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildVisitCard(SiteVisit visit) {
    return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          // Made non-clickable (offline-friendly viewing only)
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        visit.siteName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'Priority: ${visit.priority ?? 'Normal'}',
                        style: TextStyle(
                          color: Colors.blue.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  visit.locationString,
                  style: const TextStyle(fontSize: 16, color: Colors.black87),
                ),
                const SizedBox(height: 12),
                Text(
                  'Due: ${visit.dueDate?.toLocal().toString().split('.')[0] ?? 'Flexible'}',
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(
                      Icons.location_on,
                      size: 16,
                      color: Colors.red.shade400,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${_calculateDistance(visit)} km away',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.black87,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'View Only',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.black54,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        )
        .animate()
        .fadeIn(duration: 300.ms, delay: 50.ms)
        .slideY(
          begin: 0.2,
          end: 0,
          duration: 300.ms,
          curve: Curves.easeOutQuad,
        );
  }

  // Dummy method to calculate distance - in a real app, this would use actual coordinates
  String _calculateDistance(SiteVisit visit) {
    if (visit.latitude == null || visit.longitude == null) {
      return 'Unknown';
    }

    // Placeholder for real distance calculation
    return (5 + visit.id.hashCode % 15).toStringAsFixed(1);
  }
}
