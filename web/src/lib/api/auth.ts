import { apiFetch } from "./client";
import { setTokens } from "../tokens";

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user?: {
    id: string;
    email?: string;
    first_name: string;
    last_name: string;
    role: string;
    is_super_admin?: boolean;
    sub_type: "user" | "student";
    tenant_id?: string;
    tenant_slug?: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });
  if (data.access_token && data.refresh_token) {
    setTokens(data.access_token, data.refresh_token);
  }
  return data;
}

export interface StudentLoginData {
  username?: string;
  email?: string;
  password: string;
  code?: string;
  tenant_slug?: string;
  tenant_code?: string;
}

export async function studentLogin(data: StudentLoginData): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/auth/student-login", {
    method: "POST",
    body: data,
    skipAuth: true,
  });
  if (res.access_token && res.refresh_token) {
    setTokens(res.access_token, res.refresh_token);
  }
  return res;
}

export interface OnboardData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  organization: {
    name: string;
    slug: string;
    type: string;
  };
}

export async function onboard(data: OnboardData): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/auth/onboard", {
    method: "POST",
    body: data,
    skipAuth: true,
  });
  if (res.access_token && res.refresh_token) {
    setTokens(res.access_token, res.refresh_token);
  }
  return res;
}

export interface RegisterData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export async function register(data: RegisterData): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/auth/register", {
    method: "POST",
    body: data,
    skipAuth: true,
  });
  if (res.access_token && res.refresh_token) {
    setTokens(res.access_token, res.refresh_token);
  }
  return res;
}

export interface MeResponse {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  sub_type: "user" | "student";
  is_active: boolean;
  is_super_admin?: boolean;
  global_role?: string;
  global_permissions?: string[];
  role?: string;
  tenant_id?: string;
  tenant_slug?: string;
  tenant_name?: string;
  resolved_ui_mode?: string;
  ui_mode_source?: string;
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/me");
}

export interface CheckAvailabilityResponse {
  available: boolean;
  message: string;
}

export async function checkEmail(email: string): Promise<CheckAvailabilityResponse> {
  return apiFetch<CheckAvailabilityResponse>(
    `/auth/check-email?email=${encodeURIComponent(email)}`,
    { skipAuth: true },
  );
}

export async function checkSlug(slug: string): Promise<CheckAvailabilityResponse> {
  return apiFetch<CheckAvailabilityResponse>(
    `/auth/check-slug?slug=${encodeURIComponent(slug)}`,
    { skipAuth: true },
  );
}
