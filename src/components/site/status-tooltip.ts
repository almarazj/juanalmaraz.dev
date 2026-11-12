export type Point = [number, number];

export const withinIntent = (pointer: Point, center: Point, radius = 32): boolean =>
  Math.hypot(pointer[0] - center[0], pointer[1] - center[1]) <= radius;

export function placeTooltip(
  pointer: Point,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  offset = 16,
): Point {
  const x = pointer[0] + offset + size.width > viewport.width ? pointer[0] - offset - size.width : pointer[0] + offset;
  const y = pointer[1] + offset + size.height > viewport.height ? pointer[1] - offset - size.height : pointer[1] + offset;
  return [Math.max(0, x), Math.max(0, y)];
}
