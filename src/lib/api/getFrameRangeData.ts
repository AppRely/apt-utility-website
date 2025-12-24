
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getFrameRangeData = async (projectId: number, startFrame: number, endFrame: number) => {
  console.log("ProjectID:", projectId, "Sending chunk:", startFrame, endFrame);
  const url = `${API_BASE}/api/v1/videos/${projectId}/frame-object-range/?start=${startFrame}&end=${endFrame}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok){
    console.error("API failed for frames:", projectId, startFrame, endFrame);
    throw new Error("Failed to fetch frames data");
  }
  return response.json();
};