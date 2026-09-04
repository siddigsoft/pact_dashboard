import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../services/r2_storage_service.dart';

/// Network image that signs `r2:` refs and passes through legacy public URLs.
class StoredNetworkImage extends StatefulWidget {
  final String url;
  final BoxFit fit;
  final Widget Function(BuildContext, String)? placeholder;
  final Widget Function(BuildContext, String, dynamic)? errorWidget;

  const StoredNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.placeholder,
    this.errorWidget,
  });

  @override
  State<StoredNetworkImage> createState() => _StoredNetworkImageState();
}

class _StoredNetworkImageState extends State<StoredNetworkImage> {
  String? _resolved;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(StoredNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _resolved = null;
      _error = null;
      _resolve();
    }
  }

  Future<void> _resolve() async {
    try {
      final url = await R2StorageService.resolveUrl(widget.url);
      if (!mounted) return;
      setState(() => _resolved = url);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return widget.errorWidget?.call(context, widget.url, _error) ??
          const ColoredBox(
            color: Color(0xFFE0E0E0),
            child: Icon(Icons.broken_image, color: Colors.grey),
          );
    }
    if (_resolved == null) {
      return widget.placeholder?.call(context, widget.url) ??
          const ColoredBox(
            color: Color(0xFFF5F5F5),
            child: Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
    }
    return CachedNetworkImage(
      imageUrl: _resolved!,
      fit: widget.fit,
      placeholder: widget.placeholder,
      errorWidget: widget.errorWidget,
    );
  }
}
