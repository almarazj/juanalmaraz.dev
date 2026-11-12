const SEND_BACK_PX = 90;

export const cycle = <T>(order: T[]): T[] => order.slice(1).concat(order.slice(0, 1));

export const shouldSendBack = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > SEND_BACK_PX;
