import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/services/conflict_resolution_service.dart';
import 'package:pact_mobile/models/site_visit.dart';

void main() {
  group('ConflictResolutionService', () {
    test('resolveConflict with lastWriteWins strategy should pick newer data', () {
      final now = DateTime.now();
      final older = now.subtract(Duration(hours: 1));
      
      final result = ConflictResolutionService.resolveConflict<String>(
        localData: 'local',
        serverData: 'server',
        localTimestamp: older,
        serverTimestamp: now,
        mergeStrategy: MergeStrategy.lastWriteWins,
      );

      expect(result, equals('server'));
    });

    test('resolveSiteVisitConflict should prefer assigned status', () {
      final localVisit = SiteVisit(
        id: '1',
        status: 'assigned',
        assignedTo: 'user1',
      );

      final serverVisit = SiteVisit(
        id: '1',
        status: 'available',
        assignedTo: null,
      );

      final result = ConflictResolutionService.resolveSiteVisitConflict(
        localVisit: localVisit,
        serverVisit: serverVisit,
      );

      expect(result.status, equals('assigned'));
      expect(result.assignedTo, equals('user1'));
    });

    test('resolveSiteVisitConflict should resolve assignment conflicts using server data', () {
      final localVisit = SiteVisit(
        id: '1',
        status: 'assigned',
        assignedTo: 'user1',
      );

      final serverVisit = SiteVisit(
        id: '1',
        status: 'assigned',
        assignedTo: 'user2',
      );

      final result = ConflictResolutionService.resolveSiteVisitConflict(
        localVisit: localVisit,
        serverVisit: serverVisit,
      );

      expect(result.assignedTo, equals('user2'));
    });

    test('mergeMetadata should properly merge complex data structures', () {
      final local = {
        'tags': ['tag1', 'tag2'],
        'counts': {'visits': 5},
        'simple': 'local',
      };

      final server = {
        'tags': ['tag2', 'tag3'],
        'counts': {'reviews': 3},
        'simple': 'server',
      };

      final merged = ConflictResolutionService.mergeMetadata(local, server);

      expect(merged['tags'], containsAll(['tag1', 'tag2', 'tag3']));
      expect((merged['counts'] as Map)['visits'], equals(5));
      expect((merged['counts'] as Map)['reviews'], equals(3));
      expect(merged['simple'], equals('server'));
    });
  });
}