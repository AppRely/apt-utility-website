const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const getUniqueIds = async (projectId: number) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/unique-ids/`
  );

  if (!res.ok) {
    throw new Error("Failed to fetch unique IDs");
  }

  return res.json();
};