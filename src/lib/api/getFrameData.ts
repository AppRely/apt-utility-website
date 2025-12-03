
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getFrameData = async (videoId: number, frameNumber: number) => {
  console.log("Frame Number:", frameNumber, "VideoID:", videoId);
  const url = `${API_BASE}/api/v1/videos/frame/?video=${videoId}&frame=${frameNumber}`;

  const response = await fetch(url, { method: "GET" });
  if (!response.ok){
    console.error(response.status);
    throw new Error("Failed to fetch frame data");
  }
  return response.json();
};