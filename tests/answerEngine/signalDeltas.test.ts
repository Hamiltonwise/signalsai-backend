/**
 * Pure-logic tests for the GSC delta detector. No DB, no network.
 */

import { describe, test, expect } from "vitest";
import {
  computeGscDeltas,
  RANK_DELTA_THRESHOLD,
  IMPRESSION_SPIKE_PCT,
  NEW_QUERY_IMPRESSION_FLOOR,
} from "../../src/services/answerEngine/signalDeltas";
import { computeGscWindows } from "../../src/services/answerEngine/signalWatcher";
import type { GscQueryRow } from "../../src/services/answerEngine/types";

function row(query: string, position: number, impressions: number): GscQueryRow {
  return { query, position, impressions, clicks: 0, ctr: 0 };
}

describe("computeGscDeltas", () => {
  test("rank-position delta of exactly the threshold fires", () => {
    const prior = [row("emergency endodontist bend", 8, 200)];
    const current = [row("emergency endodontist bend", 8 - RANK_DELTA_THRESHOLD, 200)];
    const deltas = computeGscDeltas(prior, current);
    const rankRows = deltas.filter((d) => d.signal_type === "gsc_rank_delta");
    expect(rankRows.length).toBe(1);
    expect(rankRows[0].rankDelta).toBe(-RANK_DELTA_THRESHOLD);
  });

  test("rank delta below threshold is suppressed", () => {
    const prior = [row("q", 5, 500)];
    const current = [row("q", 5 - (RANK_DELTA_THRESHOLD - 1), 500)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas.filter((d) => d.signal_type === "gsc_rank_delta").length).toBe(0);
  });

  test("impression spike of exactly the threshold fires", () => {
    const before = 100;
    const after = before + (before * IMPRESSION_SPIKE_PCT) / 100;
    const prior = [row("q", 10, before)];
    const current = [row("q", 10, after)];
    const deltas = computeGscDeltas(prior, current);
    const spikes = deltas.filter((d) => d.signal_type === "gsc_impression_spike");
    expect(spikes.length).toBe(1);
    expect(Math.round(spikes[0].impressionPct ?? 0)).toBe(IMPRESSION_SPIKE_PCT);
  });

  test("impression delta below threshold is suppressed", () => {
    const prior = [row("q", 10, 100)];
    const current = [row("q", 10, 100 + IMPRESSION_SPIKE_PCT - 1)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas.filter((d) => d.signal_type === "gsc_impression_spike").length).toBe(0);
  });

  test("new query above floor emits gsc_new_query", () => {
    const prior: GscQueryRow[] = [];
    const current = [row("brand new patient phrase", 12, NEW_QUERY_IMPRESSION_FLOOR + 5)];
    const deltas = computeGscDeltas(prior, current);
    const news = deltas.filter((d) => d.signal_type === "gsc_new_query");
    expect(news.length).toBe(1);
    expect(news[0].impressionsAfter).toBe(NEW_QUERY_IMPRESSION_FLOOR + 5);
  });

  test("new query below floor is suppressed", () => {
    const prior: GscQueryRow[] = [];
    const current = [row("low-volume new phrase", 12, NEW_QUERY_IMPRESSION_FLOOR - 1)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas.length).toBe(0);
  });

  test("a single query can fire multiple delta types simultaneously", () => {
    const prior = [row("q", 8, 50)];
    const current = [row("q", 3, 200)]; // rank improved 5; impressions +300%
    const deltas = computeGscDeltas(prior, current);
    expect(deltas.filter((d) => d.signal_type === "gsc_rank_delta").length).toBe(1);
    expect(deltas.filter((d) => d.signal_type === "gsc_impression_spike").length).toBe(1);
  });

  test("severity is action when rank moved 5+ positions", () => {
    const prior = [row("q", 10, 200)];
    const current = [row("q", 5, 200)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas[0].severity).toBe("action");
  });

  test("severity is watch when rank moved 3-4 positions", () => {
    const prior = [row("q", 10, 200)];
    const current = [row("q", 7, 200)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas[0].severity).toBe("watch");
  });

  test("empty current produces empty deltas", () => {
    expect(computeGscDeltas([row("q", 5, 100)], [])).toEqual([]);
  });

  test("empty query strings are skipped", () => {
    const prior: GscQueryRow[] = [];
    const current = [row("", 10, 500)];
    const deltas = computeGscDeltas(prior, current);
    expect(deltas.length).toBe(0);
  });
});

describe("computeGscWindows", () => {
  test("current window ends yesterday and is 7 days long inclusive", () => {
    const ref = new Date("2026-05-02T12:00:00Z");
    const w = computeGscWindows(ref);
    expect(w.current.end).toBe("2026-05-01");
    expect(w.current.start).toBe("2026-04-25");
  });

  test("prior window is the 7 days immediately before current", () => {
    const ref = new Date("2026-05-02T12:00:00Z");
    const w = computeGscWindows(ref);
    expect(w.prior.end).toBe("2026-04-24");
    expect(w.prior.start).toBe("2026-04-18");
  });

  test("windows are non-overlapping", () => {
    const ref = new Date("2026-05-02T12:00:00Z");
    const w = computeGscWindows(ref);
    expect(w.current.start > w.prior.end).toBe(true);
  });
});
