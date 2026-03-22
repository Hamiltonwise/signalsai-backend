import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_MESSAGES = [
  "Applying approved changes…",
  "Validating brain integrity…",
  "Creating new version…",
  "Publishing to production…",
  "Generating embeddings…",
  "Finalizing proposals…",
  "Almost there…",
];

// 12 nodes arranged in a neural-network-like pattern
const NODES = [
  // Input layer (left)
  { x: 80, y: 60 },
  { x: 80, y: 120 },
  { x: 80, y: 180 },
  { x: 80, y: 240 },
  // Hidden layer (center)
  { x: 200, y: 80 },
  { x: 200, y: 150 },
  { x: 200, y: 220 },
  // Output layer (right)
  { x: 320, y: 90 },
  { x: 320, y: 160 },
  { x: 320, y: 230 },
  // Core nodes (center brain)
  { x: 200, y: 30 },
  { x: 200, y: 270 },
];

// Connections between layers
const CONNECTIONS = [
  [0, 4], [0, 5], [0, 6],
  [1, 4], [1, 5], [1, 6],
  [2, 4], [2, 5], [2, 6],
  [3, 4], [3, 5], [3, 6],
  [4, 7], [4, 8], [4, 9],
  [5, 7], [5, 8], [5, 9],
  [6, 7], [6, 8], [6, 9],
  [4, 10], [5, 10], [6, 10],
  [4, 11], [5, 11], [6, 11],
];

export function CompileAnimation() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [activeConnection, setActiveConnection] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 3000);
    return () => clearInterval(msgInterval);
  }, []);

  useEffect(() => {
    const connInterval = setInterval(() => {
      setActiveConnection((i) => (i + 1) % CONNECTIONS.length);
    }, 200);
    return () => clearInterval(connInterval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Neural network SVG */}
      <div className="relative w-[400px] h-[300px] mb-8">
        <svg
          viewBox="0 0 400 300"
          className="w-full h-full"
          style={{ filter: "drop-shadow(0 0 20px rgba(214, 104, 83, 0.15))" }}
        >
          {/* Connections */}
          {CONNECTIONS.map(([from, to], i) => {
            const f = NODES[from];
            const t = NODES[to];
            const isActive =
              i === activeConnection ||
              i === (activeConnection + 1) % CONNECTIONS.length ||
              i === (activeConnection + 2) % CONNECTIONS.length;

            return (
              <motion.line
                key={`conn-${i}`}
                x1={f.x}
                y1={f.y}
                x2={t.x}
                y2={t.y}
                stroke={isActive ? "#D66853" : "currentColor"}
                className={isActive ? "" : "text-gray-700"}
                strokeWidth={isActive ? 2 : 0.5}
                strokeOpacity={isActive ? 0.8 : 0.15}
                animate={{
                  strokeOpacity: isActive ? [0.4, 0.8, 0.4] : 0.15,
                  strokeWidth: isActive ? [1, 2, 1] : 0.5,
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map((node, i) => {
            const isConnected = CONNECTIONS.some(
              ([from, to], ci) =>
                (from === i || to === i) &&
                (ci === activeConnection ||
                  ci === (activeConnection + 1) % CONNECTIONS.length ||
                  ci === (activeConnection + 2) % CONNECTIONS.length)
            );

            return (
              <g key={`node-${i}`}>
                {/* Glow */}
                {isConnected && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={12}
                    fill="#D66853"
                    opacity={0}
                    animate={{ opacity: [0, 0.15, 0], r: [8, 16, 8] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                {/* Node circle */}
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={5}
                  fill={isConnected ? "#D66853" : "currentColor"}
                  className={isConnected ? "" : "text-gray-600"}
                  animate={{
                    r: isConnected ? [5, 7, 5] : 5,
                    opacity: isConnected ? 1 : 0.4,
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </g>
            );
          })}

          {/* Center brain pulse */}
          <motion.circle
            cx={200}
            cy={150}
            r={40}
            fill="none"
            stroke="#D66853"
            strokeWidth={1}
            strokeOpacity={0.2}
            animate={{
              r: [35, 50, 35],
              strokeOpacity: [0.1, 0.3, 0.1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.circle
            cx={200}
            cy={150}
            r={25}
            fill="none"
            stroke="#D66853"
            strokeWidth={1.5}
            strokeOpacity={0.3}
            animate={{
              r: [20, 30, 20],
              strokeOpacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />
        </svg>
      </div>

      {/* Status message */}
      <div className="h-6 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-medium text-alloro-orange/80"
          >
            {STATUS_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
