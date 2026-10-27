export function getAnimalFocus(
  coordinates: number[][],
  view: { width: number; height: number; scale: number; offsetX: number; offsetY: number; bboxScale: number },
) {
  const points = coordinates.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!points.length || view.width <= 0 || view.height <= 0 || view.scale <= 0) return null;
  const xs = points.map(([x]) => view.offsetX + x * view.scale);
  const ys = points.map(([, y]) => view.offsetY + y * view.scale);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const boxWidth = Math.max(20, (right - left) * Math.max(1, view.bboxScale) + 10);
  const boxHeight = Math.max(20, (bottom - top) * Math.max(1, view.bboxScale) + 10);
  // Keep the animal centered while leaving enough surrounding context to see
  // nearby objects. The focus view is intentionally wider than auto-pan's
  // selected-object fit.
  const zoom = Math.max(1, Math.min(10, view.width * 0.15 / boxWidth, view.height * 0.15 / boxHeight));
  return {
    zoom,
    x: view.width / 2 - (left + right) / 2 * zoom,
    y: view.height / 2 - (top + bottom) / 2 * zoom,
  };
}
