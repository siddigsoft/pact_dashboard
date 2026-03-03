import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pact_mobile/services/rpc_client.dart';
import 'package:pact_mobile/algorithms/site_visit_assignment.dart';

class MockRpcClient extends Mock implements RpcClient {}

// Lightweight fake response object to avoid depending on Postgrest types
class FakeError {
  final String message;
  const FakeError({required this.message});
}

class FakeResponse {
  final dynamic data;
  final FakeError? error;
  const FakeResponse({this.data, this.error});
}

void main() {
  group('SiteVisitAssignment', () {
    late MockRpcClient mockRpc;
    late SiteVisitAssignment assignment;

    setUp(() {
      mockRpc = MockRpcClient();
      assignment = SiteVisitAssignment(mockRpc);
    });

    test('attemptAssign should handle successful assignment', () async {
      // Mock successful RPC response
      when(
        () => mockRpc.rpc('assign_site_visit', params: any(named: 'params')),
      ).thenAnswer(
        (_) async => const FakeResponse(
          data: {
            'success': true,
            'assigned_to': 'testUserId',
            'status': 'assigned',
          },
        ),
      );

      final result = await assignment.attemptAssign(
        siteId: 'testSiteId',
        userId: 'testUserId',
      );

      expect(result.success, true);
      expect(result.error, null);
      expect(result.currentAssignment?.assignedTo, 'testUserId');
      expect(result.currentAssignment?.status, 'assigned');
    });

    test('attemptAssign should handle already assigned visits', () async {
      // Mock RPC response for already assigned visit
      when(
        () => mockRpc.rpc('assign_site_visit', params: any(named: 'params')),
      ).thenAnswer(
        (_) async => const FakeResponse(
          data: {
            'success': false,
            'assigned_to': 'otherUserId',
            'status': 'assigned',
          },
        ),
      );

      final result = await assignment.attemptAssign(
        siteId: 'testSiteId',
        userId: 'testUserId',
      );

      expect(result.success, false);
      expect(result.error, 'Site visit already assigned');
      expect(result.currentAssignment?.assignedTo, 'otherUserId');
      expect(result.currentAssignment?.status, 'assigned');
    });

    test('attemptAssign should handle network errors', () async {
      // Mock network error
      when(
        () => mockRpc.rpc('assign_site_visit', params: any(named: 'params')),
      ).thenAnswer(
        (_) async => const FakeResponse(
          data: null,
          error: FakeError(message: 'Network error'),
        ),
      );

      final result = await assignment.attemptAssign(
        siteId: 'testSiteId',
        userId: 'testUserId',
      );

      expect(result.success, false);
      expect(result.error, 'Network error');
      expect(result.currentAssignment, null);
    });
  });
}
