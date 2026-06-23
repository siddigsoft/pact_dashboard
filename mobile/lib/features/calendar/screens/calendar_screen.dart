import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});
  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  DateTime _focusedMonth = DateTime.now();
  DateTime? _selected;
  List<Map<String, dynamic>> _events = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _selected = DateTime.now(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final start = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
      final end = DateTime(_focusedMonth.year, _focusedMonth.month + 1, 0);
      final data = await Supabase.instance.client
          .from('site_visits')
          .select('id, site_name, due_date, status')
          .eq('assigned_to', user.id)
          .gte('due_date', start.toIso8601String())
          .lte('due_date', end.toIso8601String())
          .order('due_date');
      setState(() { _events = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  List<Map<String, dynamic>> _eventsForDay(DateTime day) {
    return _events.where((e) {
      final d = DateTime.tryParse(e['due_date'] as String? ?? '');
      return d != null && d.year == day.year && d.month == day.month && d.day == day.day;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Calendar'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          _buildMonthHeader(),
          _buildWeekDayLabels(),
          _buildCalendarGrid(),
          const Divider(height: 1),
          Expanded(child: _buildEventList()),
        ],
      ),
    );
  }

  Widget _buildMonthHeader() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Row(children: [
      IconButton(
        icon: const Icon(Icons.chevron_left),
        onPressed: () { setState(() { _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month - 1); _load(); }); },
      ),
      Expanded(child: Text(
        DateFormat('MMMM yyyy').format(_focusedMonth),
        textAlign: TextAlign.center,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
      )),
      IconButton(
        icon: const Icon(Icons.chevron_right),
        onPressed: () { setState(() { _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month + 1); _load(); }); },
      ),
    ]),
  );

  Widget _buildWeekDayLabels() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 8),
    child: Row(
      children: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => Expanded(
        child: Center(child: Text(d, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600))),
      )).toList(),
    ),
  );

  Widget _buildCalendarGrid() {
    final first = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final daysInMonth = DateTime(_focusedMonth.year, _focusedMonth.month + 1, 0).day;
    final startOffset = first.weekday % 7;
    final cells = List<DateTime?>.filled(startOffset, null) + List.generate(daysInMonth, (i) => DateTime(_focusedMonth.year, _focusedMonth.month, i + 1));
    while (cells.length % 7 != 0) cells.add(null);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4, childAspectRatio: 1),
      itemCount: cells.length,
      itemBuilder: (_, i) {
        final day = cells[i];
        if (day == null) return const SizedBox();
        final hasEvents = _eventsForDay(day).isNotEmpty;
        final isSelected = _selected != null && _selected!.year == day.year && _selected!.month == day.month && _selected!.day == day.day;
        final isToday = DateTime.now().year == day.year && DateTime.now().month == day.month && DateTime.now().day == day.day;
        return GestureDetector(
          onTap: () => setState(() => _selected = day),
          child: Container(
            decoration: BoxDecoration(
              color: isSelected ? AppColors.primary : isToday ? AppColors.primary.withOpacity(0.1) : null,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('${day.day}', style: TextStyle(
                fontWeight: isSelected || isToday ? FontWeight.w700 : FontWeight.w400,
                color: isSelected ? Colors.white : isToday ? AppColors.primary : null,
                fontSize: 13,
              )),
              if (hasEvents) Container(width: 4, height: 4, decoration: BoxDecoration(
                color: isSelected ? Colors.white : AppColors.primary,
                shape: BoxShape.circle,
              )),
            ]),
          ),
        );
      },
    );
  }

  Widget _buildEventList() {
    final dayEvents = _selected != null ? _eventsForDay(_selected!) : <Map<String, dynamic>>[];
    final formattedDate = _selected != null ? DateFormat('EEEE, MMMM d').format(_selected!) : 'Select a date';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text(formattedDate, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: AppColors.textSecondary)),
        ),
        if (dayEvents.isEmpty)
          const Padding(padding: EdgeInsets.all(16), child: Text('No visits scheduled', style: TextStyle(color: AppColors.textDisabled)))
        else
          Expanded(child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: dayEvents.length,
            itemBuilder: (_, i) {
              final e = dayEvents[i];
              final status = e['status'] as String? ?? 'pending';
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(Icons.location_on_outlined, color: AppColors.primary),
                  title: Text(e['site_name'] as String? ?? 'Site Visit', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: status == 'completed' ? AppColors.success.withOpacity(0.1) : AppColors.warning.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(status, style: TextStyle(
                      color: status == 'completed' ? AppColors.success : AppColors.warning,
                      fontSize: 11, fontWeight: FontWeight.w600,
                    )),
                  ),
                ),
              );
            },
          )),
      ],
    );
  }
}
