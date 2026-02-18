/**
 * GSC Device Data Transformation
 * Transforms device breakdown rows from array format to keyed object.
 */

interface DeviceMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Transforms GSC device rows from an array into a keyed object.
 *
 * Input:  [{ keys: ["MOBILE"], clicks: 100, impressions: 500, ctr: 0.2, position: 5.3 }, ...]
 * Output: { MOBILE: { clicks: 100, impressions: 500, ctr: 0.2, position: 5.3 }, ... }
 *
 * @param deviceRows - Raw device rows from GSC API
 * @returns Object keyed by device type with metrics
 */
export const processDeviceData = (
  deviceRows: any[]
): Record<string, DeviceMetrics> => {
  if (!deviceRows) return {};

  const deviceData: Record<string, DeviceMetrics> = {};
  deviceRows.forEach((row) => {
    deviceData[row.keys[0]] = {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  });
  return deviceData;
};
