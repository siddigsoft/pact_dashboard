// Conditional export: web implementation uses dart:html, other platforms use IO/share
export 'file_downloader_io.dart'
    if (dart.library.html) 'file_downloader_web.dart';
