import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:archive/archive.dart';
import 'package:excel/excel.dart' as xls;
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

class ExcelPreviewWidget extends StatefulWidget {
  final String filePath;

  const ExcelPreviewWidget({super.key, required this.filePath});

  @override
  State<ExcelPreviewWidget> createState() => _ExcelPreviewWidgetState();
}

class _ExcelPreviewWidgetState extends State<ExcelPreviewWidget> {
  xls.Excel? _excel;
  String? _selectedSheet;
  int _page = 0;
  int _rowsPerPage = 100;
  static const int _maxCols = 30;
  bool _loading = true;
  String? _error;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadExcel();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _loadExcel() async {
    try {
      final bytes = kIsWeb
          ? await _readFileAsBytesWeb(widget.filePath)
          : File(widget.filePath).readAsBytesSync();

      final excel = xls.Excel.decodeBytes(bytes);
      if (excel.tables.isEmpty) {
        setState(() {
          _error = 'Excel file contains no sheets';
          _loading = false;
        });
        return;
      }

      setState(() {
        _excel = excel;
        _selectedSheet = excel.tables.keys.first;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load Excel: $e';
        _loading = false;
      });
    }
  }

  Future<List<int>> _readFileAsBytesWeb(String filePath) async {
    // For web, we need to handle file reading differently
    // Since the MMP service doesn't cache on web, we might need to download fresh
    // For now, try to read as a regular file and handle the error gracefully
    try {
      final file = File(filePath);
      return await file.readAsBytes();
    } catch (e) {
      throw Exception('Web file reading not supported. Please use external viewer.');
    }
  }

  void _changeSheet(String? sheet) {
    if (sheet == null) return;
    setState(() {
      _selectedSheet = sheet;
      _page = 0;
      _searchQuery = '';
      _searchController.clear();
    });
  }

  void _nextPage() {
    setState(() => _page += 1);
  }

  void _prevPage() {
    if (_page == 0) return;
    setState(() => _page -= 1);
  }

  Future<void> _exportCurrentSheetToCSV({bool currentPageOnly = false}) async {
    if (_excel == null || _selectedSheet == null) return;
    final table = _excel!.tables[_selectedSheet];
    if (table == null) return;
    final rows = _filteredRows(table.rows);

    final start = currentPageOnly ? _page * _rowsPerPage : 0;
    final endExclusive = currentPageOnly ? start + _rowsPerPage : rows.length;
    final safeEnd = math.min(endExclusive, rows.length);
    final slice =
        rows.sublist(start >= rows.length ? rows.length : start, safeEnd);

    final buffer = StringBuffer();
    for (final row in slice) {
      final values = row
          .map((cell) => _escapeCsv((cell?.value ?? '').toString()))
          .join(',');
      buffer.writeln(values);
    }

    final tempDir = await getTemporaryDirectory();
    final fileName =
        '${_selectedSheet}_${currentPageOnly ? 'page_${_page + 1}' : 'full'}.csv';
    final outFile = File('${tempDir.path}/$fileName');
    await outFile.writeAsString(buffer.toString());
    await Share.shareXFiles([XFile(outFile.path)], text: 'Export: $fileName');
  }

  Future<void> _exportAllSheetsZip() async {
    if (_excel == null) return;
    final archive = Archive();

    for (final entry in _excel!.tables.entries) {
      final sheetName = entry.key;
      final filteredRows = _filteredRows(entry.value.rows, applySearch: false);
      final csvBuffer = StringBuffer();
      for (final row in filteredRows) {
        final values = row
            .map((cell) => _escapeCsv((cell?.value ?? '').toString()))
            .join(',');
        csvBuffer.writeln(values);
      }
      archive.addFile(ArchiveFile(
        '$sheetName.csv',
        csvBuffer.length,
        csvBuffer.toString().codeUnits,
      ));
    }

    final encoder = ZipEncoder();
    final zipped = encoder.encode(archive);
    if (zipped == null) return;

    final tempDir = await getTemporaryDirectory();
    final zipPath = '${tempDir.path}/excel_export_all_sheets.zip';
    final outFile = File(zipPath);
    await outFile.writeAsBytes(zipped);
    await Share.shareXFiles([XFile(zipPath)], text: 'Exported all sheets');
  }

  List<List<xls.Data?>> _filteredRows(List<List<xls.Data?>> rows,
      {bool applySearch = true}) {
    if (!applySearch || _searchQuery.isEmpty) return rows;
    final term = _searchQuery.toLowerCase();
    return rows.where((row) {
      for (final cell in row) {
        final value = cell?.value?.toString();
        if (value != null && value.toLowerCase().contains(term)) {
          return true;
        }
      }
      return false;
    }).toList();
  }

  void _updatePageSize(int size) {
    setState(() {
      _rowsPerPage = size;
      _page = 0;
    });
  }

  void _onSearchChanged(String value) {
    setState(() {
      _searchQuery = value.trim();
      _page = 0;
    });
  }

