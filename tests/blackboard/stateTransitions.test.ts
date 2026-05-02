/**
 * State machine integration tests for the Notion Blackboard.
 *
 * Tests the deterministic part of stateTransitions.ts -- the state machine
 * itself, plus the transitionCard validation gate. Network calls to Notion
 * are not exercised here; the gate test runs without NOTION_TOKEN by
 * relying on the validator rejecting the transition before any HTTP call.
 */

import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  transitionCard,
  __test__,
  type CardState,
} from "../../src/services/blackboard/stateTransitions";

describe("blackboard state machine", () => {
  describe("isTransitionAllowed", () => {
    it("allows the canonical happy path", () => {
      const path: Array<[CardState | "Initial", CardState]> = [
        ["Initial", "New"],
        ["New", "Reviewer Gated"],
        ["Reviewer Gated", "Jo Reviewed"],
        ["Jo Reviewed", "Dave Queued"],
        ["Dave Queued", "Dave In Progress"],
        ["Dave In Progress", "Dave Shipped"],
        ["Dave Shipped", "Verified"],
      ];
      for (const [from, to] of path) {
        expect(
          isTransitionAllowed(from, to),
          `${from} -> ${to} should be allowed`,
        ).toBe(true);
      }
    });

    it("allows reviewer-blocked recovery loop", () => {
      expect(isTransitionAllowed("Reviewer Gated", "Reviewer Blocked")).toBe(true);
      expect(isTransitionAllowed("Reviewer Blocked", "Reviewer Gated")).toBe(true);
      expect(isTransitionAllowed("Reviewer Blocked", "Jo Reviewed")).toBe(true);
    });

    it("allows Rejected and Archived from any non-terminal state", () => {
      const states: CardState[] = [
        "New",
        "Reviewer Gated",
        "Reviewer Blocked",
        "Jo Reviewed",
        "Dave Queued",
        "Dave In Progress",
        "Dave Shipped",
      ];
      for (const s of states) {
        expect(isTransitionAllowed(s, "Rejected")).toBe(true);
        expect(isTransitionAllowed(s, "Archived")).toBe(true);
      }
    });

    it("allows Verified -> Archived", () => {
      expect(isTransitionAllowed("Verified", "Archived")).toBe(true);
    });

    it("allows Rejected -> Archived", () => {
      expect(isTransitionAllowed("Rejected", "Archived")).toBe(true);
    });

    it("rejects skipping states forward", () => {
      // Skipping the gate
      expect(isTransitionAllowed("New", "Jo Reviewed")).toBe(false);
      // Skipping reviewer
      expect(isTransitionAllowed("New", "Dave Queued")).toBe(false);
      // Skipping Dave's progression
      expect(isTransitionAllowed("Jo Reviewed", "Dave In Progress")).toBe(false);
      expect(isTransitionAllowed("Dave Queued", "Dave Shipped")).toBe(false);
      expect(isTransitionAllowed("Dave Queued", "Verified")).toBe(false);
    });

    it("rejects transitions out of terminal states (except Archived destinations)", () => {
      expect(isTransitionAllowed("Archived", "New")).toBe(false);
      expect(isTransitionAllowed("Archived", "Verified")).toBe(false);
      expect(isTransitionAllowed("Archived", "Reviewer Gated")).toBe(false);
      // Verified can only go to Archived (no resurrection)
      expect(isTransitionAllowed("Verified", "Dave Shipped")).toBe(false);
      expect(isTransitionAllowed("Verified", "New")).toBe(false);
      // Rejected can only go to Archived
      expect(isTransitionAllowed("Rejected", "New")).toBe(false);
      expect(isTransitionAllowed("Rejected", "Reviewer Gated")).toBe(false);
    });

    it("rejects backward transitions in the main flow", () => {
      expect(isTransitionAllowed("Jo Reviewed", "Reviewer Gated")).toBe(false);
      expect(isTransitionAllowed("Dave Queued", "Jo Reviewed")).toBe(false);
      expect(isTransitionAllowed("Dave In Progress", "Dave Queued")).toBe(false);
      expect(isTransitionAllowed("Dave Shipped", "Dave In Progress")).toBe(false);
    });

    it("Initial allows entering at any non-archive state (backfill)", () => {
      const initial: CardState[] = [
        "New",
        "Reviewer Gated",
        "Reviewer Blocked",
        "Jo Reviewed",
        "Dave Queued",
        "Dave In Progress",
        "Dave Shipped",
        "Verified",
      ];
      for (const s of initial) {
        expect(isTransitionAllowed("Initial", s)).toBe(true);
      }
      // But Initial -> Archived also allowed (Rejected/Archived from non-terminal Initial)
      expect(isTransitionAllowed("Initial", "Rejected")).toBe(true);
      expect(isTransitionAllowed("Initial", "Archived")).toBe(true);
    });
  });

  describe("transitionCard input validation", () => {
    it("rejects transitions missing cardId", async () => {
      const r = await transitionCard({
        cardId: "",
        toState: "New",
        actor: "CC",
        reason: "test",
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/cardId is required/);
    });

    it("rejects transitions missing reason", async () => {
      const r = await transitionCard({
        cardId: "test-card",
        toState: "New",
        actor: "CC",
        reason: "",
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/reason is required/);
    });

    it("rejects invalid transitions before any Notion write", async () => {
      // Use fromStateOverride to control the from-state without hitting Notion.
      const r = await transitionCard({
        cardId: "nonexistent-card-for-test",
        toState: "Verified",
        actor: "CC",
        reason: "test",
        fromStateOverride: "New",
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Invalid transition/);
      expect(r.error).toMatch(/New -> Verified/);
    });

    it("error message lists allowed next states", async () => {
      const r = await transitionCard({
        cardId: "test",
        toState: "Verified",
        actor: "CC",
        reason: "test",
        fromStateOverride: "Dave Queued",
      });
      expect(r.success).toBe(false);
      // Dave Queued can transition to: Dave In Progress, Rejected, Archived
      expect(r.error).toMatch(/Dave In Progress/);
    });
  });

  describe("internal table integrity", () => {
    it("every state in ALLOWED_TRANSITIONS_RAW has a corresponding entry", () => {
      const states: CardState[] = [
        "New",
        "Reviewer Gated",
        "Reviewer Blocked",
        "Jo Reviewed",
        "Dave Queued",
        "Dave In Progress",
        "Dave Shipped",
        "Verified",
        "Rejected",
        "Archived",
      ];
      for (const s of states) {
        expect(__test__.ALLOWED_TRANSITIONS_RAW[s]).toBeDefined();
      }
    });

    it("Archived is the only terminal state", () => {
      expect(__test__.TERMINAL_STATES.has("Archived")).toBe(true);
      expect(__test__.TERMINAL_STATES.size).toBe(1);
    });
  });

  describe("round-trip state machine simulation", () => {
    it("walks a card from Initial through every state to Archived", () => {
      // Simulates the full lifecycle without hitting Notion.
      const lifecycle: Array<[CardState | "Initial", CardState]> = [
        ["Initial", "New"],
        ["New", "Reviewer Gated"],
        ["Reviewer Gated", "Jo Reviewed"],
        ["Jo Reviewed", "Dave Queued"],
        ["Dave Queued", "Dave In Progress"],
        ["Dave In Progress", "Dave Shipped"],
        ["Dave Shipped", "Verified"],
        ["Verified", "Archived"],
      ];
      let current: CardState | "Initial" = "Initial";
      for (const [from, to] of lifecycle) {
        expect(current).toBe(from);
        expect(isTransitionAllowed(from, to)).toBe(true);
        current = to;
      }
      expect(current).toBe("Archived");
    });

    it("walks a card through reviewer-blocked recovery", () => {
      const lifecycle: Array<[CardState | "Initial", CardState]> = [
        ["Initial", "New"],
        ["New", "Reviewer Gated"],
        ["Reviewer Gated", "Reviewer Blocked"],
        ["Reviewer Blocked", "Reviewer Gated"],
        ["Reviewer Gated", "Jo Reviewed"],
        ["Jo Reviewed", "Dave Queued"],
      ];
      for (const [from, to] of lifecycle) {
        expect(isTransitionAllowed(from, to)).toBe(true);
      }
    });
  });
});
