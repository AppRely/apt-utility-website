const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const getConfusionStatus = async (
  projectId: number
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/confusion-table/?status=true`
  );

  if (!res.ok) {
    throw new Error("Failed to fetch confusion status");
  }

  return res.json();
};