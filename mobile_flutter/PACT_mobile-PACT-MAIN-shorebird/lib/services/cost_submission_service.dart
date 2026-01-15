import 'package:intl/intl.dart';
import '../models/cost_submission_models.dart';

class CostSubmissionService {
  /// Format currency from cents to display string
  /// Example: 5000 cents = "50.00 SDG"
  String formatCurrency(int cents, {String currency = 'SDG'}) {
    final amount = cents / 100.0;
    final formatter = NumberFormat('#,##0.00', 'en_US');
    return '${formatter.format(amount)} $currency';
  }

  /// Format currency with symbol
  String formatCurrencyWithSymbol(int cents, {String currency = 'SDG'}) {
    final amount = cents / 100.0;
    final formatter = NumberFormat('#,##0.00', 'en_US');
    
    // Add currency symbols
    switch (currency) {
      case 'SDG':
        return 'SDG ${formatter.format(amount)}';
      case 'USD':
        return '\$${formatter.format(amount)}';
      case 'EUR':
        return '€${formatter.format(amount)}';
      default:
        return '${formatter.format(amount)} $currency';
    }
  }

  /// Parse currency string to cents
  /// Example: "50.00" = 5000 cents
  int parseCurrencyToCents(String amount) {
    try {
      final cleanAmount = amount.replaceAll(',', '').trim();
      final double value = double.parse(cleanAmount);
      return (value * 100).round();
    } catch (e) {
      return 0;
    }
  }

  /// Calculate total cost from all categories
  int calculateTotalCost({
    required int transportationCents,
    required int accommodationCents,
    required int mealCents,
    required int otherCents,
  }) {
    return transportationCents + accommodationCents + mealCents + otherCents;
  }

