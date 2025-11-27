
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getFrameRangeData = async (videoId: number, startFrame: number, endFrame: number) => {
  console.log("VideoID:", videoId, "Sending chunk:", startFrame, endFrame);

  const response = await fetch(`${API_BASE}/api/v1/chunk?videoId=${videoId}&start=${startFrame}&end=${endFrame}`);
  if (!response.ok){
    console.error("API failed for frames:", videoId, startFrame, endFrame);
    throw new Error("Failed to fetch frames data");
  }
  return response.json();
};