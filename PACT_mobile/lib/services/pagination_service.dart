import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Generic pagination state
class PaginationState<T> {
  final List<T> items;
  final int currentPage;
  final bool isLoading;
  final bool isError;
  final String? errorMessage;
  final bool hasMorePages;
  final int pageSize;

  PaginationState({
    this.items = const [],
    this.currentPage = 0,
    this.isLoading = false,
    this.isError = false,
    this.errorMessage,
    this.hasMorePages = true,
    this.pageSize = 20,
  });

  /// Create copy with modifications
  PaginationState<T> copyWith({
    List<T>? items,
    int? currentPage,
    bool? isLoading,
    bool? isError,
    String? errorMessage,
    bool? hasMorePages,
    int? pageSize,
  }) {
    return PaginationState<T>(
      items: items ?? this.items,
      currentPage: currentPage ?? this.currentPage,
      isLoading: isLoading ?? this.isLoading,
      isError: isError ?? this.isError,
      errorMessage: errorMessage ?? this.errorMessage,
      hasMorePages: hasMorePages ?? this.hasMorePages,
      pageSize: pageSize ?? this.pageSize,
    );
  }

  /// Check if at end of list
  bool get isAtEnd => !hasMorePages && !isLoading;

  /// Get total items loaded
  int get totalItems => items.length;
}

/// Generic pagination notifier
class PaginationNotifier<T> extends StateNotifier<PaginationState<T>> {
  final Future<List<T>> Function(int page, int pageSize) onFetchPage;
  final int pageSize;

  PaginationNotifier({required this.onFetchPage, this.pageSize = 20})
    : super(PaginationState<T>(pageSize: pageSize)) {
    _init();
  }

  /// Initialize with first page
  Future<void> _init() async {
    await loadNextPage();
  }

  /// Load next page
  Future<void> loadNextPage() async {
    if (state.isLoading || !state.hasMorePages) return;

    state = state.copyWith(isLoading: true, isError: false);

    try {
      final newItems = await onFetchPage(state.currentPage, state.pageSize);

      final hasMore = newItems.length == state.pageSize;
      final allItems = [...state.items, ...newItems];

      state = state.copyWith(
        items: allItems,
        currentPage: state.currentPage + 1,
        isLoading: false,
        hasMorePages: hasMore,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        isError: true,
        errorMessage: e.toString(),
      );
      debugPrint('[Pagination] Error loading page: $e');
    }
  }

  /// Refresh from beginning
  Future<void> refresh() async {
    state = PaginationState<T>(pageSize: pageSize);
    await loadNextPage();
  }

  /// Clear all items
  void clear() {
    state = PaginationState<T>(pageSize: pageSize);
  }
}

/// Pagination provider factory
StateNotifierProvider createPaginationProvider<T>({
  required Future<List<T>> Function(int page, int pageSize) onFetchPage,
  int pageSize = 20,
}) {
  return StateNotifierProvider<PaginationNotifier<T>, PaginationState<T>>((
    ref,
  ) {
    return PaginationNotifier<T>(onFetchPage: onFetchPage, pageSize: pageSize);
  });
}

/// Widget for paginated list view
class PaginatedListView<T> extends StatefulWidget {
  final PaginationState<T> state;
  final IndexedWidgetBuilder itemBuilder;
  final VoidCallback onLoadMore;
  final double loadMoreThreshold;
  final ScrollPhysics? scrollPhysics;
  final EdgeInsets? padding;
  final WidgetBuilder? emptyBuilder;
  final WidgetBuilder? loadingBuilder;
  final WidgetBuilder? errorBuilder;

  const PaginatedListView({
    super.key,
    required this.state,
    required this.itemBuilder,
    required this.onLoadMore,
    this.loadMoreThreshold = 0.8,
    this.scrollPhysics,
    this.padding,
    this.emptyBuilder,
    this.loadingBuilder,
    this.errorBuilder,
  });

  @override
  State<PaginatedListView<T>> createState() => _PaginatedListViewState<T>();
}

class _PaginatedListViewState<T> extends State<PaginatedListView<T>> {
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;

    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    final threshold = maxScroll * widget.loadMoreThreshold;

    if (currentScroll >= threshold &&
        !widget.state.isLoading &&
        widget.state.hasMorePages) {
      widget.onLoadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Empty state
    if (widget.state.items.isEmpty && !widget.state.isLoading) {
      if (widget.state.isError) {
        return widget.errorBuilder?.call(context) ??
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 48, color: Colors.red),
                  SizedBox(height: 16),
                  Text('Error: ${widget.state.errorMessage}'),
                ],
              ),
            );
      }

      return widget.emptyBuilder?.call(context) ??
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.inbox, size: 48, color: Colors.grey),
                SizedBox(height: 16),
                Text('No items'),
              ],
            ),
          );
    }

    return ListView.builder(
      controller: _scrollController,
      physics: widget.scrollPhysics,
      padding: widget.padding,
      itemCount:
          widget.state.items.length + (widget.state.hasMorePages ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == widget.state.items.length) {
          // Loading indicator at end
          return Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        return widget.itemBuilder(context, index);
      },
    );
  }
}

/// Horizontal paginated scroll
class PaginatedHorizontalScroll<T> extends StatefulWidget {
  final List<T> items;
  final IndexedWidgetBuilder itemBuilder;
  final double itemWidth;
  final VoidCallback? onLoadMore;
  final bool showLoadMore;

  const PaginatedHorizontalScroll({
    super.key,
    required this.items,
    required this.itemBuilder,
    required this.itemWidth,
    this.onLoadMore,
    this.showLoadMore = false,
  });

  @override
  State<PaginatedHorizontalScroll<T>> createState() =>
      _PaginatedHorizontalScrollState<T>();
}

class _PaginatedHorizontalScrollState<T>
    extends State<PaginatedHorizontalScroll<T>> {
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent * 0.9) {
      widget.onLoadMore?.call();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      controller: _scrollController,
      child: Row(
        children: [
          ...widget.items.asMap().entries.map((entry) {
            return SizedBox(
              width: widget.itemWidth,
              child: widget.itemBuilder(context, entry.key),
            );
          }),
          if (widget.showLoadMore)
            SizedBox(
              width: widget.itemWidth,
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Grid pagination widget
class PaginatedGridView<T> extends StatefulWidget {
  final PaginationState<T> state;
  final IndexedWidgetBuilder itemBuilder;
  final int crossAxisCount;
  final VoidCallback onLoadMore;
  final double? childAspectRatio;

  const PaginatedGridView({
    super.key,
    required this.state,
    required this.itemBuilder,
    required this.crossAxisCount,
    required this.onLoadMore,
    this.childAspectRatio,
  });

  @override
  State<PaginatedGridView<T>> createState() => _PaginatedGridViewState<T>();
}

class _PaginatedGridViewState<T> extends State<PaginatedGridView<T>> {
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent * 0.8) {
      widget.onLoadMore();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      controller: _scrollController,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: widget.crossAxisCount,
        childAspectRatio: widget.childAspectRatio ?? 1.0,
      ),
      itemCount:
          widget.state.items.length + (widget.state.hasMorePages ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == widget.state.items.length) {
          return Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }
        return widget.itemBuilder(context, index);
      },
    );
  }
}
