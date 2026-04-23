/**
 * RN-safe crypto — matches desktop's wire format (AES-GCM 256, 12-byte IV prefix).
 * Pure JS via @noble; uses global crypto.getRandomValues for IV.
 */
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";

const SALT = new TextEncoder().encode("accountability-v1");
const IV_LEN = 12;
const KEY_BYTES = 32;
const ITERATIONS = 100_000;

export function deriveKeyBytes(passphrase: string): Uint8Array {
  const pw = new TextEncoder().encode(passphrase);
  return pbkdf2(sha256, pw, SALT, { c: ITERATIONS, dkLen: KEY_BYTES });
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // RN (Hermes) and Node both have crypto.getRandomValues
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(out);
    return out;
  }
  // weak fallback; should never happen in practice
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function encryptContent(plaintext: string, key: Uint8Array): string {
  const iv = randomBytes(IV_LEN);
  const aes = gcm(key, iv);
  const ct = aes.encrypt(new TextEncoder().encode(plaintext));
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_LEN);
  return bytesToBase64(out);
}

export function decryptContent(b64: string, key: Uint8Array): string {
  const bytes = base64ToBytes(b64);
  const iv = bytes.slice(0, IV_LEN);
  const ct = bytes.slice(IV_LEN);
  const aes = gcm(key, iv);
  const pt = aes.decrypt(ct);
  return new TextDecoder().decode(pt);
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  const g: any = globalThis as any;
  if (typeof g.btoa === "function") {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return g.btoa(s);
  }
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      B64_CHARS[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const b0 = bytes[i];
    const b1 = rem > 1 ? bytes[i + 1] : 0;
    const n = (b0 << 16) | (b1 << 8);
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63];
    out += rem === 2 ? B64_CHARS[(n >> 6) & 63] : "=";
    out += "=";
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const g: any = globalThis as any;
  if (typeof g.atob === "function") {
    const bin = g.atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padded = clean.replace(/=+$/, "");
  const len = (padded.length * 3) >> 2;
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = B64_CHARS.indexOf(padded[i]);
    const c1 = B64_CHARS.indexOf(padded[i + 1]);
    const c2 = i + 2 < padded.length ? B64_CHARS.indexOf(padded[i + 2]) : 0;
    const c3 = i + 3 < padded.length ? B64_CHARS.indexOf(padded[i + 3]) : 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < len) out[o++] = (n >> 16) & 0xff;
    if (o < len) out[o++] = (n >> 8) & 0xff;
    if (o < len) out[o++] = n & 0xff;
  }
  return out;
}
