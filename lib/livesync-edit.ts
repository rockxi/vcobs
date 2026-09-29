import xxhash from "xxhash-wasm";

const MAX_CHUNK_LENGTH = 8192;
let hashPromise: ReturnType<typeof xxhash> | undefined;

/** Split on Unicode code point boundaries so JSON cannot corrupt surrogate pairs. */
export function splitLiveSyncText(text: string): string[] {
  if (!text) return [];
  const parts: string[] = [];
  let part = "";
  for (const character of text) {
    if (part.length + character.length > MAX_CHUNK_LENGTH) {
      parts.push(part);
      part = "";
    }
    part += character;
  }
  if (part) parts.push(part);
  return parts;
}

/** LiveSync's unencrypted xxhash64 chunk ID; the ID is based on UTF-16 length. */
export async function liveSyncChunks(text: string) {
  hashPromise ??= xxhash();
  const hasher = await hashPromise;
  return splitLiveSyncText(text).map((data) => ({
    _id: `h:${hasher.h64(`${data}-${data.length}`).toString(36)}`,
    type: "leaf" as const,
    data,
  }));
}
