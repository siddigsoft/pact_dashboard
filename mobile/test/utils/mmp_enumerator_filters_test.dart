import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/utils/mmp_enumerator_filters.dart';

void main() {
  group('pickHubStateRow', () {
    const centralDarfurRows = [
      {
        'id': 24,
        'hub_id': 'el-fasher-hub',
        'state_id': 'central-darfur',
        'state_name': 'Central Darfur',
      },
      {
        'id': 46,
        'hub_id': 'forchana-hub',
        'state_id': 'central-darfur',
        'state_name': 'Central Darfur',
      },
    ];

    test('prefers the row for the collector hub when state is mapped twice', () {
      final row = pickHubStateRow(
        centralDarfurRows,
        preferredHubId: 'forchana-hub',
      );

      expect(row, isNotNull);
      expect(row!['hub_id'], 'forchana-hub');
      expect(row['state_name'], 'Central Darfur');
    });

    test('returns a single row even when hub is unknown so maybeSingle is not required', () {
      final row = pickHubStateRow(centralDarfurRows, preferredHubId: null);

      expect(row, isNotNull);
      expect(row!['state_name'], 'Central Darfur');
    });

    test('returns null when there are no hub_states rows', () {
      expect(pickHubStateRow(const [], preferredHubId: 'forchana-hub'), isNull);
    });
  });

  group('resolveCollectorStateName', () {
    test('uses hub_states name when present', () {
      expect(
        resolveCollectorStateName(
          hubStateName: 'Central Darfur',
          stateId: 'central-darfur',
        ),
        'Central Darfur',
      );
    });

    test('falls back to static state name when hub_states lookup fails', () {
      expect(
        resolveCollectorStateName(hubStateName: null, stateId: 'central-darfur'),
        'Central Darfur',
      );
    });

    test('returns null only when neither hub_states nor state_id can resolve', () {
      expect(
        resolveCollectorStateName(hubStateName: null, stateId: null),
        isNull,
      );
    });
  });

  group('filterSitesBySelectedMmp', () {
    const julyId = 'f82565aa-daf4-482f-b7ec-881dbe2a36bc';
    const augustId = '89438c5d-4116-4959-aaa6-66f8ca409888';

    final mySites = [
      {'id': '1', 'mmp_file_id': julyId, 'status': 'accepted'},
      {'id': '2', 'mmp_file_id': julyId, 'status': 'accepted'},
      {'id': '3', 'mmp_file_id': julyId, 'status': 'accepted'},
      {'id': '4', 'mmp_file_id': julyId, 'status': 'Completed'},
      {'id': '5', 'mmp_file_id': julyId, 'status': 'Completed'},
      {'id': '6', 'mmp_file_id': julyId, 'status': 'Completed'},
      {'id': '7', 'mmp_file_id': julyId, 'status': 'Completed'},
      {'id': '8', 'mmp_file_id': augustId, 'status': 'Completed'},
    ];

    test('My Sites badge uses all sites when no MMP is selected', () {
      expect(filterSitesBySelectedMmp(mySites, null).length, 8);
    });

    test('My Sites badge matches sub-tab denominator when an MMP is selected', () {
      expect(filterSitesBySelectedMmp(mySites, julyId).length, 7);
    });

    test('extracts mmp id from nested mmp_files when mmp_file_id is missing', () {
      final sites = [
        {
          'id': 'nested',
          'mmp_files': {'id': julyId, 'name': 'July 2026 MMP'},
        },
      ];

      expect(extractMmpFileId(sites.first), julyId);
      expect(filterSitesBySelectedMmp(sites, julyId).length, 1);
    });
  });
}
