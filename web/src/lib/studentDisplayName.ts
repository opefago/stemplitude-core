import type { StudentProfile } from "./api/students";

export function studentProfileDisplayName(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || "Learner";
}

export function studentProfileInitials(s: StudentProfile): string {
  const first = s.first_name?.charAt(0) ?? "";
  const last = s.last_name?.charAt(0) ?? "";
  if (first || last) return (first + last).toUpperCase();
  const base = studentProfileDisplayName(s);
  return base.slice(0, 2).toUpperCase();
}
