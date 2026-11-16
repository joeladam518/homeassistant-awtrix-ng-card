/** A frame from `<prefix>/state/screen`: one 0xRRGGBB number per pixel, row by row. */
export interface ScreenFrame {
  width: number;
  height: number;
  pixels: number[];
}

const CELL = 10;
const GAP = 2;

/**
 * Draws the clock's display as a grid of LEDs.
 * With no frame yet (or the display off) it draws dark LEDs at the clock's size.
 */
export function drawScreen(
  canvas: HTMLCanvasElement,
  frame: ScreenFrame | null,
  { off, big }: { off: boolean; big: boolean },
): void {
  const w = frame?.width || (big ? 52 : 32);
  const h = frame?.height || (big ? 16 : 8);
  if (canvas.width !== w * CELL || canvas.height !== h * CELL) {
    canvas.width = w * CELL;
    canvas.height = h * CELL;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const px = frame?.pixels;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = !off && px ? px[y * w + x]! | 0 : 0;
      if (v) {
        let r = (v >> 16) & 255;
        let g = (v >> 8) & 255;
        let b = v & 255;
        // lift dim pixels so they read on a monitor like they do on the LEDs
        const m = Math.max(r, g, b);
        if (m > 0 && m < 140) {
          const k = 140 / m;
          r = Math.min(255, r * k);
          g = Math.min(255, g * k);
          b = Math.min(255, b * k);
        }
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      } else {
        ctx.fillStyle = "#161616";
      }
      ctx.fillRect(x * CELL + GAP / 2, y * CELL + GAP / 2, CELL - GAP, CELL - GAP);
    }
  }
}
