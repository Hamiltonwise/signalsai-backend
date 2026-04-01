import type { Variants, Transition } from "framer-motion";

/**
 * Reusable Framer Motion Animation Variants
 * Based on patterns from alloro-leadgen-tool design reference
 */

// Spring transition presets
export const springTransition: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 25,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 100,
  damping: 20,
};

export const snappySpring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

// Card animation variants
export const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      type: "spring",
      stiffness: 100,
      damping: 20,
    },
  }),
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: { duration: 0.2 },
  },
  hover: {
    y: -4,
    boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
    transition: { duration: 0.2 },
  },
};

// Fade in up animation
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

// Stagger container for lists
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

// Scale and fade in
export const scaleInFade: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// Slide in from right
export const slideInRight: Variants = {
  hidden: {
    opacity: 0,
    x: 30,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: 30,
    transition: { duration: 0.15 },
  },
};

// Slide in from left
export const slideInLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -30,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: -30,
    transition: { duration: 0.15 },
  },
};

// Expand/collapse for accordions
export const expandCollapse: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
      opacity: { duration: 0.2 },
    },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
      opacity: { duration: 0.3, delay: 0.1 },
    },
  },
};

// Modal/overlay backdrop
export const backdropVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, delay: 0.1 },
  },
};

// Modal content
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 },
  },
};

// Pulse animation for loading/attention
export const pulseVariants: Variants = {
  initial: {
    scale: 1,
    opacity: 1,
  },
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Rotate animation (for icons)
export const rotateVariants: Variants = {
  initial: { rotate: 0 },
  rotate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

// Chevron rotation for expand/collapse
export const chevronVariants: Variants = {
  collapsed: { rotate: 0 },
  expanded: { rotate: 180 },
};

// Tab indicator
export const tabIndicatorVariants: Variants = {
  inactive: {
    opacity: 0,
    scale: 0.9,
  },
  active: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 30,
    },
  },
};

// Progress bar fill
export const progressFillVariants: Variants = {
  initial: { width: 0 },
  animate: (width: number) => ({
    width: `${width}%`,
    transition: {
      duration: 1,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

// Shine effect for progress bars
export const shineVariants: Variants = {
  initial: { x: "-100%" },
  animate: {
    x: "200%",
    transition: {
      duration: 1.5,
      delay: 0.8,
      repeat: Infinity,
      repeatDelay: 3,
    },
  },
};

// Glow ring animation for circular progress
export const glowRingVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: {
    scale: [0.8, 1.1, 0.8],
    opacity: [0, 0.3, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// List item for stagger
export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: -10,
    transition: { duration: 0.15 },
  },
};

// Page transition
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

// ─── Warm / Emotional Variants ──────────────────────────────────────

// Celebration entrance (for achievements, wins, milestones)
export const celebrateVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
      mass: 0.8,
    },
  },
};

// Warm card entrance (gentler, more personal than generic fade)
export const warmCardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
    scale: 0.99,
  },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.06,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

// Gentle float for "working for you" indicators
export const gentleFloat: Variants = {
  initial: { y: 0 },
  animate: {
    y: [-2, 2, -2],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Score reveal (the moment a number appears)
export const scoreReveal: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.85,
  },
  visible: {
    opacity: 1,
    scale: [0.85, 1.06, 1],
    transition: {
      duration: 0.6,
      times: [0, 0.6, 1],
      ease: "easeOut",
    },
  },
};

// Warm stagger (slower, more deliberate than default)
export const warmStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

// Success pulse (for achievements)
export const successPulse: Variants = {
  initial: { scale: 1 },
  pulse: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 2,
      repeat: 2,
      ease: "easeInOut",
    },
  },
};

// Helper function to get score-based color
export const getScoreColor = (score: number): "green" | "yellow" | "red" => {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
};

// Warm color class mappings (tinted, not flat)
export const scoreColorClasses = {
  green: {
    text: "text-emerald-600",
    bg: "bg-emerald-500",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200/60",
    ring: "ring-emerald-500/15",
    gradient: "from-emerald-50 to-white",
  },
  yellow: {
    text: "text-amber-600",
    bg: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-200/60",
    ring: "ring-amber-500/15",
    gradient: "from-amber-50 to-white",
  },
  red: {
    text: "text-[#D66853]",
    bg: "bg-[#D66853]",
    bgLight: "bg-[#D66853]/5",
    border: "border-[#D66853]/20",
    ring: "ring-[#D66853]/15",
    gradient: "from-[#D66853]/5 to-white",
  },
};
