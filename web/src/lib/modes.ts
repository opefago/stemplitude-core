export type Role =
  | "owner"
  | "admin"
  | "instructor"
  | "parent"
  | "student";

export type AgeGroup = "child" | "teen" | "adult" | null;

export type TenantUIMode = "auto" | "kids" | "explorer" | "pro";

export type UIMode =
  | "kids"
  | "explorer"
  | "pro"
  | "parent"
  | "instructor"
  | "admin";

const CHILD_MAX_AGE = 12;
const TEEN_MAX_AGE = 17;

export function ageGroupFromDob(dob: string | null): AgeGroup {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age <= CHILD_MAX_AGE) return "child";
  if (age <= TEEN_MAX_AGE) return "teen";
  return "adult";
}

function studentDefaultMode(ageGroup: AgeGroup): "kids" | "explorer" | "pro" {
  if (ageGroup === "child") return "kids";
  if (ageGroup === "teen") return "explorer";
  return "pro";
}

export function resolveUIMode(
  role: Role,
  ageGroup: AgeGroup,
  tenantUIMode?: TenantUIMode | null
): UIMode {
  if (role === "admin") return "admin";
  if (role === "owner") return "admin";
  if (role === "instructor") return "instructor";
  if (role === "parent") return "parent";

  if (role === "student") {
    if (tenantUIMode && tenantUIMode !== "auto") {
      return tenantUIMode;
    }
    return studentDefaultMode(ageGroup);
  }

  return studentDefaultMode(ageGroup);
}
