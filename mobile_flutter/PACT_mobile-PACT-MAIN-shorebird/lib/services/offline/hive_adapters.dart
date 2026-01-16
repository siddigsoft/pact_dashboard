import 'package:hive/hive.dart';
import 'models.dart';

class PendingSyncActionAdapter extends TypeAdapter<PendingSyncAction> {
  @override
  final int typeId = 0;

  @override
  PendingSyncAction read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return PendingSyncAction(
      id: fields[0] as String,
      type: fields[1] as String,
      payload: (fields[2] as Map).cast<String, dynamic>(),
      timestamp: fields[3] as int,
      retries: fields[4] as int? ?? 0,
      status: fields[5] as String? ?? 'pending',
      errorMessage: fields[6] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, PendingSyncAction obj) {
    writer
      ..writeByte(7)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.type)
      ..writeByte(2)
      ..write(obj.payload)
      ..writeByte(3)
      ..write(obj.timestamp)
      ..writeByte(4)
      ..write(obj.retries)
      ..writeByte(5)
      ..write(obj.status)
      ..writeByte(6)
      ..write(obj.errorMessage);
  }
}

class OfflineSiteVisitAdapter extends TypeAdapter<OfflineSiteVisit> {
  @override
  final int typeId = 1;

  @override
  OfflineSiteVisit read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return OfflineSiteVisit(
      id: fields[0] as String,
      siteEntryId: fields[1] as String,
      siteName: fields[2] as String,
      siteCode: fields[3] as String,
      state: fields[4] as String,
      locality: fields[5] as String,
      status: fields[6] as String,
      startedAt: fields[7] as DateTime,
      completedAt: fields[8] as DateTime?,
      startLocation: (fields[9] as Map?)?.cast<String, dynamic>(),
      endLocation: (fields[10] as Map?)?.cast<String, dynamic>(),
      photos: (fields[11] as List?)?.cast<String>(),
      notes: fields[12] as String?,
      synced: fields[13] as bool? ?? false,
      syncedAt: fields[14] as DateTime?,
    );
  }

  @override
  void write(BinaryWriter writer, OfflineSiteVisit obj) {
    writer
      ..writeByte(15)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.siteEntryId)
      ..writeByte(2)
      ..write(obj.siteName)
      ..writeByte(3)
      ..write(obj.siteCode)
      ..writeByte(4)
      ..write(obj.state)
      ..writeByte(5)
      ..write(obj.locality)
      ..writeByte(6)
      ..write(obj.status)
      ..writeByte(7)
      ..write(obj.startedAt)
      ..writeByte(8)
      ..write(obj.completedAt)
      ..writeByte(9)
      ..write(obj.startLocation)
      ..writeByte(10)
      ..write(obj.endLocation)
      ..writeByte(11)
      ..write(obj.photos)
      ..writeByte(12)
      ..write(obj.notes)
      ..writeByte(13)
      ..write(obj.synced)
      ..writeByte(14)
      ..write(obj.syncedAt);
  }
}

class CachedLocationAdapter extends TypeAdapter<CachedLocation> {
  @override
  final int typeId = 2;

  @override
  CachedLocation read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return CachedLocation(
      id: fields[0] as String,
      userId: fields[1] as String,
      lat: fields[2] as double,
      lng: fields[3] as double,
      accuracy: fields[4] as double?,
      timestamp: fields[5] as int,
      synced: fields[6] as bool? ?? false,
    );
  }

  @override
  void write(BinaryWriter writer, CachedLocation obj) {
    writer
      ..writeByte(7)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.userId)
      ..writeByte(2)
      ..write(obj.lat)
      ..writeByte(3)
      ..write(obj.lng)
      ..writeByte(4)
      ..write(obj.accuracy)
      ..writeByte(5)
      ..write(obj.timestamp)
      ..writeByte(6)
      ..write(obj.synced);
  }
}

class QueuedRequestAdapter extends TypeAdapter<QueuedRequest> {
  @override
  final int typeId = 3;

  @override
  QueuedRequest read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return QueuedRequest(
      id: fields[0] as String,
      url: fields[1] as String,
      method: fields[2] as String,
      data: (fields[3] as Map?)?.cast<String, dynamic>(),
      timestamp: fields[4] as int,
      retries: fields[5] as int? ?? 0,
      status: fields[6] as String? ?? 'pending',
      errorMessage: fields[7] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, QueuedRequest obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.url)
      ..writeByte(2)
      ..write(obj.method)
      ..writeByte(3)
      ..write(obj.data)
      ..writeByte(4)
      ..write(obj.timestamp)
      ..writeByte(5)
      ..write(obj.retries)
      ..writeByte(6)
      ..write(obj.status)
      ..writeByte(7)
      ..write(obj.errorMessage);
  }
}

class CachedItemAdapter extends TypeAdapter<CachedItem> {
  @override
  final int typeId = 4;

  @override
  CachedItem read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return CachedItem(
      key: fields[0] as String,
      data: (fields[1] as Map).cast<String, dynamic>(),
      cachedAt: fields[2] as int,
      expiresAt: fields[3] as int?,
      version: fields[4] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, CachedItem obj) {
    writer
      ..writeByte(5)
      ..writeByte(0)
      ..write(obj.key)
      ..writeByte(1)
      ..write(obj.data)
      ..writeByte(2)
      ..write(obj.cachedAt)
      ..writeByte(3)
      ..write(obj.expiresAt)
      ..writeByte(4)
      ..write(obj.version);
  }
}

void registerHiveAdapters() {
  if (!Hive.isAdapterRegistered(0)) {
    Hive.registerAdapter(PendingSyncActionAdapter());
  }
  if (!Hive.isAdapterRegistered(1)) {
    Hive.registerAdapter(OfflineSiteVisitAdapter());
  }
  if (!Hive.isAdapterRegistered(2)) {
    Hive.registerAdapter(CachedLocationAdapter());
  }
  if (!Hive.isAdapterRegistered(3)) {
    Hive.registerAdapter(QueuedRequestAdapter());
  }
  if (!Hive.isAdapterRegistered(4)) {
    Hive.registerAdapter(CachedItemAdapter());
  }
}
