type BrowserCrypto = Pick<Crypto, "getRandomValues"> & {
  randomUUID?: () => string;
};

/**
 * Creates an RFC 4122 version 4 UUID in both secure and insecure browser contexts.
 * `crypto.randomUUID` is unavailable when the dashboard is opened over plain HTTP
 * from a non-localhost address, while `getRandomValues` remains widely available.
 */
export function createClientId(cryptoApi: BrowserCrypto | undefined = globalThis.crypto): string {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    // Last-resort compatibility for old embedded WebViews. These IDs provide
    // request uniqueness; they are not used as authentication secrets.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
