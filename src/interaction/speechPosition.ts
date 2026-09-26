export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function positionSpeechWindow(creature: Bounds, bubble: Pick<Bounds, "width" | "height">, workArea: Bounds): { x: number; y: number } {
  const gap = 8;
  const maxX = workArea.x + workArea.width - bubble.width;
  const maxY = workArea.y + workArea.height - bubble.height;
  const centeredX = creature.x + creature.width / 2 - bubble.width / 2;
  const aboveY = creature.y - bubble.height - gap;
  const hasRoomAbove = aboveY >= workArea.y;
  const proposedY = hasRoomAbove ? aboveY : creature.y + creature.height + gap;

  return {
    x: Math.round(Math.max(workArea.x, Math.min(centeredX, maxX))),
    y: Math.round(Math.max(workArea.y, Math.min(proposedY, maxY)))
  };
}
