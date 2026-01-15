enum VisitStatus {
  pending,
  available,
  assigned,
  inProgress,
  completed,
  rejected,
  cancelled,
}

extension VisitStatusExtension on VisitStatus {
  String get label {
    switch (this) {
      case VisitStatus.pending:
        return 'Pending';
      case VisitStatus.available:
        return 'Available';
      case VisitStatus.assigned:
        return 'Assigned';
      case VisitStatus.inProgress:
        return 'In Progress';
      case VisitStatus.completed:
        return 'Completed';
      case VisitStatus.rejected:
        return 'Rejected';
      case VisitStatus.cancelled:
        return 'Cancelled';
    }
  }
}

VisitStatus visitStatusFromString(String status) {
  switch (status.toLowerCase()) {
    case 'pending':
      return VisitStatus.pending;
    case 'available':
    case 'dispatched': // Map dispatched to available
      return VisitStatus.available;
    case 'assigned':
    case 'accepted': // Map accepted to assigned
    case 'accept':
      return VisitStatus.assigned;
    case 'in_progress':
    case 'inprogress':
      return VisitStatus.inProgress;
    case 'completed':
      return VisitStatus.completed;
    case 'rejected':
      return VisitStatus.rejected;
    case 'cancelled':
      return VisitStatus.cancelled;
    default:
      return VisitStatus.pending;
  }
}
