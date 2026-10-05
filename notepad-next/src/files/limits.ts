export const DEFAULT_LARGE_FILE_BYTES = 50 * 1024 * 1024;

/** True when a file is strictly larger than the warning threshold. */
export function exceedsLargeFileLimit(sizeBytes: number, thresholdBytes = DEFAULT_LARGE_FILE_BYTES): boolean {
  return sizeBytes > thresholdBytes;
}
