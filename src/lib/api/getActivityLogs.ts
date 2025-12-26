const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export async function getActivityLogs(projectId: number) {
  const res = await fetch(`${API_BASE}/api/v1/videos/activity/logs/?video_id=${projectId}`);

  if (!res.ok) {
    throw new Error("Failed to fetch activity logs");
  }

  return res.json();
}

⁠Suraj Chothe
6:55 PM
http://localhost:8002/api/v1/videos/activity/logs/?video_id=1
