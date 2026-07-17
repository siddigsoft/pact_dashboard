import 'package:flutter/material.dart';
import '../services/user_preferences_service.dart';
import '../theme/app_colors.dart';

/// Provider/State manager for Do Not Disturb mode
class DNDProvider extends ChangeNotifier {
  bool _isDNDEnabled = false;

  bool get isDNDEnabled => _isDNDEnabled;

  /// Initialize DND state from stored preferences
  Future<void> initialize() async {
    _isDNDEnabled = await UserPreferencesService.isDNDEnabled();
    notifyListeners();
  }

  /// Toggle DND mode
  Future<void> toggleDND() async {
    _isDNDEnabled = await UserPreferencesService.toggleDND();
    notifyListeners();
  }

  /// Enable DND
  Future<void> enableDND() async {
    if (!_isDNDEnabled) {
      await UserPreferencesService.enableDND();
      _isDNDEnabled = true;
      notifyListeners();
    }
  }

  /// Disable DND
  Future<void> disableDND() async {
    if (_isDNDEnabled) {
      await UserPreferencesService.disableDND();
      _isDNDEnabled = false;
      notifyListeners();
    }
  }
}

/// Widget for DND mode toggle button
class DNDToggleButton extends StatefulWidget {
  final ValueChanged<bool>? onChanged;
  final bool isCompact;

  const DNDToggleButton({this.onChanged, this.isCompact = false});

  @override
  State<DNDToggleButton> createState() => _DNDToggleButtonState();
}

class _DNDToggleButtonState extends State<DNDToggleButton> {
  bool _isDNDEnabled = false;

  @override
  void initState() {
    super.initState();
    _loadDNDStatus();
  }

  Future<void> _loadDNDStatus() async {
    final isDND = await UserPreferencesService.isDNDEnabled();
    if (mounted) {
      setState(() {
        _isDNDEnabled = isDND;
      });
    }
  }

  Future<void> _toggleDND() async {
    final newValue = await UserPreferencesService.toggleDND();
    if (mounted) {
      setState(() {
        _isDNDEnabled = newValue;
      });
      widget.onChanged?.call(newValue);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isCompact) {
      return IconButton(
        icon: Icon(
          _isDNDEnabled ? Icons.do_not_disturb_on : Icons.do_not_disturb_off,
          color: _isDNDEnabled ? Colors.orange : Colors.grey,
        ),
        onPressed: _toggleDND,
        tooltip: _isDNDEnabled ? 'DND On' : 'DND Off',
      );
    }

    return GestureDetector(
      onTap: _toggleDND,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: _isDNDEnabled
              ? Colors.orange.withOpacity(0.2)
              : Colors.grey.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: _isDNDEnabled
                ? Colors.orange.withOpacity(0.5)
                : Colors.grey.withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _isDNDEnabled
                  ? Icons.do_not_disturb_on
                  : Icons.do_not_disturb_off,
              color: _isDNDEnabled ? Colors.orange : Colors.grey,
              size: 18,
            ),
            const SizedBox(width: 6),
            Text(
              _isDNDEnabled ? 'DND: On' : 'DND: Off',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _isDNDEnabled ? Colors.orange : Colors.grey,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Display widget showing DND status in header
class DNDStatusIndicator extends StatefulWidget {
  final bool isCompact;

  const DNDStatusIndicator({this.isCompact = true});

  @override
  State<DNDStatusIndicator> createState() => _DNDStatusIndicatorState();
}

class _DNDStatusIndicatorState extends State<DNDStatusIndicator> {
  bool _isDNDEnabled = false;

  @override
  void initState() {
    super.initState();
    _loadDNDStatus();
  }

  Future<void> _loadDNDStatus() async {
    final isDND = await UserPreferencesService.isDNDEnabled();
    if (mounted) {
      setState(() {
        _isDNDEnabled = isDND;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isDNDEnabled) {
      return const SizedBox.shrink();
    }

    if (widget.isCompact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.orange.withOpacity(0.2),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Colors.orange.withOpacity(0.5)),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.do_not_disturb_on, color: Colors.orange, size: 12),
            SizedBox(width: 2),
            Text(
              'DND',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: Colors.orange,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.orange.withOpacity(0.1),
        border: Border.all(color: Colors.orange.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: const [
          Icon(Icons.do_not_disturb_on, color: Colors.orange, size: 16),
          SizedBox(width: 6),
          Text(
            'Do Not Disturb Mode Active',
            style: TextStyle(
              fontSize: 12,
              color: Colors.orange,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
