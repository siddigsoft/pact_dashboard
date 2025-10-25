
export const getStatusColor = (status?: string | null): string => {
  const s = (status ?? "").trim();
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

export const getStatusLabel = (status?: string | null): string => {
  const s = (status ?? "").trim();
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
