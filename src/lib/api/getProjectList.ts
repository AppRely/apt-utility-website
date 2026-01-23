const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT; 
export const getProjectList = async () => {
  const response = await fetch(`${API_BASE}/api/v1/videos/project-list/`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch project list");
  }

  return response.json();
};
