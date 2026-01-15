import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  Database? _database;

  factory DatabaseService() {
    return _instance;
  }

  DatabaseService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'pact_mobile.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createTables,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _createTables(Database db, int version) async {
    // Equipment table
    await db.execute('''
      CREATE TABLE equipment(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        lastMaintenance INTEGER,
        location TEXT,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Site visits table
    await db.execute('''
      CREATE TABLE site_visits(
        id TEXT PRIMARY KEY,
        siteId TEXT NOT NULL,
        assignedTo TEXT,
        status TEXT NOT NULL,
        scheduledDate INTEGER,
        latitude REAL,
        longitude REAL,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Staff movements table
    await db.execute('''
      CREATE TABLE staff_movements(
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Incident reports table
    await db.execute('''
      CREATE TABLE incidents(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT,
        severity TEXT NOT NULL,
        reportedBy TEXT NOT NULL,
        reportedAt INTEGER NOT NULL,
        status TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Helpline table
    await db.execute('''
      CREATE TABLE helplines(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        number TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        active INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Safety checklist table
    await db.execute('''
      CREATE TABLE safety_checklists(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        siteId TEXT NOT NULL,
        assignedTo TEXT,
        dueDate INTEGER,
        completed INTEGER NOT NULL DEFAULT 0,
        completedAt INTEGER,
        completedBy TEXT,
        synced INTEGER DEFAULT 0
      )
    ''');

    // Safety hub table
    await db.execute('''
      CREATE TABLE safety_hub(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        lastUpdated INTEGER NOT NULL,
        createdBy TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      )
    ''');

    // MMP Files table
    await db.execute('''
      CREATE TABLE mmp_files(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        localPath TEXT NOT NULL,
        remotePath TEXT,
        mimeType TEXT,
        size INTEGER NOT NULL,
        dateModified INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      )
    ''');
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Handle database upgrades here
  }
}