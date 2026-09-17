import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/models/operational_cost_submission.dart';

OperationalCostSubmission _submission({
  required String hubId,
  String submitterRole = 'Coordinator',
}) {
  final now = DateTime(2026, 1, 1);
  return OperationalCostSubmission(
    id: 'submission',
    userId: 'submitter',
    hubId: hubId,
    expenseCategory: ExpenseCategory.other,
    amountCents: 100,
    description: 'Test',
    status: OperationalCostStatus.pending,
    tier1Status: 'pending',
    createdAt: now,
    updatedAt: now,
    submitterRole: submitterRole,
  );
}

void main() {
  test('Kassala supervisor can only review Kassala coordinator Tier 1', () {
    final permissions = CostSubmissionPermissions.fromRole(
      'Hub Supervisor',
      assignedHubId: 'kassala-id',
      assignedHubName: 'Kassala Hub',
    );

    expect(
      permissions.canApproveTier1(_submission(hubId: 'kassala-id')),
      isTrue,
    );
    expect(
      permissions.canApproveTier1(_submission(hubId: 'dongola-id')),
      isFalse,
    );
    expect(
      permissions.canApproveTier1(
        _submission(hubId: 'kassala-id', submitterRole: 'Supervisor'),
      ),
      isFalse,
    );
    expect(
      permissions.canApproveTier2(_submission(hubId: 'kassala-id')),
      isFalse,
    );
    expect(permissions.canPayOut, isFalse);
  });

  test('ordinary supervisor remains assigned-hub scoped', () {
    final permissions = CostSubmissionPermissions.fromRole(
      'Supervisor',
      assignedHubId: 'dongola-id',
      assignedHubName: 'Dongola Hub',
    );

    expect(
      permissions.canApproveTier1(_submission(hubId: 'dongola-id')),
      isTrue,
    );
    expect(
      permissions.canApproveTier1(_submission(hubId: 'kassala-id')),
      isFalse,
    );
  });

  test('Field Assistant receives only Kassala supervisor T1 override', () {
    final permissions = CostSubmissionPermissions.fromRole(
      'Field Assistant',
      authoritativeKassalaSupervisor: true,
      kassalaHubId: 'kassala-id',
    );

    expect(permissions.isKassalaHubSupervisor, isTrue);
    expect(permissions.canViewTeam, isTrue);
    expect(
      permissions.canApproveTier1(_submission(hubId: 'kassala-id')),
      isTrue,
    );
    expect(permissions.canApproveTier2(_submission(hubId: 'kassala-id')), isFalse);
    expect(permissions.canPayOut, isFalse);
  });
}
