/**
 * Faces, painted on a canvas laid out for the head sphere (equirectangular: the front of the
 * face is at u = 0.25). Big anime eyes — lash line with a flick at the corner, an iris that
 * darkens toward the top with two highlights — brows, a hint of nose, a small mouth, blush.
 * Two textures per face: open and closed, swapped for blinking.
 */
import * as THREE from "three";

export interface FaceSpec {
  skin: number;
  iris: number;
  brow: number;
  female: boolean;
  /** Stern (drawn-down brows, narrower eyes) for warriors. */
  stern: number;
  /** Red face (관우's 대추빛 얼굴). */
  flush?: number;
  scar?: boolean;
}

const W = 1024;
const H = 512;
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

function shade(c: number, k: number): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function paint(f: FaceSpec, closed: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = hex(f.skin);
  g.fillRect(0, 0, W, H);
  const px = W / 360; // pixels per degree
  const cx = W * 0.25;
  const eyeY = H * (96 / 180);
  const sep = 21 * px;
  const ew = (f.female ? 17 : 15) * px;
  const eh = (f.female ? 14 : 11.5) * px * (1 - f.stern * 0.25);
  if (f.flush) {
    const gr = g.createRadialGradient(cx, eyeY + 10 * px, 4, cx, eyeY + 10 * px, 60 * px);
    gr.addColorStop(0, shade(f.flush, 1));
    gr.addColorStop(1, hex(f.skin));
    g.fillStyle = gr;
    g.fillRect(cx - 70 * px, eyeY - 60 * px, 140 * px, 120 * px);
  }
  // Blush.
  for (const s of [-1, 1]) {
    const bx = cx + s * (sep + 4 * px);
    const by = eyeY + 12 * px;
    const gr = g.createRadialGradient(bx, by, 1, bx, by, 11 * px);
    gr.addColorStop(0, f.female ? "rgba(255,120,120,0.45)" : "rgba(230,120,100,0.18)");
    gr.addColorStop(1, "rgba(255,120,120,0)");
    g.fillStyle = gr;
    g.fillRect(bx - 12 * px, by - 12 * px, 24 * px, 24 * px);
  }
  for (const s of [-1, 1]) {
    const x = cx + s * sep;
    const y = eyeY;
    // Brow.
    g.strokeStyle = hex(f.brow);
    g.lineCap = "round";
    g.lineWidth = (f.female ? 1.6 : 2.6 + f.stern * 1.2) * px;
    g.beginPath();
    const tilt = f.stern * 5 * px;
    g.moveTo(x - s * ew * 0.55, y - eh * 1.25 - 4 * px + tilt * 0.2);
    g.quadraticCurveTo(x + s * ew * 0.1, y - eh * 1.55 - 5 * px + tilt * 0.4, x + s * ew * 0.75, y - eh * 1.2 - 2 * px - tilt * -0.6 + tilt);
    g.stroke();
    if (closed) {
      g.strokeStyle = "#2a1414";
      g.lineWidth = 2.2 * px;
      g.beginPath();
      g.moveTo(x - ew * 0.7, y + eh * 0.1);
      g.quadraticCurveTo(x, y + eh * 0.55, x + ew * 0.7, y + eh * 0.1);
      g.stroke();
      continue;
    }
    // White.
    g.fillStyle = "#fbf6f2";
    g.beginPath();
    g.ellipse(x, y, ew * 0.72, eh * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    // Iris: dark at the top, bright at the bottom.
    const ir = eh * 0.62;
    const gr = g.createLinearGradient(x, y - ir, x, y + ir);
    gr.addColorStop(0, shade(f.iris, 0.35));
    gr.addColorStop(0.55, shade(f.iris, 0.9));
    gr.addColorStop(1, shade(f.iris, 1.5));
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x + s * ew * 0.05, y + eh * 0.04, ir * 0.72, ir, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(f.iris, 0.2);
    g.beginPath();
    g.ellipse(x + s * ew * 0.05, y + eh * 0.02, ir * 0.3, ir * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    // Highlights.
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.ellipse(x + s * ew * 0.05 - ir * 0.28, y - ir * 0.38, ir * 0.22, ir * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.arc(x + s * ew * 0.05 + ir * 0.3, y + ir * 0.45, ir * 0.1, 0, Math.PI * 2);
    g.fill();
    // Upper lid shadow and the lash line with its flick.
    g.fillStyle = "rgba(60,30,30,0.25)";
    g.beginPath();
    g.ellipse(x, y - eh * 0.42, ew * 0.7, eh * 0.24, 0, Math.PI, 0);
    g.fill();
    g.strokeStyle = "#1e1012";
    g.lineWidth = (f.female ? 3.2 : 2.8) * px;
    g.beginPath();
    g.moveTo(x - s * ew * 0.8, y - eh * 0.05);
    g.quadraticCurveTo(x - s * ew * 0.1, y - eh * 0.95, x + s * ew * 0.78, y - eh * 0.3);
    g.lineTo(x + s * ew * (f.female ? 1.05 : 0.95), y - eh * (f.female ? 0.62 : 0.4));
    g.stroke();
    // Lower lash, faint.
    g.strokeStyle = "rgba(60,30,30,0.5)";
    g.lineWidth = 1 * px;
    g.beginPath();
    g.moveTo(x - s * ew * 0.4, y + eh * 0.6);
    g.quadraticCurveTo(x + s * ew * 0.2, y + eh * 0.72, x + s * ew * 0.65, y + eh * 0.35);
    g.stroke();
  }
  // Nose: a small shadow.
  g.strokeStyle = shade(f.skin, 0.72);
  g.lineWidth = 1.4 * px;
  g.beginPath();
  g.moveTo(cx + 1 * px, eyeY + 9 * px);
  g.lineTo(cx - 1.4 * px, eyeY + 14 * px);
  g.lineTo(cx + 1 * px, eyeY + 15 * px);
  g.stroke();
  // Mouth.
  const my = eyeY + 23 * px;
  g.strokeStyle = f.female ? "#9a3a3a" : "#6a3028";
  g.lineWidth = 1.6 * px;
  g.beginPath();
  if (f.stern > 0.5) {
    g.moveTo(cx - 5 * px, my);
    g.lineTo(cx + 5 * px, my);
  } else {
    g.moveTo(cx - 4.5 * px, my - 0.5 * px);
    g.quadraticCurveTo(cx, my + 2 * px, cx + 4.5 * px, my - 0.5 * px);
  }
  g.stroke();
  if (f.scar) {
    g.strokeStyle = "rgba(140,60,60,0.7)";
    g.lineWidth = 1.2 * px;
    g.beginPath();
    g.moveTo(cx + sep + 6 * px, eyeY - 10 * px);
    g.lineTo(cx + sep - 2 * px, eyeY + 12 * px);
    g.stroke();
  }
  // Ears are the sphere's sides: a touch darker.
  for (const u of [0, 0.5]) {
    g.fillStyle = shade(f.skin, 0.94);
    g.fillRect(W * u - 30, H * 0.4, 60, H * 0.2);
  }
  return c;
}

export interface Face {
  open: THREE.CanvasTexture;
  closed: THREE.CanvasTexture;
}

export function makeFace(f: FaceSpec): Face {
  const mk = (closed: boolean) => {
    const t = new THREE.CanvasTexture(paint(f, closed));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { open: mk(false), closed: mk(true) };
}
