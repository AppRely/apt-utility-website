const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const getProjectList = async (page = 1, pageSize = 5) => {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(
    `${API_BASE}/api/v1/videos/project-list/?${params}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch project list");
  }

  return response.json();
};
