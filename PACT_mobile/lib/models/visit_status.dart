enum VisitStatus {
  pending,
  available,
  assigned,
  inProgress,
  completed,
  submitted,
  wfpConfirmed,
  notCovered,
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
      case VisitStatus.submitted:
        return 'Submitted';
      case VisitStatus.wfpConfirmed:
        return 'WFP Confirmed';
      case VisitStatus.notCovered:
        return 'Not Covered';
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
    case 'dispatched':
      return VisitStatus.available;
    case 'assigned':
    case 'accepted':
    case 'accept':
      return VisitStatus.assigned;
    case 'in_progress':
    case 'inprogress':
      return VisitStatus.inProgress;
    case 'completed':
      return VisitStatus.completed;
    case 'submitted':
      return VisitStatus.submitted;
    case 'wfp_confirmed':
    case 'wfpconfirmed':
      return VisitStatus.wfpConfirmed;
    case 'not_covered':
    case 'notcovered':
      return VisitStatus.notCovered;
    case 'rejected':
      return VisitStatus.rejected;
    case 'cancelled':
      return VisitStatus.cancelled;
    default:
      return VisitStatus.pending;
  }
}
