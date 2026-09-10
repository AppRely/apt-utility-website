const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type BreakObjectsResult = {
  status: string;
  message: string;
  data: {
    old_object_id: number;
    new_object_id: number;
    break_type: 'before' | 'after';
    old_range: string;
    new_range: string;
    rows_updated_in_frame_object: number;
  };
};

export const breakObjects = async (
  projectId: number,
  formData: FormData,
  breakType: 'before' | 'after'   // <-- new parameter
): Promise<BreakObjectsResult> => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/objects/break/?break_type=${breakType}`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error("Failed to break object");
  }

  return res.json();
};
