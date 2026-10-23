import { getFrameRangeData } from '@/lib/api/getFrameRangeData';
import type { BulkLinkObject } from '@/lib/api/bulkLinkObjects';

export type BulkRectangle = { left: number; right: number; top: number; bottom: number };

export function coordinatesInsideRectangle(coordinates: number[][], rectangle: BulkRectangle) {
  return coordinates.length > 0 && coordinates.every(([x, y]) =>
    Number.isFinite(x) && Number.isFinite(y) && x >= rectangle.left && x <= rectangle.right &&
    y >= rectangle.top && y <= rectangle.bottom);
}

export async function getBulkTrajectoryRejectionReason(projectId: number, object: BulkLinkObject, rectangle: BulkRectangle) {
  // Verify the complete trajectory, including endpoints and frames skipped by playback.
  // Bound each response so long trajectories do not require one enormous request.
  let hasStart = false;
  let hasEnd = false;
  for (let start = object.start_frame; start <= object.end_frame; start += 500) {
    const data = await getFrameRangeData(projectId, start, Math.min(start + 499, object.end_frame));
    const track = data?.objects?.find((item: { object_id: number }) => item.object_id === object.object_id);
    if (!track?.frames?.length) return 'Trajectory data is incomplete or unavailable.';
    for (const frame of track.frames) {
      if (!coordinatesInsideRectangle(frame.coordinates ?? [], rectangle)) return 'Trajectory leaves the selection rectangle.';
      if (frame.frame_id === object.start_frame) hasStart = true;
      if (frame.frame_id === object.end_frame) hasEnd = true;
    }
  }
  return hasStart && hasEnd ? null : 'Trajectory data is incomplete or unavailable.';
}

export async function isBulkTrajectoryInside(projectId: number, object: BulkLinkObject, rectangle: BulkRectangle) {
  return (await getBulkTrajectoryRejectionReason(projectId, object, rectangle)) === null;
}
