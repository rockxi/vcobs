export const MAX_SHARED_FILE_BYTES = 500 * 1024 * 1024;

export function isSharedFileSizeAllowed(size: number) {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAX_SHARED_FILE_BYTES;
}

export function encodeUploadFileName(fileName: string) {
  return encodeURIComponent(fileName);
}

export function decodeUploadFileName(value: string | null) {
  if (!value) return "file";
  try {
    return decodeURIComponent(value);
  } catch {
    return "file";
  }
}

export function formatSharedFileSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length);
  const value = size / 1024 ** exponent;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[exponent - 1]}`;
}
