import confetti from "canvas-confetti";

interface ConfettiOptions {
  x?: number;
  y?: number;
}

export function fireConfetti(options: ConfettiOptions = {}) {
  const { x = 0.9, y = 0.1 } = options; // Default to top-right

  // Quick, subtle burst
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { x, y },
    colors: ["#EA580C", "#F97316", "#FB923C", "#22C55E", "#3B82F6"],
    ticks: 150,
    gravity: 1.2,
    scalar: 0.8,
    drift: 0,
  });
}
