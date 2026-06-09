const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const recalculateConfusion = async (
  projectId: number
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/confusion-table/?recalculate=true`,
    {
      method: "GET",
    }
  );

  if (!res.ok) {
    throw new Error("Failed to recalculate confusion");
  }

  return res.json();
};