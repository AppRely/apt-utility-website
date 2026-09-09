const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const getObjectData = async (projectId: number, objectId: number, frameNumber: number) => {
  
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/unique-ids/${objectId}/?frame=${frameNumber}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch Objects Data');
  }

  return res.json();
};

export const getActiveObjectRange = async (projectId: number, objectId: number, frameNumber: number) => {
  const response = await getObjectData(projectId, objectId, frameNumber);
  const track = response?.data;
  if (track?.is_active !== true || track.object_id !== objectId ||
      !Number.isInteger(track.start_frame) || !Number.isInteger(track.end_frame) ||
      track.start_frame > track.end_frame) {
    throw new Error(`Could not load the full active range for object ${objectId}. Refresh the selection and try again.`);
  }
  return track as { object_id: number; start_frame: number; end_frame: number; is_active: true };
};
