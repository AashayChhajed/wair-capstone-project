// Small shared UI helpers.

export function formatSalary(min: number | null, max: number | null): string {
  if (min && max) {
    if (min >= 100000) return `₹${(min / 100000).toFixed(1)}L – ₹${(max / 100000).toFixed(1)}L`;
    return `₹${min.toLocaleString()} – ₹${max.toLocaleString()}`;
  }
  if (min) return `₹${min.toLocaleString()}+`;
  return "Salary not disclosed";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

export const STATUS_BADGE: Record<string, string> = {
  APPLIED: "badge-gray",
  UNDER_REVIEW: "badge-warning",
  SHORTLISTED: "badge-primary",
  INTERVIEW: "badge-primary",
  REJECTED: "badge-danger",
  HIRED: "badge-success",
};

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
};
