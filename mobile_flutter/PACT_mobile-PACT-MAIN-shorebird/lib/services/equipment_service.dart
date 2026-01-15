// lib/services/equipment_service.dart

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/equipment.dart';

class EquipmentService {
  static const String _key = 'equipment_data';
  final SharedPreferences _prefs;

  EquipmentService(this._prefs);

  // Get all equipment
  List<Equipment> getAllEquipment() {
    final String? data = _prefs.getString(_key);
    if (data == null) return [];

    List<dynamic> jsonList = json.decode(data);
    return jsonList.map((json) => Equipment.fromJson(json)).toList();
  }

  // Add new equipment
  Future<bool> addEquipment(Equipment newEquipment) async {
    List<Equipment> equipmentList = getAllEquipment();
    equipmentList.add(newEquipment);
    return _saveEquipment(equipmentList);
  }

  // Update equipment
  Future<bool> updateEquipment(Equipment updatedEquipment) async {
    List<Equipment> equipment = getAllEquipment();
    final index = equipment.indexWhere((e) => e.id == updatedEquipment.id);
    if (index != -1) {
      equipment[index] = updatedEquipment;
      return _saveEquipment(equipment);
    }
    return false;
  }

  // Add inspection to equipment
  Future<bool> addInspection(String equipmentId, Inspection inspection) async {
    List<Equipment> equipment = getAllEquipment();
    final index = equipment.indexWhere((e) => e.id == equipmentId);
    if (index != -1) {
      var updatedEquipment = equipment[index];
      var inspections = updatedEquipment.inspections ?? [];
      inspections.add(inspection);
      equipment[index] = Equipment(
        id: updatedEquipment.id,
        name: updatedEquipment.name,
        status: updatedEquipment.status,
        isCheckedIn: updatedEquipment.isCheckedIn,
        nextMaintenance: updatedEquipment.nextMaintenance,
        inspections: inspections,
      );
      return _saveEquipment(equipment);
    }
    return false;
  }

  // Save equipment list to SharedPreferences
  Future<bool> _saveEquipment(List<Equipment> equipment) async {
    final String data = json.encode(equipment.map((e) => e.toJson()).toList());
    return _prefs.setString(_key, data);
  }

  // Filter equipment
  List<Equipment> filterEquipment({
    String? status,
    bool? isCheckedIn,
    String? searchQuery,
  }) {
    List<Equipment> equipment = getAllEquipment();

    if (status != null && status != 'All') {
      equipment = equipment.where((e) => e.status == status).toList();
    }

    if (isCheckedIn != null) {
      equipment = equipment.where((e) => e.isCheckedIn == isCheckedIn).toList();
    }

    if (searchQuery != null && searchQuery.isNotEmpty) {
      equipment = equipment
          .where(
            (e) => e.name.toLowerCase().contains(searchQuery.toLowerCase()),
          )
          .toList();
    }

    return equipment;
  }
}
