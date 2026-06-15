// lib/api/getUniqueIdsData.ts
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export interface UniqueIdObject {
  id: number;
  start_frame: number;
  end_frame: number;
  N_frame: number;
  trk_len: number;
  start_coordinate: [number, number];
  end_coordinate: [number, number];
}

export interface UniqueIdsResponse {
  status: "success" | "error";
  data: {
    project_id: number | string; // backend may return string
    objects: UniqueIdObject[];
  };
}

export const getUniqueIdsData = async (
  projectId: number,
  startFrame: number,
  endFrame: number,
  signal?: AbortSignal
): Promise<UniqueIdsResponse | null> => {
  const url = `${API_BASE}/api/v1/videos/${projectId}/unique-ids/?start_frame=${startFrame}&end_frame=${endFrame}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch unique IDs: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[UniqueIds] Raw response:", data); // debug

    // Optional: validate shape
    if (data?.status !== "success" || !data?.data?.objects) {
      throw new Error("Invalid response structure");
    }

    return data as UniqueIdsResponse;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.log("Unique IDs request cancelled");
      return null;
    }
    console.error("[Unique IDs API Error]", err);
    throw err;
  }
};