const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type NextBreakData = {
  object_id: number;
  break_start: number;
  break_end: number;
};

export class NextBreakError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "NextBreakError";
  }
}

export const getNextBreak = async (
  projectId: number,
  objectId: number,
  currentFrame: number,
): Promise<NextBreakData> => {
  const params = new URLSearchParams({
    object_id: String(objectId),
    current_frame: String(currentFrame),
  });
  const response = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/next-break/?${params.toString()}`,
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.data) {
    throw new NextBreakError(
      result?.message || "No next break was found",
      response.ok ? 404 : response.status,
    );
  }
  return result.data;
};
