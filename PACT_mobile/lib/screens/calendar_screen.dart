import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import 'site_visit_detail_screen.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  bool _isLoading = true;
  List<Map<String, dynamic>> _siteVisits = [];
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  CalendarFormat _calendarFormat = CalendarFormat.month;
  String _currentLocale = 'en';
  String _viewMode = 'daily';

  @override
  void initState() {
    super.initState();
    _loadSiteVisits();
  }

  Future<void> _loadSiteVisits() async {
    setState(() => _isLoading = true);

    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) {
        if (mounted) {
          setState(() => _isLoading = false);
        }
        return;
      }

      final response = await Supabase.instance.client
          .from('site_visits')
          .select('*')
          .or('assignedTo.eq.$userId,createdBy.eq.$userId')
          .order('dueDate', ascending: true);

      if (mounted) {
        setState(() {
          _siteVisits = List<Map<String, dynamic>>.from(response ?? []);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading site visits: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  List<Map<String, dynamic>> _getVisitsForDay(DateTime day) {
    return _siteVisits.where((visit) {
      final visitDate = DateTime.tryParse(visit['dueDate'] ?? '');
      if (visitDate == null) return false;
      return isSameDay(visitDate, day);
    }).toList();
  }

  List<Map<String, dynamic>> _getVisitsForRange(DateTime start, DateTime end) {
    return _siteVisits.where((visit) {
      final visitDate = DateTime.tryParse(visit['dueDate'] ?? '');
      if (visitDate == null) return false;
      return visitDate.isAfter(start.subtract(const Duration(days: 1))) &&
          visitDate.isBefore(end.add(const Duration(days: 1)));
    }).toList();
  }

  Color _getStatusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'in_progress':
      case 'in progress':
        return Colors.blue;
      case 'pending':
        return Colors.orange;
      case 'overdue':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _getStatusLabel(String? status) {
    final isArabic = _currentLocale == 'ar';
    switch (status?.toLowerCase()) {
      case 'completed':
        return isArabic ? 'مكتمل' : 'Completed';
      case 'in_progress':
      case 'in progress':
        return isArabic ? 'قيد التنفيذ' : 'In Progress';
      case 'pending':
        return isArabic ? 'معلق' : 'Pending';
      case 'overdue':
        return isArabic ? 'متأخر' : 'Overdue';
      default:
        return status ?? '-';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';
    final selectedVisits = _viewMode == 'daily'
        ? _getVisitsForDay(_selectedDay)
        : _getVisitsForRange(
            _selectedDay.subtract(const Duration(days: 7)),
            _selectedDay.add(const Duration(days: 7)),
          );

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        body: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: isArabic ? 'الجدول والتخطيط' : 'Schedule & Planning',
                scaffoldKey: _scaffoldKey,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Colors.white),
                    onPressed: _loadSiteVisits,
                  ),
                  TextButton.icon(
                    onPressed: _toggleLanguage,
                    icon: const Icon(
                      Icons.language,
                      color: Colors.white,
                      size: 20,
                    ),
                    label: Text(
                      isArabic ? 'EN' : 'عربي',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : Column(
                        children: [
                          _buildViewModeToggle(isArabic),
                          _buildCalendarCard(isArabic),
                          Expanded(
                            child: _buildVisitsList(selectedVisits, isArabic),
                          ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildViewModeToggle(bool isArabic) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 10,
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _viewMode = 'daily'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _viewMode == 'daily'
                              ? AppColors.primaryBlue
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.calendar_today,
                              size: 18,
                              color: _viewMode == 'daily'
                                  ? Colors.white
                                  : Colors.grey[600],
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isArabic ? 'يومي' : 'Daily',
                              style: GoogleFonts.poppins(
                                color: _viewMode == 'daily'
                                    ? Colors.white
                                    : Colors.grey[600],
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _viewMode = 'range'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _viewMode == 'range'
                              ? AppColors.primaryBlue
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.date_range,
                              size: 18,
                              color: _viewMode == 'range'
                                  ? Colors.white
                                  : Colors.grey[600],
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isArabic ? 'أسبوعي' : 'Weekly',
                              style: GoogleFonts.poppins(
                                color: _viewMode == 'range'
                                    ? Colors.white
                                    : Colors.grey[600],
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarCard(bool isArabic) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: TableCalendar(
          locale: isArabic ? 'ar' : 'en_US',
          firstDay: DateTime.utc(2020, 1, 1),
          lastDay: DateTime.utc(2030, 12, 31),
          focusedDay: _focusedDay,
          selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
          calendarFormat: _calendarFormat,
          eventLoader: (day) => _getVisitsForDay(day),
          onDaySelected: (selectedDay, focusedDay) {
            setState(() {
              _selectedDay = selectedDay;
              _focusedDay = focusedDay;
            });
          },
          onFormatChanged: (format) {
            setState(() {
              _calendarFormat = format;
            });
          },
          onPageChanged: (focusedDay) {
            _focusedDay = focusedDay;
          },
          calendarStyle: CalendarStyle(
            todayDecoration: BoxDecoration(
              color: AppColors.primaryBlue.withValues(alpha: 0.3),
              shape: BoxShape.circle,
            ),
            selectedDecoration: const BoxDecoration(
              color: AppColors.primaryBlue,
              shape: BoxShape.circle,
            ),
            markerDecoration: const BoxDecoration(
              color: AppColors.primaryGreen,
              shape: BoxShape.circle,
            ),
            markersMaxCount: 3,
            outsideDaysVisible: false,
          ),
          headerStyle: HeaderStyle(
            formatButtonVisible: true,
            titleCentered: true,
            formatButtonDecoration: BoxDecoration(
              border: Border.all(color: AppColors.primaryBlue),
              borderRadius: BorderRadius.circular(12),
            ),
            formatButtonTextStyle: GoogleFonts.poppins(
              color: AppColors.primaryBlue,
              fontSize: 12,
            ),
            titleTextStyle: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          daysOfWeekStyle: DaysOfWeekStyle(
            weekdayStyle: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
            weekendStyle: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.red[300],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildVisitsList(List<Map<String, dynamic>> visits, bool isArabic) {
    return Container(
      margin: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _viewMode == 'daily'
                    ? (isArabic
                          ? 'زيارات ${DateFormat('d MMMM', isArabic ? 'ar' : 'en').format(_selectedDay)}'
                          : 'Visits on ${DateFormat('MMMM d').format(_selectedDay)}')
                    : (isArabic ? 'زيارات الأسبوع' : 'This Week\'s Visits'),
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${visits.length}',
                  style: GoogleFonts.poppins(
                    color: AppColors.primaryBlue,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: visits.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.event_busy,
                          size: 64,
                          color: Colors.grey[300],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          isArabic
                              ? 'لا توجد زيارات مجدولة'
                              : 'No visits scheduled',
                          style: GoogleFonts.poppins(
                            color: Colors.grey[600],
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    itemCount: visits.length,
                    itemBuilder: (context, index) {
                      final visit = visits[index];
                      return _buildVisitCard(visit, isArabic);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildVisitCard(Map<String, dynamic> visit, bool isArabic) {
    final status = visit['status'] ?? 'pending';
    final statusColor = _getStatusColor(status);
    final dueDate = DateTime.tryParse(visit['dueDate'] ?? '');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: statusColor.withValues(alpha: 0.3)),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  SiteVisitDetailScreen(siteVisitId: visit['id']),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 60,
                decoration: BoxDecoration(
                  color: statusColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      visit['siteName'] ?? '-',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.location_on,
                          size: 14,
                          color: Colors.grey[500],
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            '${visit['locality'] ?? ''}, ${visit['state'] ?? ''}',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.access_time,
                          size: 14,
                          color: Colors.grey[500],
                        ),
                        const SizedBox(width: 4),
                        Text(
                          dueDate != null
                              ? DateFormat('MMM d, yyyy').format(dueDate)
                              : '-',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _getStatusLabel(status),
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
