/**
 * Batch Status Tracker
 *
 * In-memory batch status management for real-time progress tracking.
 * This is a module-level singleton so both the controller and background
 * processors can access the same state.
 *
 * WARNING: State is lost on server restart. Active batches will continue
 * processing but clients cannot track progress until batch completes.
 * TODO: Consider Redis or DB-backed status store for production.
 */

export interface BatchStatus {
  batchId: string;
  googleAccountId: number;
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  currentLocationIndex: number;
  currentLocationName: string;
  status: "processing" | "completed" | "failed";
  rankingIds: number[];
  errors: Array<{ locationId: string; error: string; attempt: number }>;
  startedAt: Date;
  completedAt?: Date;
}

const batchStatusMap = new Map<string, BatchStatus>();

export function getStatus(batchId: string): BatchStatus | undefined {
  return batchStatusMap.get(batchId);
}

export function initialize(
  batchId: string,
  googleAccountId: number,
  totalLocations: number,
  firstLocationName: string,
  rankingIds: number[],
): BatchStatus {
  const status: BatchStatus = {
    batchId,
    googleAccountId,
    totalLocations,
    completedLocations: 0,
    failedLocations: 0,
    currentLocationIndex: 0,
    currentLocationName: firstLocationName,
    status: "processing",
    rankingIds: rankingIds,
    errors: [],
    startedAt: new Date(),
  };
  batchStatusMap.set(batchId, status);
  return status;
}

export function updateCurrentLocation(
  batchId: string,
  index: number,
  name: string,
): void {
  const status = batchStatusMap.get(batchId);
  if (status) {
    status.currentLocationIndex = index;
    status.currentLocationName = name;
    batchStatusMap.set(batchId, status);
  }
}

export function incrementCompleted(batchId: string): void {
  const status = batchStatusMap.get(batchId);
  if (status) {
    status.completedLocations++;
  }
}

export function addError(
  batchId: string,
  locationId: string,
  error: string,
  attempt: number,
): void {
  const status = batchStatusMap.get(batchId);
  if (status) {
    status.errors.push({ locationId, error, attempt });
  }
}

export function markFailed(batchId: string): void {
  const status = batchStatusMap.get(batchId);
  if (status) {
    status.failedLocations++;
    status.status = "failed";
    status.completedAt = new Date();
    batchStatusMap.set(batchId, status);
  }
}

export function markCompleted(batchId: string): void {
  const status = batchStatusMap.get(batchId);
  if (status) {
    status.status = "completed";
    status.completedAt = new Date();
    batchStatusMap.set(batchId, status);
  }
}

export function clearStatus(batchId: string): void {
  batchStatusMap.delete(batchId);
}
