class TaskOutputFile {
  final String name;
  final String url;
  final String? mimeType;

  const TaskOutputFile({
    required this.name,
    required this.url,
    this.mimeType,
  });

  factory TaskOutputFile.fromJson(Map<String, dynamic> json) {
    return TaskOutputFile(
      name: json['name']?.toString() ?? 'file',
      url: json['url']?.toString() ?? '',
      mimeType: json['mime_type']?.toString() ?? json['type']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'url': url,
    if (mimeType != null) 'mime_type': mimeType,
  };
}
