
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

import pako from 'pako'; // npm install pako

export const getFrameRangeData = async (
  projectId: number,
  startFrame: number,
  endFrame: number
) => {
  console.log("ProjectID:", projectId, "Sending chunk:", startFrame, endFrame);
  const url = `${API_BASE}/api/v1/videos/${projectId}/frame-object-range-no-fallback/?start=${startFrame}&end=${endFrame}`;
  
  const response = await fetch(url, { method: "GET" });
  
  if (!response.ok) {
    console.error("API failed for frames:", projectId, startFrame, endFrame);
    throw new Error("Failed to fetch frames data");
  }
  
  const data = await response.json();
  
  
  if (data.compressed && data.data) {
    try {
      const binaryString = Buffer.from(data.data, 'hex').toString('binary');
      const decompressed = pako.inflate(new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0))));
      const result = JSON.parse(new TextDecoder().decode(decompressed));
     
      return result;
    } catch (error) {
      console.error("Decompression failed:", error);
      throw error;
    }
   }
  return data;
};
