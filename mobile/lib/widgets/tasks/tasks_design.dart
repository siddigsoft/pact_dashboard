import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../models/personal_task.dart';

/// Shared visual language for task screens — flat, editorial, no gradient chrome.
abstract final class TasksDesign {
  static const Color canvas = Color(0xFFF4F5F7);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color ink = Color(0xFF1A2332);
  static const Color muted = Color(0xFF64748B);
  static const Color line = Color(0xFFE2E8F0);
  static const Color accent = Color(0xFF1D4ED8);
  static const Color accentSoft = Color(0xFFEFF6FF);

  static TextStyle titleLg(BuildContext context) => GoogleFonts.dmSans(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    color: ink,
    letterSpacing: -0.4,
  );

  static TextStyle titleMd(BuildContext context) => GoogleFonts.dmSans(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: ink,
    letterSpacing: -0.2,
  );

  static TextStyle body(BuildContext context) => GoogleFonts.dmSans(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: ink,
    height: 1.45,
  );

  static TextStyle caption(BuildContext context) => GoogleFonts.dmSans(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: muted,
  );

  static BoxDecoration card({Color? borderColor}) => BoxDecoration(
    color: surface,
    borderRadius: BorderRadius.circular(14),
    border: Border.all(color: borderColor ?? line),
    boxShadow: const [
      BoxShadow(
        color: Color(0x08000000),
        blurRadius: 8,
        offset: Offset(0, 2),
      ),
    ],
  );

  static Color statusTint(PersonalTaskStatus status) {
    return PersonalTask.statusColor(status).withValues(alpha: 0.12);
  }

  static InputDecoration fieldDecoration(String label, {String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      labelStyle: GoogleFonts.dmSans(fontSize: 13, color: muted),
      hintStyle: GoogleFonts.dmSans(fontSize: 14, color: muted.withValues(alpha: 0.7)),
      filled: true,
      fillColor: surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: accent, width: 1.5),
      ),
    );
  }
}

enum TaskViewMode {
  list,
  board,
  timeline,
  planning,
  planner,
  inbox,
  delegated,
}
