/**
 * Trims long file names and preserves extension.
 * Example:
 *  very_long_video_name_example.mp4 → very_long_vide...mp4
 */
export const formatFileName = (
  name?: string,
  maxLength = 30
): string => {
  if (!name) return "-";
  if (name.length <= maxLength) return name;

  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) {
    return `${name.slice(0, maxLength)}...`;
  }

  const extension = name.slice(lastDot);
  const baseLength = maxLength - extension.length - 3;

  if (baseLength <= 0) {
    return `...${extension}`;
  }

  return `${name.slice(0, baseLength)}...${extension}`;
};
