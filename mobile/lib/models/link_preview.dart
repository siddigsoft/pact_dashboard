class LinkPreview {
  final String url;
  final String? title;
  final String? description;
  final String? imageUrl;
  final String? siteName;
  final String? favicon;

  LinkPreview({
    required this.url,
    this.title,
    this.description,
    this.imageUrl,
    this.siteName,
    this.favicon,
  });

  factory LinkPreview.fromJson(Map<String, dynamic> json) {
    return LinkPreview(
      url: json['url']?.toString() ?? '',
      title: json['title']?.toString(),
      description: json['description']?.toString(),
      imageUrl: json['image_url']?.toString(),
      siteName: json['site_name']?.toString(),
      favicon: json['favicon']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'url': url,
      'title': title,
      'description': description,
      'image_url': imageUrl,
      'site_name': siteName,
      'favicon': favicon,
    };
  }

  bool get hasContent =>
      title != null || description != null || imageUrl != null;
}
