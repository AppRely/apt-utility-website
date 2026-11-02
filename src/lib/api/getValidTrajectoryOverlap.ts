import { getFrameRangeData } from './getFrameRangeData';

type TrajectoryRange = { object_id: number; start_frame: number; end_frame: number };

export async function getValidTrajectoryOverlap(
  projectId: number,
  first: TrajectoryRange,
  second: TrajectoryRange,
): Promise<number> {
  const start = Math.max(first.start_frame, second.start_frame);
  const end = Math.min(first.end_frame, second.end_frame);
  if (start > end) return 0;

  const firstFrames = new Set<number>();
  const secondFrames = new Set<number>();
  for (let chunkStart = start; chunkStart <= end; chunkStart += 500) {
    const data = await getFrameRangeData(projectId, chunkStart, Math.min(chunkStart + 499, end));
    for (const object of data?.objects ?? []) {
      if (object.object_id !== first.object_id && object.object_id !== second.object_id) continue;
      for (const frame of object.frames ?? []) {
        if (!Number.isInteger(frame.frame_id) || !Array.isArray(frame.coordinates) || frame.coordinates.length === 0) continue;
        if (!frame.coordinates.every((point: unknown) => Array.isArray(point) && point.length >= 2 && point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))) continue;
        (object.object_id === first.object_id ? firstFrames : secondFrames).add(frame.frame_id);
      }
    }
  }

  let count = 0;
  for (const frame of firstFrames) if (secondFrames.has(frame)) count += 1;
  return count;
}
