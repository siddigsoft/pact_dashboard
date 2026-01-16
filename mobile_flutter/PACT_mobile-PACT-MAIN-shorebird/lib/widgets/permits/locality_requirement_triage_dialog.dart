// lib/widgets/permits/locality_requirement_triage_dialog.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_colors.dart';
import '../../l10n/app_localizations.dart';

enum LocalityRequirement {
  yesHaveIt,
  requiredDontHave,
  notRequired,
}

enum FollowUpChoice {
  canProceed,
  cannotProceed,
}

class LocalityRequirementResult {
  final LocalityRequirement requirement;
  final FollowUpChoice? followUp;

  LocalityRequirementResult({
    required this.requirement,
    this.followUp,
  });
}

class LocalityRequirementTriageDialog extends StatefulWidget {
  final String locality;
  final String state;
  final int siteCount;
  final Function(LocalityRequirementResult) onComplete;

  const LocalityRequirementTriageDialog({
    super.key,
    required this.locality,
    required this.state,
    required this.siteCount,
    required this.onComplete,
  });

  @override
  State<LocalityRequirementTriageDialog> createState() =>
      _LocalityRequirementTriageDialogState();
}

class _LocalityRequirementTriageDialogState
    extends State<LocalityRequirementTriageDialog> {
  LocalityRequirement? _selectedRequirement;
  FollowUpChoice? _followUpChoice;
  int _step = 1; // 1 = requirement question, 2 = follow-up question

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 450),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(l10n),
            Padding(
              padding: const EdgeInsets.all(20),
              child: _step == 1
                  ? _buildRequirementStep(l10n, isRtl)
                  : _buildFollowUpStep(l10n, isRtl),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue.withOpacity(0.1),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.location_on,
              color: AppColors.primaryBlue,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n?.translate('localityPermit') ?? 'Locality Permit',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryBlue,
                  ),
                ),
                Text(
                  '${widget.locality}, ${widget.state}',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
                Text(
                  '${widget.siteCount} ${widget.siteCount == 1 ? (l10n?.translate('site') ?? 'site') : (l10n?.translate('sites') ?? 'sites')}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  Widget _buildRequirementStep(AppLocalizations? l10n, bool isRtl) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.blue.shade100),
          ),
          child: Row(
            children: [
              Icon(Icons.help_outline, color: Colors.blue.shade700, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n?.doYouHaveLocalityPermit(widget.locality) ??
                      'Do you have the locality permit for ${widget.locality}?',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.blue.shade900,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        _buildOptionTile(
          title: l10n?.translate('yesHaveIt') ?? 'Yes, I have the permit',
          subtitle: l10n?.translate('willUploadPermit') ?? 'I will upload the permit document',
          icon: Icons.check_circle_outline,
          color: Colors.green,
          isSelected: _selectedRequirement == LocalityRequirement.yesHaveIt,
          onTap: () {
            setState(() => _selectedRequirement = LocalityRequirement.yesHaveIt);
          },
        ),
        const SizedBox(height: 12),
        _buildOptionTile(
          title: l10n?.translate('noRequiredDontHave') ?? 'Required but I don\'t have it',
          subtitle: l10n?.translate('cannotProvideNow') ?? 'The permit is required but I cannot provide it now',
          icon: Icons.warning_amber_outlined,
          color: Colors.orange,
          isSelected: _selectedRequirement == LocalityRequirement.requiredDontHave,
          onTap: () {
            setState(() => _selectedRequirement = LocalityRequirement.requiredDontHave);
          },
        ),
        const SizedBox(height: 12),
        _buildOptionTile(
          title: l10n?.translate('notRequiredInLocality') ?? 'Not required in this locality',
          subtitle: l10n?.translate('noPermitNeeded') ?? 'No locality permit is needed for operations here',
          icon: Icons.not_interested,
          color: Colors.grey,
          isSelected: _selectedRequirement == LocalityRequirement.notRequired,
          onTap: () {
            setState(() => _selectedRequirement = LocalityRequirement.notRequired);
          },
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(l10n?.translate('cancel') ?? 'Cancel'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _selectedRequirement == null ? null : _onNextStep,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  l10n?.translate('continueText') ?? 'Continue',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFollowUpStep(AppLocalizations? l10n, bool isRtl) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.orange.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.orange.shade200),
          ),
          child: Row(
            children: [
              Icon(Icons.help_outline, color: Colors.orange.shade700, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n?.translate('canProceedWithout') ??
                      'Can you proceed without the permit?',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.orange.shade900,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          l10n?.chooseHowToProceed(
            widget.siteCount,
            widget.siteCount == 1 
                ? (l10n.translate('site') ?? 'site') 
                : (l10n.translate('sites') ?? 'sites'),
            widget.locality,
          ) ?? 'Choose how to proceed for ${widget.siteCount} ${widget.siteCount == 1 ? 'site' : 'sites'} in ${widget.locality}:',
          style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey.shade600),
        ),
        const SizedBox(height: 16),
        _buildOptionTile(
          title: l10n?.translate('yesProceedWithout') ?? 'Yes, I can proceed',
          subtitle: l10n?.translate('continueWithoutPermit') ?? 'Continue without the locality permit',
          icon: Icons.check_circle_outline,
          color: Colors.green,
          isSelected: _followUpChoice == FollowUpChoice.canProceed,
          onTap: () {
            setState(() => _followUpChoice = FollowUpChoice.canProceed);
          },
        ),
        const SizedBox(height: 12),
        _buildOptionTile(
          title: l10n?.translate('noCannotProceed') ?? 'No, I need the permit',
          subtitle: l10n?.translate('sendBackToManager') ?? 'Send back to Field Operations Manager',
          icon: Icons.arrow_back,
          color: Colors.red,
          isSelected: _followUpChoice == FollowUpChoice.cannotProceed,
          onTap: () {
            setState(() => _followUpChoice = FollowUpChoice.cannotProceed);
          },
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() => _step = 1),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(l10n?.translate('back') ?? 'Back'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _followUpChoice == null ? null : _onComplete,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _followUpChoice == FollowUpChoice.cannotProceed
                      ? Colors.red
                      : AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  _followUpChoice == FollowUpChoice.cannotProceed
                      ? (l10n?.translate('sendBackToFom') ?? 'Send Back to FOM')
                      : (l10n?.translate('continueText') ?? 'Continue'),
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildOptionTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? color : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
          color: isSelected ? color.withOpacity(0.05) : Colors.white,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: isSelected ? color : Colors.black87,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            if (isSelected)
              Icon(Icons.check_circle, color: color, size: 24)
            else
              Icon(Icons.radio_button_unchecked, color: Colors.grey.shade400, size: 24),
          ],
        ),
      ),
    );
  }

  void _onNextStep() {
    if (_selectedRequirement == LocalityRequirement.yesHaveIt) {
      Navigator.of(context).pop();
      widget.onComplete(LocalityRequirementResult(
        requirement: LocalityRequirement.yesHaveIt,
      ));
    } else if (_selectedRequirement == LocalityRequirement.notRequired) {
      Navigator.of(context).pop();
      widget.onComplete(LocalityRequirementResult(
        requirement: LocalityRequirement.notRequired,
      ));
    } else {
      setState(() => _step = 2);
    }
  }

  void _onComplete() {
    Navigator.of(context).pop();
    widget.onComplete(LocalityRequirementResult(
      requirement: _selectedRequirement!,
      followUp: _followUpChoice,
    ));
  }
}