  /// Validate cost submission data
  CostSubmissionValidationResult validateCostSubmission({
    required int transportationCents,
    required int accommodationCents,
    required int mealCents,
    required int otherCents,
    String? siteVisitId,
    List<SupportingDocument>? documents,
  }) {
    final warnings = <String>[];

    // Check if site visit is selected
    if (siteVisitId == null || siteVisitId.isEmpty) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Please select a site visit',
      );
    }

    // Check if all costs are non-negative
    if (transportationCents < 0) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Transportation cost cannot be negative',
      );
    }
    if (accommodationCents < 0) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Accommodation cost cannot be negative',
      );
    }
    if (mealCents < 0) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Meal allowance cannot be negative',
      );
    }
    if (otherCents < 0) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Other costs cannot be negative',
      );
    }

    // Check if all costs are zero
    final totalCents = calculateTotalCost(
      transportationCents: transportationCents,
      accommodationCents: accommodationCents,
      mealCents: mealCents,
      otherCents: otherCents,
    );

    if (totalCents == 0) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Total cost cannot be zero. Please enter at least one cost.',
      );
    }

    // Warnings for missing documents
    if (documents == null || documents.isEmpty) {
      warnings.add('No supporting documents attached. Consider adding receipts.');
    }

    // Warning for high costs without documents
    if (totalCents > 1000000 && (documents == null || documents.isEmpty)) {
      warnings.add('High cost amount detected. Please attach supporting documents.');
    }

    return CostSubmissionValidationResult(
      isValid: true,
      warnings: warnings,
    );
  }

  /// Validate file for document upload
  CostSubmissionValidationResult validateDocument({
    required String filename,
    required int fileSizeBytes,
    int maxFileSizeMB = 5,
  }) {
    // Check file size
    final maxSizeBytes = maxFileSizeMB * 1024 * 1024;
    if (fileSizeBytes > maxSizeBytes) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'File size exceeds maximum of ${maxFileSizeMB}MB',
      );
    }

    // Check file extension
    final allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    final extension = filename.split('.').last.toLowerCase();
    if (!allowedExtensions.contains(extension)) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Invalid file type. Allowed: PDF, JPG, PNG',
      );
    }

    return CostSubmissionValidationResult(isValid: true);
  }

  /// Validate maximum number of documents
  CostSubmissionValidationResult validateDocumentCount(
    int currentCount, {
    int maxDocuments = 10,
  }) {
    if (currentCount >= maxDocuments) {
      return CostSubmissionValidationResult(
        isValid: false,
        error: 'Maximum $maxDocuments documents allowed',
      );
    }
    return CostSubmissionValidationResult(isValid: true);
  }

  /// Get cost breakdown as map
  Map<String, int> getCostBreakdown(CostSubmission submission) {
    return {
      'Transportation': submission.transportationCostCents,
      'Accommodation': submission.accommodationCostCents,
      'Meals': submission.mealAllowanceCents,
      'Other': submission.otherCostsCents,
    };
  }

  /// Get cost breakdown with formatted values
  Map<String, String> getFormattedCostBreakdown(
    CostSubmission submission,
  ) {
    return {
      'Transportation': formatCurrency(
        submission.transportationCostCents,
        currency: submission.currency,
      ),
      'Accommodation': formatCurrency(
        submission.accommodationCostCents,
        currency: submission.currency,
      ),
      'Meals': formatCurrency(
        submission.mealAllowanceCents,
        currency: submission.currency,
      ),
      'Other': formatCurrency(
        submission.otherCostsCents,
        currency: submission.currency,
      ),
    };
  }

  /// Get percentage breakdown
  Map<String, double> getCostPercentages(CostSubmission submission) {
    if (submission.totalCostCents == 0) {
      return {
        'Transportation': 0,
        'Accommodation': 0,
        'Meals': 0,
        'Other': 0,
      };
    }

    final total = submission.totalCostCents.toDouble();
    return {
      'Transportation': (submission.transportationCostCents / total) * 100,
      'Accommodation': (submission.accommodationCostCents / total) * 100,
      'Meals': (submission.mealAllowanceCents / total) * 100,
      'Other': (submission.otherCostsCents / total) * 100,
    };
  }

  /// Format date for display
  String formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy').format(date);
  }

  /// Format date with time
  String formatDateTime(DateTime date) {
    return DateFormat('MMM dd, yyyy • hh:mm a').format(date);
  }

  /// Get relative time (e.g., "2 days ago")
  String getRelativeTime(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays > 365) {
      final years = (difference.inDays / 365).floor();
      return '$years ${years == 1 ? 'year' : 'years'} ago';
    } else if (difference.inDays > 30) {
      final months = (difference.inDays / 30).floor();
      return '$months ${months == 1 ? 'month' : 'months'} ago';
    } else if (difference.inDays > 0) {
      return '${difference.inDays} ${difference.inDays == 1 ? 'day' : 'days'} ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} ${difference.inHours == 1 ? 'hour' : 'hours'} ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} ${difference.inMinutes == 1 ? 'minute' : 'minutes'} ago';
    } else {
      return 'Just now';
    }
  }

  /// Get status color
  String getStatusColorHex(CostSubmissionStatus status) {
    switch (status) {
      case CostSubmissionStatus.pending:
      case CostSubmissionStatus.underReview:
        return '#FFA726'; // Orange
      case CostSubmissionStatus.approved:
        return '#42A5F5'; // Blue
      case CostSubmissionStatus.paid:
        return '#66BB6A'; // Green
      case CostSubmissionStatus.rejected:
        return '#EF5350'; // Red
      case CostSubmissionStatus.cancelled:
        return '#BDBDBD'; // Gray
    }
  }

  /// Filter submissions by status
  List<CostSubmission> filterByStatus(
    List<CostSubmission> submissions,
    CostSubmissionStatus? status,
  ) {
    if (status == null) return submissions;
    return submissions.where((s) => s.status == status).toList();
  }

  /// Filter submissions by date range
  List<CostSubmission> filterByDateRange(
    List<CostSubmission> submissions,
    DateTime? startDate,
    DateTime? endDate,
  ) {
    if (startDate == null && endDate == null) return submissions;

    return submissions.where((s) {
      if (startDate != null && s.submittedAt.isBefore(startDate)) {
        return false;
      }
      if (endDate != null && s.submittedAt.isAfter(endDate)) {
        return false;
      }
      return true;
    }).toList();
  }

  /// Sort submissions by date
  List<CostSubmission> sortByDate(
    List<CostSubmission> submissions, {
    bool ascending = false,
  }) {
    final sorted = List<CostSubmission>.from(submissions);
    sorted.sort((a, b) {
      final comparison = a.submittedAt.compareTo(b.submittedAt);
      return ascending ? comparison : -comparison;
    });
    return sorted;
  }

  /// Sort submissions by amount
  List<CostSubmission> sortByAmount(
    List<CostSubmission> submissions, {
    bool ascending = false,
  }) {
    final sorted = List<CostSubmission>.from(submissions);
    sorted.sort((a, b) {
      final comparison = a.totalCostCents.compareTo(b.totalCostCents);
      return ascending ? comparison : -comparison;
    });
    return sorted;
  }

  /// Get summary text for submission
  String getSummaryText(CostSubmission submission) {
    final parts = <String>[];
    
    if (submission.transportationCostCents > 0) {
      parts.add('Transport: ${formatCurrency(submission.transportationCostCents)}');
    }
    if (submission.accommodationCostCents > 0) {
      parts.add('Accommodation: ${formatCurrency(submission.accommodationCostCents)}');
    }
    if (submission.mealAllowanceCents > 0) {
      parts.add('Meals: ${formatCurrency(submission.mealAllowanceCents)}');
    }
    if (submission.otherCostsCents > 0) {
      parts.add('Other: ${formatCurrency(submission.otherCostsCents)}');
    }

    return parts.isEmpty ? 'No costs' : parts.join(' • ');
  }
}
