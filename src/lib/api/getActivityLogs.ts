const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export async function getActivityLogs(videoId: number) {
  const res = await fetch(`${API_BASE}/api/v1/videos/activity/logs/?video_id=${videoId}`);

  if (!res.ok) {
    throw new Error("Failed to fetch activity logs");
  }

  return res.json();
}
