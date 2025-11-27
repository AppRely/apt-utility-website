
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getFrameData = async (videoId: number, frameNumber: number) => {
  console.log("Frame Number:", frameNumber, "VideoID:", videoId);

  const response = await fetch(`${API_BASE}/api/v1/frame?videoId=${videoId}&frame=${frameNumber}`);
  if (!response.ok){
    console.error("API failed:", videoId, frameNumber);
    throw new Error("Failed to fetch frame data");
  }
  return response.json();
};