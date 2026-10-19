const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
export async function getBulkLinkCandidates(projectId: number, payload: { source_object_id: number; source_end_frame: number; search_start_frame: number; search_end_frame: number; limit?: number }) {
  const url = `${API_BASE}/api/v1/videos/${projectId}/bulk-link-candidates/`;
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, limit: payload.limit ?? 5 }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success") throw new Error(result?.message || "Failed to load bulk-link candidates");
  return result.data?.candidates ?? [];
}
