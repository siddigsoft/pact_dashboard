/// Help category model with bilingual support
class HelpCategory {
  final String id;
  final String title;
  final String titleAr;
  final String description;
  final String descriptionAr;
  final String icon;
  final List<HelpArticle> articles;

  HelpCategory({
    required this.id,
    required this.title,
    this.titleAr = '',
    required this.description,
    this.descriptionAr = '',
    this.icon = 'help',
    required this.articles,
  });

  String getTitle(String locale) => locale == 'ar' && titleAr.isNotEmpty ? titleAr : title;
  String getDescription(String locale) => locale == 'ar' && descriptionAr.isNotEmpty ? descriptionAr : description;
}

/// Help article model with bilingual support
class HelpArticle {
  final String id;
  final String title;
  final String titleAr;
  final String content;
  final String contentAr;
  final String? solution;
  final String? solutionAr;
  final DateTime? updatedAt;
  final List<String> tags;

  HelpArticle({
    required this.id,
    required this.title,
    this.titleAr = '',
    required this.content,
    this.contentAr = '',
    this.solution,
    this.solutionAr,
    this.updatedAt,
    this.tags = const [],
  });

  String getTitle(String locale) => locale == 'ar' && titleAr.isNotEmpty ? titleAr : title;
  String getContent(String locale) => locale == 'ar' && contentAr.isNotEmpty ? contentAr : content;
  String? getSolution(String locale) {
    if (locale == 'ar' && solutionAr != null && solutionAr!.isNotEmpty) {
      return solutionAr;
    }
    return solution;
  }
}

/// Error message model with bilingual support
class ErrorMessage {
  final String error;
  final String errorAr;
  final String meaning;
  final String meaningAr;
  final String solution;
  final String solutionAr;

  ErrorMessage({
    required this.error,
    this.errorAr = '',
    required this.meaning,
    this.meaningAr = '',
    required this.solution,
    this.solutionAr = '',
  });

  String getError(String locale) => locale == 'ar' && errorAr.isNotEmpty ? errorAr : error;
  String getMeaning(String locale) => locale == 'ar' && meaningAr.isNotEmpty ? meaningAr : meaning;
  String getSolution(String locale) => locale == 'ar' && solutionAr.isNotEmpty ? solutionAr : solution;
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

/// Support contact model for admin-managed contacts
class SupportContact {
  final String id;
  final String name;
  final String nameAr;
  final String role;
  final String roleAr;
  final String? email;
  final String? phone;
  final String? whatsapp;
  final String? avatarUrl;
  final int sortOrder;
  final bool isActive;

  SupportContact({
    required this.id,
    required this.name,
    this.nameAr = '',
    required this.role,
    this.roleAr = '',
    this.email,
    this.phone,
    this.whatsapp,
    this.avatarUrl,
    this.sortOrder = 0,
    this.isActive = true,
  });

  String getName(String locale) => locale == 'ar' && nameAr.isNotEmpty ? nameAr : name;
  String getRole(String locale) => locale == 'ar' && roleAr.isNotEmpty ? roleAr : role;

  factory SupportContact.fromJson(Map<String, dynamic> json) {
    return SupportContact(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      nameAr: json['name_ar'] as String? ?? '',
      role: json['role'] as String? ?? '',
      roleAr: json['role_ar'] as String? ?? '',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      whatsapp: json['whatsapp'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      sortOrder: json['sort_order'] as int? ?? 0,
      isActive: json['is_active'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'name_ar': nameAr,
      'role': role,
      'role_ar': roleAr,
      'email': email,
      'phone': phone,
      'whatsapp': whatsapp,
      'avatar_url': avatarUrl,
      'sort_order': sortOrder,
      'is_active': isActive,
    };
  }
}

/// FAQ item model
class FAQItem {
  final String id;
  final String question;
  final String questionAr;
  final String answer;
  final String answerAr;
  final String category;
  final int sortOrder;

  FAQItem({
    required this.id,
    required this.question,
    this.questionAr = '',
    required this.answer,
    this.answerAr = '',
    required this.category,
    this.sortOrder = 0,
  });

  String getQuestion(String locale) => locale == 'ar' && questionAr.isNotEmpty ? questionAr : question;
  String getAnswer(String locale) => locale == 'ar' && answerAr.isNotEmpty ? answerAr : answer;

  factory FAQItem.fromJson(Map<String, dynamic> json) {
    return FAQItem(
      id: json['id'] as String,
      question: json['question'] as String? ?? '',
      questionAr: json['question_ar'] as String? ?? '',
      answer: json['answer'] as String? ?? '',
      answerAr: json['answer_ar'] as String? ?? '',
      category: json['category'] as String? ?? 'general',
      sortOrder: json['sort_order'] as int? ?? 0,
    );
  }
}
