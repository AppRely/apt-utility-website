const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export async function getActivityLogs(projectId: number) {
  const res = await fetch(`${API_BASE}/api/v1/videos/activity/logs/?project_id=${projectId}`);

  if (!res.ok) {
    throw new Error("Failed to fetch activity logs");
  }

  return res.json();
}
