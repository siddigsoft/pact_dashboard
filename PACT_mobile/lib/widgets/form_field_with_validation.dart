import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Real-time Form Validation Feedback for input fields
class FormFieldWithValidation extends StatefulWidget {
  final String label;
  final String? hint;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final TextInputType keyboardType;
  final int maxLines;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final VoidCallback? onEditingComplete;
  final ValueChanged<String>? onChanged;
  final IconData? prefixIcon;
  final IconData? suffixIcon;
  final VoidCallback? onSuffixIconPressed;
  final bool isRequired;

  const FormFieldWithValidation({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.validator,
    this.keyboardType = TextInputType.text,
    this.maxLines = 1,
    this.obscureText = false,
    this.textInputAction,
    this.onEditingComplete,
    this.onChanged,
    this.prefixIcon,
    this.suffixIcon,
    this.onSuffixIconPressed,
    this.isRequired = false,
  });

  @override
  State<FormFieldWithValidation> createState() =>
      _FormFieldWithValidationState();
}

class _FormFieldWithValidationState extends State<FormFieldWithValidation> {
  String? _errorText;
  bool _isFocused = false;
  late FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _focusNode = FocusNode();
    _focusNode.addListener(_onFocusChange);
    widget.controller.addListener(_validateOnChange);
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    widget.controller.removeListener(_validateOnChange);
    super.dispose();
  }

  void _onFocusChange() {
    setState(() {
      _isFocused = _focusNode.hasFocus;
    });

    // Validate when focus is lost
    if (!_isFocused && widget.controller.text.isNotEmpty) {
      _validateField();
    }
  }

  void _validateOnChange() {
    // Only validate if field was previously focused (has been interacted with)
    if (_isFocused) {
      _validateField();
    }
  }

  void _validateField() {
    String? error;
    if (widget.isRequired && widget.controller.text.isEmpty) {
      error = '${widget.label} is required';
    } else if (widget.validator != null && widget.controller.text.isNotEmpty) {
      error = widget.validator!(widget.controller.text);
    }

    setState(() {
      _errorText = error;
    });

    widget.onChanged?.call(widget.controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final hasError = _errorText != null && _errorText!.isNotEmpty;
    final isValid =
        !hasError && widget.controller.text.isNotEmpty && _isFocused == false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Label with required indicator
        Row(
          children: [
            Text(
              widget.label,
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: hasError ? Colors.red : AppColors.textDark,
              ),
            ),
            if (widget.isRequired)
              Text(
                ' *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.red,
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),

        // TextField with validation styling
        TextField(
          controller: widget.controller,
          focusNode: _focusNode,
          keyboardType: widget.keyboardType,
          maxLines: widget.obscureText ? 1 : widget.maxLines,
          obscureText: widget.obscureText,
          textInputAction: widget.textInputAction,
          onEditingComplete: widget.onEditingComplete,
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: GoogleFonts.poppins(
              fontSize: 13,
              color: AppColors.textLight.withOpacity(0.6),
            ),
            prefixIcon: widget.prefixIcon != null
                ? Icon(
                    widget.prefixIcon,
                    color: hasError
                        ? Colors.red
                        : isValid
                            ? Colors.green
                            : AppColors.textLight,
                    size: 20,
                  )
                : null,
            suffixIcon: widget.suffixIcon != null
                ? IconButton(
                    icon: Icon(
                      widget.suffixIcon,
                      color: AppColors.textLight,
                    ),
                    onPressed: widget.onSuffixIconPressed,
                  )
                : (isValid
                    ? Icon(
                        Icons.check_circle_outline,
                        color: Colors.green.shade600,
                        size: 20,
                      )
                    : null),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: hasError
                    ? Colors.red.shade300
                    : AppColors.textLight.withOpacity(0.3),
                width: 1.5,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: hasError
                    ? Colors.red.shade300
                    : AppColors.textLight.withOpacity(0.3),
                width: 1.5,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: hasError ? Colors.red.shade600 : AppColors.primaryOrange,
                width: 2,
              ),
            ),
            filled: true,
            fillColor: hasError
                ? Colors.red.withOpacity(0.05)
                : AppColors.backgroundGray.withOpacity(0.5),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
          ),
        ),

        // Error/Help text
        if (_errorText != null && _errorText!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Icon(
                  Icons.error_outline,
                  color: Colors.red,
                  size: 16,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _errorText!,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: Colors.red,
                    ),
                  ),
                ),
              ],
            ),
          )
        else if (isValid)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Icon(
                  Icons.check_circle_outline,
                  color: Colors.green.shade600,
                  size: 16,
                ),
                const SizedBox(width: 6),
                Text(
                  'Looks good!',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: Colors.green.shade600,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
      ],
    );
  }
}

/// Email Validator
String? validateEmail(String? value) {
  if (value == null || value.isEmpty) {
    return 'Email is required';
  }
  final emailRegex = RegExp(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
  );
  if (!emailRegex.hasMatch(value)) {
    return 'Please enter a valid email address';
  }
  return null;
}

/// Password Validator
String? validatePassword(String? value) {
  if (value == null || value.isEmpty) {
    return 'Password is required';
  }
  if (value.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!RegExp(r'[A-Z]').hasMatch(value)) {
    return 'Must contain at least one uppercase letter';
  }
  if (!RegExp(r'[0-9]').hasMatch(value)) {
    return 'Must contain at least one number';
  }
  if (!RegExp("[!@#\$%^&*()_+=\\-\\[\\]{};:'\",.<>?/\\\\|`~]")
      .hasMatch(value)) {
    return 'Must contain at least one special character';
  }
  return null;
}

/// Phone Validator
String? validatePhone(String? value) {
  if (value == null || value.isEmpty) {
    return 'Phone number is required';
  }
  final phoneRegex = RegExp(r'^[0-9\s\-\+\(\)]{10,}$');
  if (!phoneRegex.hasMatch(value.replaceAll(' ', ''))) {
    return 'Please enter a valid phone number';
  }
  return null;
}

/// Name Validator
String? validateName(String? value) {
  if (value == null || value.isEmpty) {
    return 'Name is required';
  }
  if (value.length < 2) {
    return 'Name must be at least 2 characters';
  }
  if (!RegExp(r'^[a-zA-Z\s\-\']+$').hasMatch(value)) {
    return 'Name can only contain letters, spaces, hyphens, and apostrophes';
  }
  return null;
}

/// URL Validator
String? validateUrl(String? value) {
  if (value == null || value.isEmpty) {
    return 'URL is required';
  }
  try {
    Uri.parse(value);
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return 'URL must start with http:// or https://';
    }
    return null;
  } catch (e) {
    return 'Please enter a valid URL';
  }
}
