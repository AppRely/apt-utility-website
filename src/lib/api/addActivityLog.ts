const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export async function addActivityLog(payload: any) {
  const res = await fetch(`${API_BASE}/api/v1/videos/${payload.videoId}/add-activity-log/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Failed to add activity log");
  }

  return res.json();
}
