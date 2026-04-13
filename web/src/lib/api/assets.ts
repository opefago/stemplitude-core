import { apiFetch } from "./client";
import { getAccessToken } from "../tokens";

export type AssetType =
  | "document"
  | "text"
  | "image"
  | "video"
  | "presentation"
  | "sheet";

export interface Asset {
  id: string;
  name: string;
  asset_type: AssetType | string;
  lab_type: string | null;
  owner_type: string;
  file_size: number | null;
  blob_key?: string;
  blob_url?: string | null;
  mime_type?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
}

export interface GlobalAsset {
  id: string;
  name: string;
  asset_type: string;
  lab_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface AssetLibraryResponse {
  own: Asset[];
  shared: Asset[];
  global_assets: GlobalAsset[];
}

export interface UploadAssetPayload {
  file: File;
  name: string;
  asset_type: AssetType;
  lab_type?: string;
  owner_type?: "self" | "tenant";
}

export function inferAssetTypeFromFile(file: File): AssetType {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    name.endsWith(".ppt") ||
    name.endsWith(".pptx") ||
    name.endsWith(".key")
  ) {
    return "presentation";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv")
  ) {
    return "sheet";
  }
  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".json") ||
    name.endsWith(".py") ||
    name.endsWith(".js") ||
    name.endsWith(".ts")
  ) {
    return "text";
  }
  return "document";
}

export async function getAssetLibrary(params: {
  asset_type?: string;
  lab_type?: string;
} = {}): Promise<AssetLibraryResponse> {
  const qs = new URLSearchParams();
  if (params.asset_type) qs.set("asset_type", params.asset_type);
  if (params.lab_type) qs.set("lab_type", params.lab_type);
  const query = qs.toString();
  return apiFetch<AssetLibraryResponse>(`/assets/library${query ? `?${query}` : ""}`);
}

export async function uploadAsset(payload: UploadAssetPayload): Promise<Asset> {
  const token = getAccessToken();
  const tenantId = localStorage.getItem("tenant_id");
  const form = new FormData();
  form.append("file", payload.file);
  form.append("name", payload.name);
  form.append("asset_type", payload.asset_type);
  if (payload.lab_type) form.append("lab_type", payload.lab_type);
  if (payload.owner_type) form.append("owner_type", payload.owner_type);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers["X-Tenant-ID"] = tenantId;

  const res = await fetch("/api/v1/assets/", {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to upload asset (${res.status})`);
  }
  return res.json() as Promise<Asset>;
}

export async function getAssetById(assetId: string, expiresIn = 3600): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${assetId}?expires_in=${expiresIn}`);
}

export async function getStudentSessionAssetById(
  classroomId: string,
  sessionId: string,
  assetId: string,
  expiresIn = 3600,
): Promise<Asset> {
  return apiFetch<Asset>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/assets/${assetId}?expires_in=${expiresIn}`,
  );
}
