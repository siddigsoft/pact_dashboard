import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class AutoReleaseSettings {
  final int confirmationHoursBeforeVisit;
  final int releaseHoursBeforeVisit;
  final bool autoReleaseEnabled;

  const AutoReleaseSettings({
    this.confirmationHoursBeforeVisit = 24,
    this.releaseHoursBeforeVisit = 12,
    this.autoReleaseEnabled = true,
  });

  factory AutoReleaseSettings.fromJson(Map<String, dynamic> json) {
    return AutoReleaseSettings(
      confirmationHoursBeforeVisit:
          json['confirmationHoursBeforeVisit'] as int? ?? 24,
      releaseHoursBeforeVisit: json['releaseHoursBeforeVisit'] as int? ?? 12,
      autoReleaseEnabled: json['autoReleaseEnabled'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
    'confirmationHoursBeforeVisit': confirmationHoursBeforeVisit,
    'releaseHoursBeforeVisit': releaseHoursBeforeVisit,
    'autoReleaseEnabled': autoReleaseEnabled,
  };
}

class ConfirmationDeadlines {
  final String confirmationDeadline;
  final String autoreleaseAt;
  final String confirmationStatus;

  ConfirmationDeadlines({
    required this.confirmationDeadline,
    required this.autoreleaseAt,
    this.confirmationStatus = 'pending',
  });

  Map<String, dynamic> toJson() => {
    'confirmation_deadline': confirmationDeadline,
    'autorelease_at': autoreleaseAt,
    'confirmation_status': confirmationStatus,
  };
}

class DateRangeDeadlines extends ConfirmationDeadlines {
  final String visitDateFrom;
  final String visitDateTo;
  final String effectiveVisitDate;

  DateRangeDeadlines({
    required super.confirmationDeadline,
    required super.autoreleaseAt,
    super.confirmationStatus,
    required this.visitDateFrom,
    required this.visitDateTo,
    required this.effectiveVisitDate,
  });

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'visitDateFrom': visitDateFrom,
    'visitDateTo': visitDateTo,
    'effectiveVisitDate': effectiveVisitDate,
  };
}

class ReminderTimes {
  final DateTime twoDaysBefore;
  final DateTime oneDayBefore;
  final DateTime twelveHoursBefore;

  ReminderTimes({
    required this.twoDaysBefore,
    required this.oneDayBefore,
    required this.twelveHoursBefore,
  });
}

class ConfirmationDeadlineUtils {
  static const String _settingsKey = 'autoReleaseSettings';
  static const AutoReleaseSettings defaultSettings = AutoReleaseSettings();

  static Future<AutoReleaseSettings> getAutoReleaseSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_settingsKey);
      if (stored != null) {
        final json = jsonDecode(stored) as Map<String, dynamic>;
        return AutoReleaseSettings.fromJson(json);
      }
    } catch (e) {
      print('Failed to parse auto-release settings: $e');
    }
    return defaultSettings;
  }

  static Future<void> saveAutoReleaseSettings(
    AutoReleaseSettings settings,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_settingsKey, jsonEncode(settings.toJson()));
    } catch (e) {
      print('Failed to save auto-release settings: $e');
    }
  }

  static ConfirmationDeadlines calculateConfirmationDeadlines(
    DateTime visitDate, {
    AutoReleaseSettings? settings,
  }) {
    final config = settings ?? defaultSettings;

    final confirmationDeadline = visitDate.subtract(
      Duration(hours: config.confirmationHoursBeforeVisit),
    );

    final autoreleaseAt = visitDate.subtract(
      Duration(hours: config.releaseHoursBeforeVisit),
    );

    return ConfirmationDeadlines(
      confirmationDeadline: confirmationDeadline.toIso8601String(),
      autoreleaseAt: autoreleaseAt.toIso8601String(),
      confirmationStatus: 'pending',
    );
  }

  static Future<ConfirmationDeadlines> calculateConfirmationDeadlinesAsync(
    DateTime visitDate,
  ) async {
    final settings = await getAutoReleaseSettings();
    return calculateConfirmationDeadlines(visitDate, settings: settings);
  }

  static DateRangeDeadlines calculateDateRangeDeadlines(
    DateTime dateFrom,
    DateTime dateTo, {
    AutoReleaseSettings? settings,
  }) {
    final config = settings ?? defaultSettings;
    final baseDeadlines = calculateConfirmationDeadlines(
      dateFrom,
      settings: config,
    );

    return DateRangeDeadlines(
      confirmationDeadline: baseDeadlines.confirmationDeadline,
      autoreleaseAt: baseDeadlines.autoreleaseAt,
      confirmationStatus: baseDeadlines.confirmationStatus,
      visitDateFrom: dateFrom.toIso8601String(),
      visitDateTo: dateTo.toIso8601String(),
      effectiveVisitDate: dateFrom.toIso8601String(),
    );
  }

  static ReminderTimes getReminderTimes(DateTime confirmationDeadline) {
    return ReminderTimes(
      twoDaysBefore: confirmationDeadline.subtract(const Duration(days: 2)),
      oneDayBefore: confirmationDeadline.subtract(const Duration(days: 1)),
      twelveHoursBefore: confirmationDeadline.subtract(
        const Duration(hours: 12),
      ),
    );
  }

  static bool isConfirmationOverdue(DateTime confirmationDeadline) {
    return DateTime.now().isAfter(confirmationDeadline);
  }

  static bool shouldAutoRelease(DateTime autoreleaseAt) {
    return DateTime.now().isAfter(autoreleaseAt);
  }

  static String getConfirmationStatusLabel(String status) {
    switch (status) {
      case 'confirmed':
        return 'Confirmed';
      case 'auto_released':
        return 'Auto-Released';
      case 'pending':
      default:
        return 'Pending Confirmation';
    }
  }

  static Duration getTimeUntilDeadline(DateTime deadline) {
    return deadline.difference(DateTime.now());
  }

  static String formatTimeRemaining(Duration duration) {
    if (duration.isNegative) {
      return 'Overdue';
    }

    if (duration.inDays > 0) {
      return '${duration.inDays}d ${duration.inHours % 24}h remaining';
    } else if (duration.inHours > 0) {
      return '${duration.inHours}h ${duration.inMinutes % 60}m remaining';
    } else {
      return '${duration.inMinutes}m remaining';
    }
  }
}

const AutoReleaseSettings defaultAutoReleaseSettings = AutoReleaseSettings();
