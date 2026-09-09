const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const objectDelete = async (
  videoId: number,
  formData: FormData
) => {
  console.log("inside delete");
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${videoId}/objects/delete/?operation_type=single`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error("Failed to delete object");
  }

  return res.json();
};

export type BulkDeleteResult = {
  status: string;
  message: string;
  data: { deleted_object_ids: number[] };
};

export async function bulkDeleteObjects(projectId: number, objectIds: number[]): Promise<BulkDeleteResult> {
  const res = await fetch(`${API_BASE}/api/v1/videos/${projectId}/objects/delete/?operation_type=bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object_ids: objectIds }),
  });
  const result = await res.json();
  if (!res.ok || result.status !== "success") {
    throw new Error(result.message || "Failed to bulk delete objects");
  }
  const deletedIds = result.data?.deleted_object_ids ?? result.data?.["Deleted_object id"] ?? objectIds;
  return {
    ...result,
    data: { ...result.data, deleted_object_ids: deletedIds.map(Number) },
  };
}
