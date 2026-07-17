import 'package:html/parser.dart' as html_parser;

/// Strip HTML to plain text for mobile display; preserve line breaks.
abstract final class TaskHtmlUtils {
  static String toPlainText(String? raw) {
    if (raw == null || raw.trim().isEmpty) return '';
    if (!raw.contains('<')) return raw.trim();
    try {
      final doc = html_parser.parse(raw);
      return doc.body?.text.replaceAll(RegExp(r'\s+\n'), '\n').trim() ?? raw;
    } catch (_) {
      return raw.replaceAll(RegExp(r'<[^>]*>'), '').trim();
    }
  }

  static bool looksLikeHtml(String? raw) =>
      raw != null && RegExp(r'<[a-z][\s\S]*>', caseSensitive: false).hasMatch(raw);

  static String plainToSimpleHtml(String plain) {
    final escaped = plain
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    return '<p>${escaped.split('\n').join('</p><p>')}</p>';
  }
}
