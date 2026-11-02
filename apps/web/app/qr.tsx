"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code drawn as one SVG path (D57), in ink on white with a quiet zone,
 * so phone cameras read it from across a room.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(value, { ecc: "M", border: 2 });
    let path = "";
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path, size };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="qr"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <title>{label}</title>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#20231e" />
    </svg>
  );
}
