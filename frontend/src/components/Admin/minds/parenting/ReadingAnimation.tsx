import { motion } from "framer-motion";

/**
 * Brain-absorbing animation for the reading phase.
 * Abstract brain shape with particles flowing inward.
 * Distinct from CompileAnimation (neural network).
 */
export function ReadingAnimation() {
  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 80;
    return {
      id: i,
      startX: 100 + Math.cos(angle) * radius,
      startY: 80 + Math.sin(angle) * radius,
      endX: 100,
      endY: 80,
    };
  });

  return (
    <div className="flex flex-col items-center justify-center">
      <svg
        width="200"
        height="160"
        viewBox="0 0 200 160"
        className="overflow-visible"
      >
        <defs>
          <filter id="reading-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="brain-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D66853" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D66853" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center brain glow */}
        <motion.circle
          cx={100}
          cy={80}
          r={30}
          fill="url(#brain-gradient)"
          animate={{
            r: [28, 34, 28],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Brain icon - simple abstract shape */}
        <motion.circle
          cx={100}
          cy={80}
          r={16}
          fill="none"
          stroke="#D66853"
          strokeWidth={1.5}
          opacity={0.6}
          filter="url(#reading-glow)"
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Particles flowing inward */}
        {particles.map((p) => (
          <motion.circle
            key={p.id}
            cx={p.startX}
            cy={p.startY}
            r={3}
            fill="#D66853"
            filter="url(#reading-glow)"
            animate={{
              cx: [p.startX, p.endX],
              cy: [p.startY, p.endY],
              r: [3, 0],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: p.id * 0.3,
              ease: "easeIn",
            }}
          />
        ))}

        {/* Concentric ripples at center */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={`ripple-${i}`}
            cx={100}
            cy={80}
            r={16}
            fill="none"
            stroke="#D66853"
            strokeWidth={0.5}
            animate={{
              r: [16, 45],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1,
              ease: "easeOut",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
