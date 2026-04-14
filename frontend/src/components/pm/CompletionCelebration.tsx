import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// -----------------------------------------------------------------------------
// Event bus — lets any component trigger a celebration anchored to a task card
// without prop-drilling. Callers pass the task id so the component can find the
// card's bounding box itself via `data-task-id` on the rendered TaskCard.
// -----------------------------------------------------------------------------

type CelebrationListener = (taskId: string, rect: DOMRect) => void;
const listeners = new Set<CelebrationListener>();

// eslint-disable-next-line react-refresh/only-export-components
export function triggerCelebration(taskId: string, rect?: DOMRect) {
  // Resolve rect if not provided: look up a DOM node by data attribute
  let resolved: DOMRect | null = rect ?? null;
  if (!resolved) {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) resolved = (el as HTMLElement).getBoundingClientRect();
  }
  if (!resolved) return;
  for (const l of listeners) l(taskId, resolved);
}

// -----------------------------------------------------------------------------
// Component — renders any active celebrations as absolutely-positioned overlays
// anchored to the task-card rect at trigger time. pointer-events: none so the
// drag overlay is never blocked.
// -----------------------------------------------------------------------------

interface ActiveBurst {
  id: string;
  rect: DOMRect;
}

const PARTICLE_COUNT = 7;
const PARTICLE_COLORS = ["#D66853", "#3D8B40", "#D66853", "#3D8B40", "#D66853", "#3D8B40", "#D66853"];

export function CompletionCelebration() {
  const [bursts, setBursts] = useState<ActiveBurst[]>([]);

  useEffect(() => {
    const handler: CelebrationListener = (taskId, rect) => {
      const id = `${taskId}-${Date.now()}`;
      setBursts((prev) => [...prev, { id, rect }]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const remove = (id: string) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 45 /* under dnd overlay (typically 999) and modal */ }}
      aria-hidden
    >
      <AnimatePresence>
        {bursts.map((b) => (
          <Burst
            key={b.id}
            rect={b.rect}
            onDone={() => remove(b.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface BurstProps {
  rect: DOMRect;
  onDone: () => void;
}

function Burst({ rect, onDone }: BurstProps) {
  // Anchor to the rect at trigger time — the card may re-render/move, but the
  // celebration stays pinned to where it fired.
  const left = rect.left;
  const top = rect.top;
  const width = rect.width;
  const height = rect.height;
  const cx = left + width / 2;
  const cy = top + height / 2;

  return (
    <>
      {/* Green border pulse over the card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{
          opacity: [0, 1, 0],
          scale: [0.98, 1.02, 1.02],
          boxShadow: [
            "0 0 0 0 rgba(61,139,64,0)",
            "0 0 0 4px rgba(61,139,64,0.5)",
            "0 0 0 10px rgba(61,139,64,0)",
          ],
        }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        onAnimationComplete={onDone}
        className="absolute rounded-lg"
        style={{
          left,
          top,
          width,
          height,
          border: "2px solid rgba(61,139,64,0.7)",
        }}
      />

      {/* Particle burst */}
      {[...Array(PARTICLE_COUNT)].map((_, i) => {
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const distance = 36 + ((i * 7) % 14);
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
        return (
          <motion.div
            key={i}
            initial={{ x: cx - 3, y: cy - 3, opacity: 1, scale: 1 }}
            animate={{
              x: cx - 3 + dx,
              y: cy - 3 + dy,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          />
        );
      })}
    </>
  );
}
