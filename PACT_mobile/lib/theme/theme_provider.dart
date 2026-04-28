import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/secure_storage_service.dart';

/// Provider for theme mode
final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
  (ref) => ThemeModeNotifier(),
);

/// Notifier for theme mode state
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.system) {
    _loadSavedThemeMode();
  }

  /// Load saved theme mode from storage
  Future<void> _loadSavedThemeMode() async {
    try {
      final savedMode = await SecureStorageService.getString('savedThemeMode');
      if (savedMode != null) {
        final mode = _parseThemeMode(savedMode);
        state = mode;
      }
    } catch (e) {
      debugPrint('[ThemeMode] Error loading theme: $e');
    }
  }

  /// Set theme mode
  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    try {
      await SecureStorageService.setString('savedThemeMode', mode.toString());
    } catch (e) {
      debugPrint('[ThemeMode] Error saving theme: $e');
    }
  }

  /// Parse theme mode from string
  ThemeMode _parseThemeMode(String value) {
    if (value.contains('light')) return ThemeMode.light;
    if (value.contains('dark')) return ThemeMode.dark;
    return ThemeMode.system;
  }

  /// Toggle between light and dark
  Future<void> toggleTheme() async {
    final newMode = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await setThemeMode(newMode);
  }

  /// Get current brightness for platform-specific operations
  Brightness get currentBrightness {
    if (state == ThemeMode.system) {
      return WidgetsBinding
              .instance
              .window
              .platformDispatcher
              .views
              .first
              .physicalSize
              .isEmpty
          ? Brightness.light
          : Brightness.light;
    }
    return state == ThemeMode.dark ? Brightness.dark : Brightness.light;
  }
}
