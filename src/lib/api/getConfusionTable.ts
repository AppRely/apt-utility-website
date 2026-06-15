const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const getConfusionTable = async (
  projectId: number,
 
) => {

  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/confusion-table`
  );

  if (!res.ok) {
    throw new Error("Failed to fetch confusion table");
  }

  return res.json();
};