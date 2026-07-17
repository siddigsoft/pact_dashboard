class StartTaskInput {
  final double estimatedHours;
  final int estimatedDays;
  final String? requirements;
  final List<Map<String, dynamic>> dependencies;

  const StartTaskInput({
    required this.estimatedHours,
    required this.estimatedDays,
    this.requirements,
    this.dependencies = const [],
  });
}
