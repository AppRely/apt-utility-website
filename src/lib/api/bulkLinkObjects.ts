import { getActiveObjectRange } from './getObjectData';

export type BulkLinkObject = { object_id: number; start_frame: number; end_frame: number };
export type BulkLinkResult = {
  status: string;
  data: { master_object_id: number; start_frame: number; end_frame: number;
    merged_object_ids: number[]; deactivated_object_ids: number[] };
};

export async function bulkLinkObjects(projectId: number, objects: BulkLinkObject[]): Promise<BulkLinkResult> {
  if (objects.length < 2 || new Set(objects.map(obj => obj.object_id)).size !== objects.length) {
    throw new Error('Select at least two different objects.');
  }
  // Resolve current full lifecycles, never the video cache's loaded window.
  const ranges = await Promise.all(objects.map(obj =>
    getActiveObjectRange(projectId, obj.object_id, obj.start_frame)));
  const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/api/v1/videos/${projectId}/link-objects/`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'bulk_link', objects: ranges.map(({ object_id, start_frame, end_frame }) =>
      ({ object_id, start_frame, end_frame })) }),
  });
  const body = await response.json();
  if (!response.ok) {
    const overlaps = body.overlaps?.map((item: { object_1_id: number; object_2_id: number; overlap_start: number; overlap_end: number }) =>
      `ID ${item.object_1_id} / ID ${item.object_2_id}: frames ${item.overlap_start}–${item.overlap_end}`).join('; ');
    throw new Error(overlaps || (body.errors ? JSON.stringify(body.errors) : body.message) || 'Bulk linking failed.');
  }
  return body;
}
