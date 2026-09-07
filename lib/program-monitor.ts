export const PROGRAM_WIDTH = 1920;
export const PROGRAM_HEIGHT = 1080;

export function programScale(containerWidth: number, containerHeight: number): number {
    if (containerWidth <= 0 || containerHeight <= 0) {
        return 0;
    }
    return Math.min(containerWidth / PROGRAM_WIDTH, containerHeight / PROGRAM_HEIGHT);
}
