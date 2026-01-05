const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getObjectData = async (projectId: number, objectId: number, frameNumber: number) => {
  
  const res = await fetch(
    `http://localhost:8002/api/v1/videos/${projectId}/unique-ids/${objectId}/?frame=${frameNumber}`
  );

  if (!res.ok) {
    throw new Error('Failed to fetch Objects Data');
  }

  return res.json();
};