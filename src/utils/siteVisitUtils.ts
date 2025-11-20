
export const getStatusColor = (status?: string | null, dueDate?: string | null): string => {
  const s = (status ?? "").trim();
  
  // Check if the site visit is overdue
  if (isOverdue(dueDate, status)) {
    return "bg-red-100 text-red-800 border-red-300 border";
  }
  
  switch (s) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "inProgress":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "assigned":
      return "bg-purple-100 text-purple-800";
    case "permitVerified":
      return "bg-indigo-100 text-indigo-800";
    case "canceled":
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export const getStatusLabel = (status?: string | null, dueDate?: string | null): string => {
  const s = (status ?? "").trim();
  
  // Check if the site visit is overdue
  if (isOverdue(dueDate, status)) {
    const daysOverdue = getDaysOverdue(dueDate, status);
    return `Overdue (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''})`;
  }
  
  switch (s) {
    case "pending":
      return "Pending";
    case "inProgress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "assigned":
      return "Assigned";
    case "permitVerified":
      return "Permit Verified";
    case "canceled":
    case "cancelled":
      return "Canceled";
    default:
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
  }
};

// Check if a site visit is overdue based on its due date
export const isOverdue = (dueDate?: string | null, status?: string | null): boolean => {
  if (!dueDate || status === 'completed' || status === 'cancelled' || status === 'canceled') {
    return false;
  }
  
  try {
    const due = new Date(dueDate);
    const now = new Date();
    
    // Set time to start of day for accurate comparison
    due.setHours(23, 59, 59, 999);
    now.setHours(0, 0, 0, 0);
    
    return due < now;
  } catch {
    return false;
  }
};

// Get the number of days overdue (returns 0 if not overdue)
export const getDaysOverdue = (dueDate?: string | null, status?: string | null): number => {
  if (!isOverdue(dueDate, status)) {
    return 0;
  }
  
  try {
    const due = new Date(dueDate!);
    const now = new Date();
    
    // Calculate difference in days
    const diffTime = now.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  } catch {
    return 0;
  }
};

export const getStatusDescription = (
  status?: string | null,
  permitDetails?: { federal: boolean; state: boolean; locality: boolean }
): string => {
  const s = (status ?? "").trim();
  switch (s) {
    case "pending":
      if (permitDetails) {
        const missingPermits = [];
        if (!permitDetails.federal) missingPermits.push("Federal");
        if (!permitDetails.state) missingPermits.push("State");
        if (!permitDetails.locality) missingPermits.push("Local");
        if (missingPermits.length > 0) {
          return `Site visit pending approval - Requires ${missingPermits.join(", ")} permit verification. Please follow up with relevant authorities.`;
        }
      }
      return "Visit pending allocation to field team member. Awaiting supervisor review and assignment.";
    case "inProgress":
      return "Field team actively conducting site assessment. Real-time data collection and verification in progress.";
    case "completed":
      return "All site visit objectives achieved. Documentation and findings have been submitted for review.";
    case "assigned":
      return "Field team member designated. Preparation for site visit initiation underway.";
    case "permitVerified":
      return "All required permits validated. Ready for field team deployment and site assessment.";
    case "canceled":
    case "cancelled":
      return "Site visit terminated. Please check visit history for cancellation details and next steps.";
    default:
      return "Status information unavailable. Please contact your supervisor for details.";
  }
};
