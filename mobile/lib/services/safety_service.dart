import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/safety_checklist.dart';
import '../models/incident_report.dart';

class SafetyService {
  final SharedPreferences _prefs;
  static const String _checklistKey = 'safety_checklists';
  static const String _incidentKey = 'incident_reports';

  SafetyService(this._prefs);

  // Safety Checklist Methods
  Future<void> addChecklist(SafetyChecklist checklist) async {
    final checklists = await getChecklists();
    checklists.add(checklist);
    await _saveChecklists(checklists);
  }

  Future<List<SafetyChecklist>> getChecklists() async {
    final String? data = _prefs.getString(_checklistKey);
    if (data == null) return [];

    final List<dynamic> jsonList = json.decode(data);
    return jsonList.map((json) => SafetyChecklist.fromJson(json)).toList();
  }

  Future<void> _saveChecklists(List<SafetyChecklist> checklists) async {
    final String data = json.encode(
      checklists.map((checklist) => checklist.toJson()).toList(),
    );
    await _prefs.setString(_checklistKey, data);
  }

  // Incident Report Methods
  Future<void> addIncidentReport(IncidentReport report) async {
    final reports = await getIncidentReports();
    reports.add(report);
    await _saveIncidentReports(reports);
  }

  Future<List<IncidentReport>> getIncidentReports() async {
    final String? data = _prefs.getString(_incidentKey);
    if (data == null) return [];

    final List<dynamic> jsonList = json.decode(data);
    return jsonList.map((json) => IncidentReport.fromJson(json)).toList();
  }

  Future<void> _saveIncidentReports(List<IncidentReport> reports) async {
    final String data = json.encode(
      reports.map((report) => report.toJson()).toList(),
    );
    await _prefs.setString(_incidentKey, data);
  }
}
