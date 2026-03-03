# STEP 12 - ACCESSIBILITY AUDIT GUIDE

**Status**: 🔄 Ready for Implementation  
**Target Completion**: Complete accessibility audit for WCAG AA compliance  
**Date Started**: February 27, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Accessibility Standards (WCAG AA)](#accessibility-standards-wcag-aa)
3. [Semantic Labels Implementation](#semantic-labels-implementation)
4. [Color Contrast Verification](#color-contrast-verification)
5. [Touch Target Validation](#touch-target-validation)
6. [Keyboard Navigation](#keyboard-navigation)
7. [Screen Reader Testing](#screen-reader-testing)
8. [Implementation Checklist](#implementation-checklist)
9. [Verification Procedures](#verification-procedures)
10. [Tools & Resources](#tools--resources)

---

## Overview

Step 12 focuses on making the PACT Mobile application accessible to all users, including those with disabilities. The audit ensures compliance with WCAG 2.1 AA standards.

### Accessibility Goals
- ✅ WCAG 2.1 AA compliance
- ✅ Semantic HTML/Flutter equivalent
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Color contrast (4.5:1 for text, 3:1 for graphics)
- ✅ Touch target minimum 48dp x 48dp

### User Impact
- Visually impaired users (screen readers)
- Motor impaired users (keyboard navigation)
- Color-blind users (color contrast)
- Temporary disabilities (injuries)
- Situational disabilities (bright sunlight)
- Older adults (larger text, higher contrast)

---

## Accessibility Standards (WCAG AA)

### WCAG 2.1 Level AA Requirements

#### Perceivable (Information & Components Perceivable)
- **1.1 Text Alternatives**: All non-text content has text alternative
- **1.3 Adaptable**: Content adapts to different layouts
- **1.4 Distinguishable**: Text readable with at least 4.5:1 contrast

#### Operable (Interface Operable via Keyboard)
- **2.1 Keyboard Accessible**: All functionality available via keyboard
- **2.3 Seizures**: No content flashes more than 3 times/second
- **2.5 Input Modalities**: Touch targets at least 44x44 pixels

#### Understandable (Text & Operations Understandable)
- **3.1 Readable**: Page has defined language
- **3.2 Predictable**: Navigation consistent
- **3.3 Input Assistance**: Labels and errors clear

#### Robust (Content Robust in Different Environments)
- **4.1 Compatible**: Parse correctly, all components have accessible names/roles

---

## Semantic Labels Implementation

### 1. Semantic Widget Labels

**Goal**: Every widget should have semantic meaning for screen readers.

#### Implementation Pattern

```dart
// ❌ BAD: No semantic information
Icon(Icons.check)

// ✅ GOOD: With semantic label
Semantics(
  label: 'Submit button',
  button: true,
  enabled: true,
  onTap: () {},
  child: Icon(Icons.check),
)

// ✅ BETTER: Using widget with built-in semantics
IconButton(
  icon: Icon(Icons.check),
  tooltip: 'Submit',
  onPressed: () {},
)
```

#### Required Labels by Widget Type

**Buttons**:
```dart
ElevatedButton(
  onPressed: () => _submitForm(),
  child: Text('Submit Form'),  // Always provide visible text
)

// OR with custom label
Semantics(
  label: 'Submit the form with all entered values',
  button: true,
  onTap: () => _submitForm(),
  child: Icon(Icons.send),
)
```

**Icons** (without visible text):
```dart
Semantics(
  label: 'Close dialog',
  button: true,
  onTap: () => Navigator.pop(context),
  child: Icon(Icons.close),
)
```

**Images**:
```dart
Semantics(
  image: true,
  label: 'Field site visit location map showing coordinates',
  child: Image.asset('assets/site_map.png'),
)
```

**Form Fields**:
```dart
TextField(
  decoration: InputDecoration(
    labelText: 'Email Address',  // Visible label
    hintText: 'Enter your email',
    helperText: 'We\'ll never share your email',
  ),
  semanticFormatterOverride: (String value) => 'Email: $value',
)
```

**Lists**:
```dart
Semantics(
  list: true,
  label: 'Site visits list with 5 items',
  child: ListView.builder(
    itemCount: visits.length,
    itemBuilder: (context, index) => Semantics(
      customSemanticsActions: {
        CustomSemanticsAction('tap'): () => _openVisit(visits[index]),
      },
      child: VisitTile(visit: visits[index]),
    ),
  ),
)
```

### 2. Screen-Level Semantics

**Screens should announce their purpose**:

```dart
@override
Widget build(BuildContext context) {
  return Semantics(
    container: true,
    label: 'Dashboard screen showing site visit metrics',
    child: Scaffold(
      appBar: AppBar(
        title: Text('Dashboard'),
        semanticsLabel: 'Dashboard',
      ),
      body: _buildDashboardContent(),
    ),
  );
}
```

### 3. Complex Widget Documentation

**Pattern for custom widgets**:

```dart
/// Accessible custom widget for displaying field visit status.
/// 
/// Semantics:
/// - Container announces as a "button"
/// - Status announced with text: "Site visit: [name], Status: [status]"
/// - Tapping opens visit details
class FieldVisitCard extends StatelessWidget {
  final SiteVisit visit;
  final VoidCallback onTap;

  const FieldVisitCard({
    required this.visit,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: true,
      onTap: onTap,
      label: 'Site visit: ${visit.siteName}, Status: ${visit.status}',
      child: GestureDetector(
        onTap: onTap,
        child: _buildCard(),
      ),
    );
  }

  Widget _buildCard() {
    return Card(
      child: Column(
        children: [
          Text(visit.siteName),
          Text('Status: ${visit.status}'),
          Text('${visit.location}'),
        ],
      ),
    );
  }
}
```

---

## Color Contrast Verification

### 1. Text Contrast Requirements

**WCAG AA Standards**:
- Normal text: 4.5:1 contrast ratio
- Large text (18pt+): 3:1 contrast ratio
- Graphics: 3:1 contrast ratio

### 2. Verification Procedure

**Using WebAIM Contrast Checker**:

```bash
# Tool: WebAIM Color Contrast Checker
# URL: https://webaim.org/resources/contrastchecker/

# Test each color combination:
# 1. Foreground color
# 2. Background color
# 3. Verify ratio >= 4.5:1 for normal text
```

**Dart Code Example**:

```dart
// Define accessible color palette
class AccessibleColors {
  // Text on Light Background
  static const Color lightBgText = Color(0xFF212121);  // Dark gray
  static const Color lightBgBackground = Color(0xFFFFFFFF);  // White
  // Ratio: 21:1 ✅ EXCEEDS 4.5:1

  // Text on Dark Background
  static const Color darkBgText = Color(0xFFEEEEEE);  // Light gray
  static const Color darkBgBackground = Color(0xFF1C1C1C);  // Dark gray
  // Ratio: 11.5:1 ✅ EXCEEDS 4.5:1

  // Interactive Elements
  static const Color primaryButton = Color(0xFF1976D2);  // Material Blue
  static const Color primaryButtonText = Color(0xFFFFFFFF);  // White
  // Ratio: 8.6:1 ✅ EXCEEDS 4.5:1

  // Status Indicators
  static const Color successDark = Color(0xFF2E7D32);  // Not just #00FF00
  static const Color errorDark = Color(0xFFC62828);   // Not just #FF0000
  // Both exceed 4.5:1 on white
}
```

### 3. Color Combinations to Verify

**Critical Combinations** (Test all):

| Element | Foreground | Background | Min Ratio | Test |
|---------|-----------|-----------|----------|------|
| Normal Text | Primary | Primary BG | 4.5:1 | ✅ |
| Links | Link Blue | Primary BG | 4.5:1 | ✅ |
| Disabled Text | Gray | Primary BG | 3:1 | ✅ |
| Button Text | White | Blue Button | 4.5:1 | ✅ |
| Success Icon | Green | White | 3:1 | ✅ |
| Error Icon | Red | White | 3:1 | ✅ |
| Placeholder | Light Gray | White | 3:1 | ⚠️ Check |

### 4. Implementation Fixes

**If contrast too low**:

```dart
// ❌ LOW CONTRAST
Text(
  'Hint text',
  style: TextStyle(
    color: Color(0xFFBBBBBB),  // Light gray on white = 3:1
  ),
)

// ✅ FIXED
Text(
  'Hint text',
  style: TextStyle(
    color: Color(0xFF888888),  // Darker gray on white = 7.5:1
  ),
)
```

---

## Touch Target Validation

### 1. Minimum Touch Target Size

**WCAG AA & Material Design Standard**: **48x48 density-independent pixels (dp)**

### 2. Implementation Guide

**Button Sizing**:

```dart
// ❌ TOO SMALL (24x24)
IconButton(
  icon: Icon(Icons.close),
  iconSize: 24,
)

// ✅ CORRECT (48x48 minimum)
IconButton(
  icon: Icon(Icons.close),
  iconSize: 24,  // Icon size
  // Total clickable area: 48x48 (default)
)

// ✅ EXPLICIT SIZE
SizedBox(
  width: 48,
  height: 48,
  child: IconButton(
    icon: Icon(Icons.close),
    onPressed: () {},
  ),
)
```

**Complex Touch Targets**:

```dart
// ❌ Small touch area for list item
ListTile(
  title: Text('Site Visit'),
  trailing: Icon(Icons.edit),  // Small icon, hard to tap
  onTap: () {},
)

// ✅ Large touch area
ListTile(
  minLeadingWidth: 48,
  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
  title: Text('Site Visit'),
  trailing: SizedBox(
    width: 48,
    height: 48,
    child: IconButton(
      icon: Icon(Icons.edit),
      onPressed: () {},
    ),
  ),
  onTap: () {},
)
```

### 3. Spacing Between Touch Targets

**Minimum spacing**: 8dp between interactive elements

```dart
// ❌ TOO CLOSE
Row(
  children: [
    IconButton(icon: Icon(Icons.add), onPressed: () {}),
    IconButton(icon: Icon(Icons.delete), onPressed: () {}),
  ],
)

// ✅ WITH SPACING
Row(
  children: [
    IconButton(icon: Icon(Icons.add), onPressed: () {}),
    SizedBox(width: 8),  // Minimum spacing
    IconButton(icon: Icon(Icons.delete), onPressed: () {}),
  ],
)
```

### 4. Validation Checklist

- ✅ All buttons minimum 48x48 dp
- ✅ All link targets minimum 48x48 dp
- ✅ Spacing between targets minimum 8dp
- ✅ Form fields minimum 48dp tall
- ✅ Checkboxes/radio buttons 48x48 dp
- ✅ Bottom navigation items 48x48 dp minimum

---

## Keyboard Navigation

### 1. Keyboard Focus Strategy

**Goal**: Every interactive element reachable via Tab key

```dart
// ❌ NOT KEYBOARD ACCESSIBLE
GestureDetector(
  onTap: () => _submitForm(),
  child: Container(
    color: Colors.blue,
    child: Text('Submit'),
  ),
)

// ✅ KEYBOARD ACCESSIBLE
GestureDetector(
  onTap: () => _submitForm(),
  child: Focus(
    onKey: (node, event) {
      if (event.isKeyPressed(LogicalKeyboardKey.enter)) {
        _submitForm();
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    },
    child: Container(
      color: Colors.blue,
      child: Text('Submit'),
    ),
  ),
)

// ✅ BETTER: Use accessible widget
ElevatedButton(
  onPressed: _submitForm,
  child: Text('Submit'),
)
```

### 2. Focus Order Implementation

**Control focus sequence (Tab order)**:

```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    body: FocusTraversalGroup(
      policy: OrderedTraversalPolicy(),  // Order by code
      child: Form(
        child: Column(
          children: [
            // Focus order: 1→2→3
            Focus(
              onKey: _onFieldKey,
              child: TextField(
                decoration: InputDecoration(labelText: 'Email'),  // 1st
              ),
            ),
            Focus(
              onKey: _onFieldKey,
              child: TextField(
                decoration: InputDecoration(labelText: 'Password'),  // 2nd
              ),
            ),
            ElevatedButton(
              onPressed: _signin,
              child: Text('Sign In'),  // 3rd
            ),
          ],
        ),
      ),
    ),
  );
}
```

### 3. Keyboard Shortcuts

**Common shortcuts to implement**:

```dart
// Navigation shortcuts
- Tab: Move to next element
- Shift+Tab: Move to previous element
- Enter/Space: Activate button
- Arrow keys: Navigate lists/menus
- Escape: Close dialogs/menus
- / (slash): Search (if applicable)
```

**Implementation**:

```dart
Focus(
  onKey: (node, event) {
    if (event.isKeyPressed(LogicalKeyboardKey.slash)) {
      FocusScope.of(context).requestFocus(_searchFokusNode);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  },
  child: Container(),
)
```

### 4. Focus Visibility

**Clear focus indicator**:

```dart
// ❌ NO VISIBLE FOCUS
ElevatedButton(onPressed: () {}, child: Text('Button'))

// ✅ VISIBLE FOCUS
ElevatedButton(
  onPressed: () {},
  style: ElevatedButton.styleFrom(
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(8),
      side: BorderSide(width: 3, color: Colors.transparent),
    ),
  ).copyWith(
    overlayColor: MaterialStateProperty.resolveWith((states) {
      if (states.contains(MaterialState.focused)) {
        return Colors.blue.withOpacity(0.1);
      }
      return null;
    }),
  ),
  child: Text('Button'),
)
```

---

## Screen Reader Testing

### 1. Android - TalkBack

**Enable TalkBack**:
```
Android Settings → Accessibility → TalkBack
→ Turn On TalkBack
```

**Test Procedure**:
1. Enable TalkBack
2. Swipe right → Move to next item
3. Swipe left → Move to previous item
4. Double tap → Activate item
5. Two-finger swipe down → Read all
6. Two-finger swipe right → Next reading mode

**Verification**:
- ✅ All elements read correctly
- ✅ Labels clear and descriptive
- ✅ Buttons announced with action
- ✅ State changes announced (checked, selected)
- ✅ Errors announced clearly

### 2. iOS - VoiceOver

**Enable VoiceOver**:
```
iOS Settings → Accessibility → VoiceOver
→ Turn On VoiceOver
```

**Test Procedure**:
1. Enable VoiceOver
2. Swipe right → Move to next item
3. Swipe left → Move to previous item
4. Double tap → Activate item
5. Three-finger swipe up → Read from top
6. Rotor (two fingers, rotate) → Quick navigation

**Verification**:
- ✅ All elements announced
- ✅ Purpose of each element clear
- ✅ Interactive elements obvious
- ✅ Navigation logical
- ✅ Forms properly labeled

### 3. Testing Checklist

**For Each Screen**:

- ✅ All text readable by screen reader
- ✅ All interactive elements have labels
- ✅ Focus order logical (top to bottom, left to right)
- ✅ Buttons clearly indicate action
- ✅ Form fields clearly labeled
- ✅ Images have meaningful descriptions
- ✅ Icons have labels/tooltips
- ✅ Color alone not used to convey information
- ✅ No content hidden with visibility: hidden
- ✅ Complex widgets properly decomposed

---

## Implementation Checklist

### Phase 1: Semantic Labels (Week 1)

**Screens to Update**:
- [ ] CompleteVisitScreen - Add labels to form elements
- [ ] CostSubmissionFormScreen - Add labels to cost fields
- [ ] ProfileScreen - Add labels to user fields
- [ ] SettingsScreen - Add labels to toggles/pickers
- [ ] ChatListScreen - Add labels to chat items
- [ ] FieldOperationsEnhancedScreen - Add labels to site list
- [ ] DashboardScreen - Add labels to metric cards
- [ ] MainScreen - Add labels to navigation tabs
- [ ] CallScreen - Add labels to call controls

**Custom Widgets to Update**:
- [ ] FieldVisitCard - Add semantic label
- [ ] CostSubmissionCard - Add semantic label
- [ ] StatusIndicator - Add semantic label
- [ ] OfflineStatusIndicator - Add semantic label

### Phase 2: Color Contrast (Week 2)

**Color Palette Audit**:
- [ ] All text on white: Test >= 4.5:1
- [ ] All text on dark: Test >= 4.5:1
- [ ] All links: Test >= 4.5:1
- [ ] All buttons: Test >= 4.5:1
- [ ] All icons: Test >= 3:1
- [ ] All status indicators: Test >= 3:1
- [ ] Hover states: Verify contrast maintained
- [ ] Disabled states: Verify contrast

**Tools**:
- [ ] WebAIM Contrast Checker (webaim.org)
- [ ] Chrome DevTools: Lighthouse
- [ ] Flutter DevTools: Color contrast

### Phase 3: Touch Targets (Week 2)

**Size Verification**:
- [ ] All buttons: Verify 48x48 dp minimum
- [ ] All icon buttons: Verify 48x48 dp minimum
- [ ] All touch areas: No less than 48x48 dp
- [ ] Touch target spacing: Verify 8dp minimum

**Mobile Screen Sizes**:
- [ ] Test on 4" phones (minimum)
- [ ] Test on 6" tablets
- [ ] Test on landscape mode
- [ ] Verify no overlap while spacing

### Phase 4: Keyboard Navigation (Week 3)

**Keyboard Support**:
- [ ] All buttons keyboard accessible (Enter/Space)
- [ ] All form fields keyboard accessible (Tab)
- [ ] Focus order logical (top-to-bottom, left-to-right)
- [ ] Focus indicators visible (at least 3px, 2:1 contrast)
- [ ] Escape closes modals
- [ ] Tab/Shift+Tab navigation functional
- [ ] No keyboard traps (can always exit)

**Focus Indicators**:
- [ ] Focus ring visible for all elements
- [ ] Focus ring 3+ pixels
- [ ] Focus ring has 3:1 contrast with background
- [ ] Focus ring visible in both light and dark modes

### Phase 5: Screen Reader Testing (Week 3)

**Android - TalkBack**:
- [ ] Enable TalkBack
- [ ] Navigate all screens
- [ ] Verify all text readable
- [ ] Verify all buttons labeled
- [ ] Verify form fields labeled
- [ ] Verify state changes announced
- [ ] Verify no redundant announcements

**iOS - VoiceOver**:
- [ ] Enable VoiceOver
- [ ] Navigate all screens
- [ ] Verify all elements announced
- [ ] Verify custom labels correct
- [ ] Verify focus order correct
- [ ] Verify rotor navigation works
- [ ] Verify hints appropriate

---

## Verification Procedures

### 1. Automated Testing

**Use Flutter Accessibility Tests**:

```bash
# Run accessibility diagnostics
flutter test test/accessibility/ --verbose

# Check for common issues
flutter analyze
```

### 2. Manual Testing Procedure

**For Each Screen**:

1. **Visual Inspection**
   - [ ] No text < 12pt on mobile
   - [ ] Color contrast >= 4.5:1 for text
   - [ ] Colors not sole information source
   - [ ] Focus indicators visible

2. **Keyboard Testing**
   - [ ] Tab navigates all interactive elements
   - [ ] Shift+Tab navigates backwards
   - [ ] Enter activates buttons
   - [ ] Escape closes modals

3. **Screen Reader Testing**
   - [ ] All content announced
   - [ ] Navigation intuitive
   - [ ] No duplicate announcements
   - [ ] Images have descriptions

4. **Mobile Testing**
   - [ ] Touch targets >= 48x48 dp
   - [ ] Targets > 8dp apart
   - [ ] Works on minimum screen size (320dp)
   - [ ] Responsive layout correct

### 3. Accessibility Audit Report

**Create Report Document**:

```markdown
# Accessibility Audit Report - PACT Mobile

## Executive Summary
- Compliance: WCAG 2.1 Level AA
- Status: [In Progress/Complete]
- Issues Found: [Number]
- Critical Issues: [Number]

## Results by Category

### Semantic Labels
- Total Elements: 150+
- Labeled: [Number]
- Percentage: [%]

### Color Contrast
- Text Items: [Number]
- Compliant (4.5:1): [Number]
- Warnings (3-4.5:1): [Number]
- Failures (< 3:1): [Number]

### Touch Targets
- Interactive Elements: [Number]
- Compliant (48x48): [Number]
- Warnings (44-48): [Number]
- Failures (< 44): [Number]

### Keyboard Navigation
- Functional: [%]
- Issues: [List]

### Screen Reader
- Android TalkBack: [Status]
- iOS VoiceOver: [Status]

## Issues Found
[List all issues with severity]

## Recommendations
[List fixes needed]

## Compliance Statement
[✅/⚠️/❌] WCAG 2.1 Level AA Compliant
```

---

## Tools & Resources

### Accessibility Testing Tools

**Online Tools**:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WAVE Accessibility Tool](https://wave.webaim.org/)
- [Lighthouse (Chrome)](https://developers.google.com/web/tools/lighthouse)

**Mobile Tools**:
- TalkBack (Android native)
- VoiceOver (iOS native)
- Accessibility Inspector (macOS)

**Development Tools**:
- Flutter DevTools
- Android Studio: Layout Inspector
- Xcode: Accessibility Inspector

### Resources

**Learning**:
- [WebAIM: Web Accessibility Guidelines](https://webaim.org/)
- [W3C: WCAG 2.1](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [Google: Accessibility Guidelines](https://www.google.com/accessibility/)
- [Apple: Accessibility](https://www.apple.com/accessibility/)

**Flutter Specific**:
- [Flutter: Accessibility](https://flutter.dev/docs/development/accessibility-and-localization/accessibility)
- [Material Design: Accessibility](https://material.io/design/usability/accessibility.html)
- [Dart Semantics Documentation](https://api.flutter.dev/flutter/semantics/semantics-library.html)

---

## Implementation Timeline

### Week 1: Semantic Labels
- Days 1-2: Complete CompleteVisitScreen & CostSubmissionFormScreen
- Days 3-4: Complete ProfileScreen & SettingsScreen
- Day 5: Complete remaining screens

### Week 2: Color Contrast & Touch Targets
- Days 1-2: Audit all colors
- Days 3-4: Fix contrast issues
- Day 5: Verify touch target sizes

### Week 3: Keyboard Navigation & Screen Reader
- Days 1-2: Implement keyboard support
- Days 3-4: Test with TalkBack/VoiceOver
- Day 5: Complete final verification

### Week 4: Final Review & Documentation
- Days 1-2: Resolve remaining issues
- Days 3-4: Final comprehensive testing
- Day 5: Create audit report

---

## Sign-Off Criteria

**Step 12 Complete When**:

- ✅ All screens have semantic labels
- ✅ All color combinations >= 4.5:1 contrast
- ✅ All touch targets >= 48x48 dp
- ✅ All interactive elements keyboard accessible
- ✅ TalkBack testing passed
- ✅ VoiceOver testing passed
- ✅ Accessibility audit report complete
- ✅ WCAG 2.1 AA verified
- ✅ Final build passes all tests
- ✅ Documentation updated

---

## Next Steps After Step 12

**Post-Accessibility**:
1. Regular accessibility maintenance
2. Test new features for accessibility
3. Annual audit and compliance review
4. Update documentation with accessibility best practices
5. Train team on accessible development

---

## Resources in Project

- [README.md](README.md) - Main documentation
- [TEST_GUIDE.md](TEST_GUIDE.md) - Testing guide
- [STEP_10_ANALYTICS_COMPLETE.md](STEP_10_ANALYTICS_COMPLETE.md) - Analytics docs
- [STEP_11_DOCUMENTATION_COMPLETE.md](STEP_11_DOCUMENTATION_COMPLETE.md) - Documentation docs

---

**Status**: 🔄 Ready for Implementation  
**Target Date**: Complete by [Date]  
**Estimated Effort**: 4 weeks (80 hours)  
**Priority**: High - User accessibility critical
