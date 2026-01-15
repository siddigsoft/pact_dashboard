import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:pact_mobile/algorithms/site_visit_assignment.dart';

class MockSupabaseClient extends Mock implements SupabaseClient {}

void main() {
  group('SiteVisitAssignment', () {
    late MockSupabaseClient mockSupabase;
    late SiteVisitAssignment assignment;

    setUp(() {
      mockSupabase = MockSupabaseClient();
      assignment = SiteVisitAssignment(mockSupabase);
    });

    test('attemptAssign should handle successful assignment', () async {
      // Mock successful RPC response
      when(() => mockSupabase.rpc(
            'assign_site_visit',
            params: any(named: 'params'),
          )).thenAnswer((_) async => PostgrestResponse(
            data: {
              'success': true,
              'assigned_to': 'testUserId',
              'status': 'assigned',
            },
            status: 200,
            count: null,
          ));

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
      when(() => mockSupabase.rpc(
            'assign_site_visit',
            params: any(named: 'params'),
          )).thenAnswer((_) async => PostgrestResponse(
            data: {
              'success': false,
              'assigned_to': 'otherUserId',
              'status': 'assigned',
            },
            status: 200,
            count: null,
          ));

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
      when(() => mockSupabase.rpc(
            'assign_site_visit',
            params: any(named: 'params'),
          )).thenAnswer((_) async => PostgrestResponse(
            data: null,
            status: 500,
            error: PostgrestError(message: 'Network error'),
            count: null,
          ));

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