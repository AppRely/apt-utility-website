// Candidate trajectories may begin this many frames after the selected object ends.
export const NEXT_LINK_START_THRESHOLD_FRAMES = 5;

// Maximum pixel distance between the source's last coordinate and candidate's
// first coordinate. Keep this configurable for videos with a different scale.
export const NEXT_LINK_MAX_DISTANCE_PX = 100;

export const getCoordinateDistance = (
  from?: [number, number],
  to?: [number, number],
) => {
  if (!from || !to) return null;
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
};
