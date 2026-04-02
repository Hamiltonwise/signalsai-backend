import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";

interface ColorPickerProps {
  primaryColor: string | null;
  accentColor: string | null;
  onSelect: (colorString: string) => void;
}

/** Convert HSL (0-360, 0-1, 0-1) to hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function readPixelHex(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  if (pixel[3] === 0) return null;
  return `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
}

export default function ColorPicker({
  primaryColor,
  accentColor,
  onSelect,
}: ColorPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [indicatorPos, setIndicatorPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [indicatorColor, setIndicatorColor] = useState("#000000");

  // Draw color wheel on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 4;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw color wheel using conic gradient approach
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 1) * Math.PI) / 180;
      const endAngle = ((angle + 1) * Math.PI) / 180;

      // Draw concentric rings for saturation/lightness
      for (let r = 0; r <= radius; r += 2) {
        const saturation = r / radius;
        const lightness = 0.5;
        const color = hslToHex(angle, saturation, lightness);
        ctx.beginPath();
        ctx.arc(center, center, r, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Center white circle for lighter tones
    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      radius * 0.3,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }, []);

  /** Convert a client-space event to canvas pixel coords and CSS position. */
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const canvasX = Math.round(
        ((clientX - rect.left) / rect.width) * canvas.width,
      );
      const canvasY = Math.round(
        ((clientY - rect.top) / rect.height) * canvas.height,
      );
      // CSS position relative to the canvas element (for absolute positioning)
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      return { canvasX, canvasY, cssX, cssY };
    },
    [],
  );

  const pickColorAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const coords = getCanvasCoords(clientX, clientY);
      if (!coords) return;
      const hex = readPixelHex(canvas, coords.canvasX, coords.canvasY);
      if (!hex) return;
      setIndicatorPos({ x: coords.cssX, y: coords.cssY });
      setIndicatorColor(hex);
      onSelect(hex);
    },
    [getCanvasCoords, onSelect],
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsDragging(true);
      pickColorAt(e.clientX, e.clientY);
    },
    [pickColorAt],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      pickColorAt(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, pickColorAt]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsDragging(true);
      const touch = e.touches[0];
      pickColorAt(touch.clientX, touch.clientY);
    },
    [pickColorAt],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) pickColorAt(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isDragging, pickColorAt]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2">
        <div className="flex items-start gap-3">
          {/* Color wheel with draggable indicator */}
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <canvas
              ref={canvasRef}
              width={140}
              height={140}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              className="rounded-full cursor-crosshair"
              style={{ width: 140, height: 140 }}
            />
            {indicatorPos && (
              <div
                style={{
                  position: "absolute",
                  left: indicatorPos.x - 7,
                  top: indicatorPos.y - 7,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  border: `2px solid ${indicatorColor}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          {/* Preset swatches */}
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
              Theme Colors
            </p>
            {primaryColor && (
              <button
                onClick={() => onSelect(primaryColor)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors text-left"
              >
                <span
                  className="w-5 h-5 rounded-md border border-gray-200 shrink-0"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="text-xs text-gray-600 font-medium">
                  Primary
                </span>
              </button>
            )}
            {accentColor && (
              <button
                onClick={() => onSelect(accentColor)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors text-left"
              >
                <span
                  className="w-5 h-5 rounded-md border border-gray-200 shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-xs text-gray-600 font-medium">
                  Accent
                </span>
              </button>
            )}
            <p className="text-xs text-gray-300 mt-1">
              Click or drag to pick
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
