// lib/widgets/task_dashboard.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/site_visit.dart';
import '../algorithms/nearest_site_visits.dart';
import '../theme/app_colors.dart';
import '../l10n/app_localizations.dart';

class TaskDashboard extends StatefulWidget {
  final List<SiteVisitWithDistance> availableTasks;
  final Function(SiteVisit) onTaskAccepted;
  final Function(SiteVisit) onTaskDeclined;
  final bool isLoading;

  const TaskDashboard({
    super.key,
    required this.availableTasks,
    required this.onTaskAccepted,
    required this.onTaskDeclined,
    this.isLoading = false,
  });

  @override
  State<TaskDashboard> createState() => _TaskDashboardState();
}

class _TaskDashboardState extends State<TaskDashboard> {
  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (widget.availableTasks.isEmpty) {
      return _buildEmptyState();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildHeader(),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.builder(
            itemCount: widget.availableTasks.length,
            itemBuilder: (context, index) {
              final taskWithDistance = widget.availableTasks[index];
              return _buildTaskCard(taskWithDistance, index);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = MediaQuery.of(context).size.width;
        final availableWidth = constraints.maxWidth;
        
        // Responsive sizing
        final iconSize = screenWidth < 360 ? 24.0 : 28.0;
        final titleFontSize = screenWidth < 360 ? 16.0 : 18.0;
        final subtitleFontSize = screenWidth < 360 ? 12.0 : 14.0;
        final padding = screenWidth < 360 ? 12.0 : 16.0;
        final spacing = screenWidth < 360 ? 8.0 : 12.0;
        
        // For very small screens, use a more compact layout
        if (availableWidth < 300) {
          return Container(
            padding: EdgeInsets.all(padding),
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              borderRadius: BorderRadius.circular(12), // Smaller radius for compact
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.assignment_turned_in,
                      color: Colors.white,
                      size: iconSize,
                    ),
                    SizedBox(width: spacing),
                    Expanded(
                      child: Text(
                        AppLocalizations.of(context)!.availableTasks,
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: titleFontSize,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 4),
                Text(
                  AppLocalizations.of(context)!.tasksInArea(widget.availableTasks.length),
                  style: GoogleFonts.poppins(
                    color: Colors.white.withOpacity(0.9),
                    fontSize: subtitleFontSize,
                  ),
                ),
              ],
            ),
          );
        }
        
        // Normal layout for larger screens
        return Container(
          padding: EdgeInsets.all(padding),
          decoration: BoxDecoration(
            gradient: AppColors.primaryGradient,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Icon(
                Icons.assignment_turned_in,
                color: Colors.white,
                size: iconSize,
              ),
              SizedBox(width: spacing),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Available Tasks',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: titleFontSize,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      AppLocalizations.of(context)!.tasksInArea(widget.availableTasks.length),
                      style: GoogleFonts.poppins(
                        color: Colors.white.withOpacity(0.9),
                        fontSize: subtitleFontSize,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    ).animate().fadeIn(duration: 600.ms).slideY(begin: -0.2, end: 0);
  }

  Widget _buildTaskCard(SiteVisitWithDistance taskWithDistance, int index) {
    final task = taskWithDistance.visit;
    final distanceKm = (taskWithDistance.distanceMeters / 1000).toStringAsFixed(1);
    
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = MediaQuery.of(context).size.width;
        
        // Responsive sizing
        final cardPadding = screenWidth < 360 ? 12.0 : 16.0;
        final titleFontSize = screenWidth < 360 ? 14.0 : 16.0;
        final subtitleFontSize = screenWidth < 360 ? 12.0 : 14.0;
        final spacing = screenWidth < 360 ? 8.0 : 12.0;
        final buttonPadding = screenWidth < 360 ? 8.0 : 12.0;
        final buttonSpacing = screenWidth < 360 ? 8.0 : 12.0;

        return Card(
          margin: EdgeInsets.only(bottom: screenWidth < 360 ? 8 : 12),
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: EdgeInsets.all(cardPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: screenWidth < 360 ? 6 : 8, 
                        vertical: screenWidth < 360 ? 2 : 4
                      ),
                      decoration: BoxDecoration(
                        color: _getPriorityColor(task.priority).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        task.priority.toUpperCase(),
                        style: GoogleFonts.poppins(
                          color: _getPriorityColor(task.priority),
                          fontSize: screenWidth < 360 ? 10 : 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Icon(
                      Icons.location_on,
                      size: screenWidth < 360 ? 14 : 16,
                      color: Colors.grey[600],
                    ),
                    SizedBox(width: screenWidth < 360 ? 2 : 4),
                    Text(
                      '$distanceKm km away',
                      style: GoogleFonts.poppins(
                        color: Colors.grey[600],
                        fontSize: screenWidth < 360 ? 10 : 12,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: spacing),
                Text(
                  task.siteName,
                  style: GoogleFonts.poppins(
                    fontSize: titleFontSize,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: screenWidth < 360 ? 2 : 4),
                Text(
                  task.locationString,
                  style: GoogleFonts.poppins(
                    color: Colors.grey[700],
                    fontSize: subtitleFontSize,
                  ),
                ),
                SizedBox(height: screenWidth < 360 ? 6 : 8),
                Text(
                  task.activity,
                  style: GoogleFonts.poppins(
                    color: AppColors.primaryBlue,
                    fontSize: subtitleFontSize,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (task.dueDate != null) ...[
                  SizedBox(height: screenWidth < 360 ? 6 : 8),
                  Row(
                    children: [
                      Icon(
                        Icons.schedule,
                        size: screenWidth < 360 ? 14 : 16,
                        color: Colors.orange[600],
                      ),
                      SizedBox(width: screenWidth < 360 ? 2 : 4),
                      Text(
                        'Due: ${_formatDate(task.dueDate!)}',
                        style: GoogleFonts.poppins(
                          color: Colors.orange[600],
                          fontSize: screenWidth < 360 ? 10 : 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
                SizedBox(height: screenWidth < 360 ? 12 : 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => widget.onTaskAccepted(task),
                        icon: Icon(Icons.check, size: screenWidth < 360 ? 16 : 18),
                        label: Text(AppLocalizations.of(context)!.accept),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryBlue,
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(vertical: buttonPadding),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(width: buttonSpacing),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => widget.onTaskDeclined(task),
                        icon: Icon(Icons.close, size: screenWidth < 360 ? 16 : 18),
                        label: Text(AppLocalizations.of(context)!.decline),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.grey),
                          padding: EdgeInsets.symmetric(vertical: buttonPadding),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    ).animate().fadeIn(
      duration: 600.ms,
      delay: Duration(milliseconds: index * 100),
    ).slideY(begin: 0.1, end: 0);
  }

  Widget _buildEmptyState() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = MediaQuery.of(context).size.width;
        
        // Responsive sizing for empty state
        final iconSize = screenWidth < 360 ? 48.0 : 64.0;
        final titleFontSize = screenWidth < 360 ? 16.0 : 18.0;
        final subtitleFontSize = screenWidth < 360 ? 12.0 : 14.0;
        final spacing = screenWidth < 360 ? 12.0 : 16.0;

        return Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: screenWidth < 360 ? 16.0 : 24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.assignment_late,
                  size: iconSize,
                  color: Colors.grey[400],
                ),
                SizedBox(height: spacing),
                Text(
                  AppLocalizations.of(context)!.noTasksAvailable,
                  style: GoogleFonts.poppins(
                    fontSize: titleFontSize,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[600],
                  ),
                ),
                SizedBox(height: screenWidth < 360 ? 6.0 : 8.0),
                Text(
                  AppLocalizations.of(context)!.checkBackLater,
                  style: GoogleFonts.poppins(
                    color: Colors.grey[500],
                    fontSize: subtitleFontSize,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        );
      },
    ).animate().fadeIn(duration: 600.ms);
  }

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.green;
      default:
        return Colors.blue;
    }
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = date.difference(now).inDays;

    if (difference == 0) {
      return 'Today';
    } else if (difference == 1) {
      return 'Tomorrow';
    } else if (difference > 0 && difference <= 7) {
      return 'In $difference days';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }
}