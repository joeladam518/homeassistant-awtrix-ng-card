/** A clock colour (hex string, [r, g, b] or 0xRRGGBB number) as "#RRGGBB". */
export function toHex(c: unknown): string {
  if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) {
    return c.toUpperCase();
  }
  if (Array.isArray(c) && c.length >= 3) {
    return `#${c
      .slice(0, 3)
      .map((v: number) => (v | 0).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }
  if (typeof c === "number") {
    return `#${(c & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
  }
  return "#FFFFFF";
}

/** Seconds as "3d 4h", "4h 12m" or "12m". */
export function fmtUptime(s: number | null | undefined): string {
  if (s == null) {
    return "–";
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** An `mdi:wifi-strength-*` icon for a signal strength in dBm. */
export function wifiIcon(rssi: number | null | undefined): string {
  if (rssi == null) {
    return "mdi:wifi-off";
  }
  if (rssi > -55) {
    return "mdi:wifi-strength-4";
  }
  if (rssi > -65) {
    return "mdi:wifi-strength-3";
  }
  if (rssi > -75) {
    return "mdi:wifi-strength-2";
  }
  return "mdi:wifi-strength-1";
}
