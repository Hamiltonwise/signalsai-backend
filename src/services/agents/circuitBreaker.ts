/**
 * Circuit Breaker -- Agent Orchestration Infrastructure
 *
 * Protects the system from cascading failures when an agent
 * repeatedly fails. Three states:
 *
 * - CLOSED: normal operation, agent runs freely
 * - OPEN: agent blocked after 3 consecutive failures
 * - HALF-OPEN: after 5-minute cooldown, one retry allowed
 *
 * Also enforces MAX_ITERATIONS (8 per run) to prevent runaway
 * agent loops.
 *
 * State lives in memory (Map) with persistence to
 * behavioral_events for post-mortem analysis.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

export interface CircuitState {
  agentName: string;
  consecutiveFailures: number;
  lastFailure: Date | null;
  state: "closed" | "open" | "half-open";
  totalIterations: number;
}

export interface CircuitCheckResult {
  allowed: boolean;
  reason?: string;
}

// ── Constants ───────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITERATIONS = 8;

// ── In-memory state ─────────────────────────────────────────────────

const circuits: Map<string, CircuitState> = new Map();

function getOrCreate(agentName: string): CircuitState {
  let state = circuits.get(agentName);
  if (!state) {
    state = {
      agentName,
      consecutiveFailures: 0,
      lastFailure: null,
      state: "closed",
      totalIterations: 0,
    };
    circuits.set(agentName, state);
  }
  return state;
}

// ── Logging ─────────────────────────────────────────────────────────

async function logStateChange(
  agentName: string,
  previousState: string,
  newState: string,
  reason: string,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "circuit_breaker.state_change",
      org_id: null,
      properties: JSON.stringify({
        agent_name: agentName,
        previous_state: previousState,
        new_state: newState,
        reason,
        timestamp: new Date().toISOString(),
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[CircuitBreaker] Failed to log state change for ${agentName}:`,
      message,
    );
  }
}

// ── Core functions ──────────────────────────────────────────────────

/**
 * Check whether an agent is allowed to run.
 *
 * Returns { allowed: true } if the circuit is closed or half-open
 * (retry attempt). Returns { allowed: false, reason } if the circuit
 * is open or the iteration limit has been hit.
 */
export function checkCircuit(agentName: string): CircuitCheckResult {
  const circuit = getOrCreate(agentName);

  // Check iteration limit regardless of circuit state
  if (circuit.totalIterations >= MAX_ITERATIONS) {
    return {
      allowed: false,
      reason: `Max iterations reached (${MAX_ITERATIONS}). Agent "${agentName}" must wait for reset.`,
    };
  }

  switch (circuit.state) {
    case "closed":
      return { allowed: true };

    case "open": {
      // Check if cooldown has elapsed
      if (circuit.lastFailure) {
        const elapsed = Date.now() - circuit.lastFailure.getTime();
        if (elapsed >= COOLDOWN_MS) {
          // Transition to half-open
          const prev = circuit.state;
          circuit.state = "half-open";
          console.log(
            `[CircuitBreaker] ${agentName}: OPEN -> HALF-OPEN (cooldown elapsed after ${Math.round(elapsed / 1000)}s)`,
          );
          void logStateChange(agentName, prev, "half-open", "Cooldown elapsed, allowing one retry");
          return { allowed: true };
        }
      }

      const remainingMs = circuit.lastFailure
        ? COOLDOWN_MS - (Date.now() - circuit.lastFailure.getTime())
        : COOLDOWN_MS;

      return {
        allowed: false,
        reason: `Circuit OPEN for "${agentName}". ${circuit.consecutiveFailures} consecutive failures. Retry in ${Math.round(remainingMs / 1000)}s.`,
      };
    }

    case "half-open":
      // Allow exactly one retry
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Record a successful agent run. Resets the circuit to closed
 * and clears the failure counter.
 */
export function recordSuccess(agentName: string): void {
  const circuit = getOrCreate(agentName);
  const prev = circuit.state;

  circuit.consecutiveFailures = 0;
  circuit.totalIterations += 1;

  if (prev !== "closed") {
    circuit.state = "closed";
    console.log(
      `[CircuitBreaker] ${agentName}: ${prev.toUpperCase()} -> CLOSED (success)`,
    );
    void logStateChange(agentName, prev, "closed", "Agent succeeded, circuit reset");
  }
}

/**
 * Record a failed agent run. Increments the failure counter
 * and opens the circuit after MAX_CONSECUTIVE_FAILURES.
 */
export function recordFailure(agentName: string, error: string): void {
  const circuit = getOrCreate(agentName);
  const prev = circuit.state;

  circuit.consecutiveFailures += 1;
  circuit.lastFailure = new Date();
  circuit.totalIterations += 1;

  if (circuit.state === "half-open") {
    // Retry failed, back to open
    circuit.state = "open";
    console.log(
      `[CircuitBreaker] ${agentName}: HALF-OPEN -> OPEN (retry failed: ${error})`,
    );
    void logStateChange(agentName, "half-open", "open", `Retry failed: ${error}`);
    return;
  }

  if (circuit.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    circuit.state = "open";
    console.log(
      `[CircuitBreaker] ${agentName}: ${prev.toUpperCase()} -> OPEN (${circuit.consecutiveFailures} consecutive failures)`,
    );
    void logStateChange(
      agentName,
      prev,
      "open",
      `${circuit.consecutiveFailures} consecutive failures. Last error: ${error}`,
    );
  }
}

/**
 * Manually reset a circuit to closed state.
 * Used by admin endpoints or the Morning Briefing for manual recovery.
 */
export function resetCircuit(agentName: string): void {
  const circuit = getOrCreate(agentName);
  const prev = circuit.state;

  circuit.consecutiveFailures = 0;
  circuit.lastFailure = null;
  circuit.state = "closed";
  circuit.totalIterations = 0;

  console.log(
    `[CircuitBreaker] ${agentName}: ${prev.toUpperCase()} -> CLOSED (manual reset)`,
  );
  void logStateChange(agentName, prev, "closed", "Manual reset");
}

/**
 * Get the current circuit state for an agent.
 * Returns null if no circuit exists yet (agent has never run).
 */
export function getCircuitState(agentName: string): CircuitState | null {
  return circuits.get(agentName) ?? null;
}

/**
 * Get all circuit states. Useful for the admin dashboard.
 */
export function getAllCircuitStates(): CircuitState[] {
  return Array.from(circuits.values());
}
