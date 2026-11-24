export const GRADE_GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "Warna", keys: [["temperature", "Temperatur"], ["tint", "Tint hijau–magenta"], ["yellow", "Yellow cast"], ["saturation", "Saturasi"], ["vibrance", "Vibrance"]] },
  { title: "Eksposur", keys: [["exposure", "Eksposur"], ["contrast", "Kontras"], ["highlights", "Highlights"], ["shadows", "Shadows"], ["whites", "Whites"], ["blacks", "Blacks"]] },
  { title: "Detail", keys: [["sharpness", "Ketajaman"]] },
];

export type Adjust = Record<string, number>;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Same math as backend/rs_grade.py so the export matches the preview.
export function applyGrade(src: ImageData, a: Adjust): ImageData {
  const v = (k: string) => (a[k] || 0) / 100;
  const ex = 2 ** (v("exposure") * 2), te = v("temperature"), ti = v("tint"), ye = v("yellow");
  const hl = v("highlights"), sh = v("shadows"), wh = v("whites"), bl = v("blacks");
  const con = 1 + v("contrast"), sat = 1 + v("saturation"), vib = v("vibrance");
  const out = new ImageData(src.width, src.height);
  const s = src.data, o = out.data;
  for (let i = 0; i < s.length; i += 4) {
    let r = (s[i] / 255) * ex + te * 0.1 + ye * 0.05;
    let g = (s[i + 1] / 255) * ex - ti * 0.08 + ye * 0.05;
    let b = (s[i + 2] / 255) * ex - te * 0.1 - ye * 0.1;
    let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const d = hl * 0.25 * smooth(0.5, 1, L) + sh * 0.25 * (1 - smooth(0, 0.5, L)) + wh * 0.15 * smooth(0.75, 1, L) + bl * 0.15 * (1 - smooth(0, 0.25, L));
    r = (r + d - 0.5) * con + 0.5;
    g = (g + d - 0.5) * con + 0.5;
    b = (b + d - 0.5) * con + 0.5;
    L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = L + (r - L) * sat;
    g = L + (g - L) * sat;
    b = L + (b - L) * sat;
    const m = Math.min(1, Math.max(0, Math.max(r, g, b) - Math.min(r, g, b)));
    const f = 1 + vib * (1 - m);
    o[i] = Math.min(1, Math.max(0, L + (r - L) * f)) * 255;
    o[i + 1] = Math.min(1, Math.max(0, L + (g - L) * f)) * 255;
    o[i + 2] = Math.min(1, Math.max(0, L + (b - L) * f)) * 255;
    o[i + 3] = 255;
  }
  const k = v("sharpness");
  if (k) sharpen(out, k);
  return out;
}

function sharpen(img: ImageData, k: number) {
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 4 + c;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[i + (dy * w + dx) * 4];
        data[i] = src[i] + k * (src[i] - sum / 9);
      }
    }
  }
}