  String _escapeCsv(String value) {
    if (value.contains(',') || value.contains('"') || value.contains('\n')) {
      final escaped = value.replaceAll('"', '""');
      return '"$escaped"';
    }
    return value;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Text(
          _error!,
          style: const TextStyle(color: Colors.redAccent),
        ),
      );
    }

    final excel = _excel!;
    final table = excel.tables[_selectedSheet];
    if (table == null) {
      return const Center(child: Text('Selected sheet not found'));
    }

    final allRows = _filteredRows(table.rows);
    final totalPages = math.max(1, (allRows.length / _rowsPerPage).ceil());
    final currentPage = _page.clamp(0, totalPages - 1);
    final startIndex = currentPage * _rowsPerPage;
    final endIndex = math.min(startIndex + _rowsPerPage, allRows.length);
    final visibleRows = allRows.sublist(startIndex, endIndex);

    final colCount =
        visibleRows.fold<int>(0, (prev, row) => row.length > prev ? row.length : prev);
    final effectiveCols = math.min(colCount, _maxCols);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: DropdownButton<String>(
                      value: _selectedSheet,
                      isExpanded: true,
                      onChanged: _changeSheet,
                      items: excel.tables.keys
                          .map(
                            (sheetName) => DropdownMenuItem(
                              value: sheetName,
                              child:
                                  Text(sheetName, overflow: TextOverflow.ellipsis),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  DropdownButton<int>(
                    value: _rowsPerPage,
                    onChanged: (value) => value != null ? _updatePageSize(value) : null,
                    items: const [50, 100, 200, 500]
                        .map(
                          (count) => DropdownMenuItem(
                            value: count,
                            child: Text('Rows: $count'),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    tooltip: 'Prev page',
                    onPressed: currentPage == 0 ? null : _prevPage,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text('${currentPage + 1}/$totalPages'),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: (currentPage + 1) >= totalPages ? null : _nextPage,
                    icon: const Icon(Icons.chevron_right),
                  ),
                  const SizedBox(width: 8),
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.share),
                    tooltip: 'Export / Share',
                    onSelected: (value) {
                      if (value == 'page') {
                        _exportCurrentSheetToCSV(currentPageOnly: true);
                      } else if (value == 'full') {
                        _exportCurrentSheetToCSV();
                      } else if (value == 'all_sheets') {
                        _exportAllSheetsZip();
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(
                        value: 'page',
                        child: Text('Export current page to CSV'),
                      ),
                      PopupMenuItem(
                        value: 'full',
                        child: Text('Export full sheet to CSV'),
                      ),
                      PopupMenuItem(
                        value: 'all_sheets',
                        child: Text('Export ALL sheets (ZIP)'),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'Search cells in sheet...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  isDense: true,
                ),
                onChanged: _onSearchChanged,
              ),
              if (_searchQuery.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Matches: ${allRows.length} (filtered)',
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: _buildHeaderRow(effectiveCols),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ConstrainedBox(
              constraints: BoxConstraints(minWidth: effectiveCols * 120),
              child: ListView.builder(
                itemCount: visibleRows.length,
                shrinkWrap: true,
                physics: const ClampingScrollPhysics(),
                itemBuilder: (context, index) =>
                    _buildDataRow(visibleRows[index], effectiveCols),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeaderRow(int cols) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: Colors.blueGrey.shade50,
        border: const Border(bottom: BorderSide(color: Colors.grey, width: 0.5)),
      ),
      child: Row(
        children: List.generate(
          cols,
          (index) => Container(
            width: 120,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Text('Col ${index + 1}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
      ),
    );
  }

  Widget _buildDataRow(List<xls.Data?> row, int cols) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.black12, width: 0.5)),
      ),
      child: Row(
        children: List.generate(cols, (index) {
          final cell = index < row.length ? row[index] : null;
          final style = cell?.cellStyle;
          final text = cell?.value?.toString() ?? '';
          final isBold = style?.isBold == true;
          final bgHex = style?.backgroundColor.colorHex;

          Color? bgColor;
          if (bgHex != null && bgHex.isNotEmpty && bgHex.toLowerCase() != 'none') {
            final sanitized = bgHex.replaceAll('#', '');
            final sixChar = sanitized.length >= 6
                ? sanitized.substring(sanitized.length - 6)
                : sanitized;
            try {
              bgColor = Color(int.parse('0xFF$sixChar'));
            } catch (_) {
              bgColor = null;
            }
          }

          return Container(
            width: 120,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            color: bgColor,
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
                color: bgColor != null ? _idealTextColor(bgColor) : Colors.black87,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          );
        }),
      ),
    );
  }

  Color _idealTextColor(Color background) {
    final luminance =
        (0.299 * background.red + 0.587 * background.green + 0.114 * background.blue) /
            255;
    return luminance > 0.6 ? Colors.black : Colors.white;
  }
}
