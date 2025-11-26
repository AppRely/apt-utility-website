
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getFrameData = async (frameNumber: number) => {
  console.log("Frame Number:", frameNumber);

  const response = await fetch(`${API_BASE}/api/v1/frame?frame=${frameNumber}`);
  if (!response.ok){
    console.error("API failed for frame:", frameNumber);
    throw new Error("Failed to fetch frame data");
  }
  return response.json();
};