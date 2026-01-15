/// Help category model
class HelpCategory {
  final String id;
  final String title;
  final String description;
  final List<HelpArticle> articles;

  HelpCategory({
    required this.id,
    required this.title,
    required this.description,
    required this.articles,
  });
}

/// Help article model
class HelpArticle {
  final String id;
  final String title;
  final String content;
  final String? solution;
  final DateTime? updatedAt;
  final List<String> tags;

  HelpArticle({
    required this.id,
    required this.title,
    required this.content,
    this.solution,
    this.updatedAt,
    this.tags = const [],
  });
}

/// Error message model
class ErrorMessage {
  final String error;
  final String meaning;
  final String solution;

  ErrorMessage({
    required this.error,
    required this.meaning,
    required this.solution,
  });
}

/// Bug report model
class BugReport {
  final String stepsToReproduce;
  final String? screenshotPath;
  final String? errorMessage;
  final String? deviceInfo;
  final DateTime reportedAt;

  BugReport({
    required this.stepsToReproduce,
    this.screenshotPath,
    this.errorMessage,
    this.deviceInfo,
    required this.reportedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'steps_to_reproduce': stepsToReproduce,
      'screenshot_path': screenshotPath,
      'error_message': errorMessage,
      'device_info': deviceInfo,
      'reported_at': reportedAt.toIso8601String(),
    };
  }
}
