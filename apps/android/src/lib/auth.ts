/**
 * Auth for mobile. Email+password via Supabase Auth REST.
 * After login, we keep only: user.id, email, and the derived encryption key.
 * Password is never persisted.
 */
import * as SecureStore from "expo-secure-store";
import { deriveKeyBytes } from "./crypto";

const URL_ = (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ?? "";
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? "";

const KS_USER_ID = "acc_user_id";
const KS_EMAIL = "acc_email";
const KS_KEY_B64 = "acc_enc_key_b64";
const KS_ACCESS_TOKEN = "acc_access_token";
const KS_REFRESH_TOKEN = "acc_refresh_token";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  encKey: Uint8Array | null;
  accessToken: string | null;
  refreshToken: string | null;
  ready: boolean;
}

let state: AuthState = {
  user: null,
  encKey: null,
  accessToken: null,
  refreshToken: null,
  ready: false,
};
const listeners = new Set<(s: AuthState) => void>();
function notify() {
  listeners.forEach((fn) => fn(state));
}

export function subscribeAuth(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function getAuth(): AuthState {
  return state;
}

export function isConfigured(): boolean {
  return !!URL_ && !!ANON;
}

function b64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return (globalThis as any).btoa(s);
}
function b64Decode(b: string): Uint8Array {
  const bin = (globalThis as any).atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function bootstrapAuth(): Promise<void> {
  try {
    const [userId, email, keyB64, accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KS_USER_ID),
      SecureStore.getItemAsync(KS_EMAIL),
      SecureStore.getItemAsync(KS_KEY_B64),
      SecureStore.getItemAsync(KS_ACCESS_TOKEN),
      SecureStore.getItemAsync(KS_REFRESH_TOKEN),
    ]);
    if (userId && email && keyB64 && accessToken) {
      state = {
        user: { id: userId, email },
        encKey: b64Decode(keyB64),
        accessToken,
        refreshToken,
        ready: true,
      };
      void refreshSession();
    } else {
      state = { ...state, ready: true };
    }
  } catch {
    state = { ...state, ready: true };
  }
  notify();
}

function decodeJwtExp(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = JSON.parse((globalThis as any).atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function tokenExpiresSoon(token: string | null): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now + 90;
}

export async function refreshSession(force = false): Promise<boolean> {
  if (!URL_ || !ANON) return false;
  if (!state.user || !state.encKey || !state.refreshToken) return false;
  if (!force && !tokenExpiresSoon(state.accessToken)) return true;

  const res = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ refresh_token: state.refreshToken }),
  });
  if (!res.ok) return false;

  const data: any = await res.json();
  const accessToken: string | undefined = data?.access_token ?? data?.session?.access_token;
  const refreshToken: string | undefined = data?.refresh_token ?? data?.session?.refresh_token;
  if (!accessToken) return false;

  await SecureStore.setItemAsync(KS_ACCESS_TOKEN, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(KS_REFRESH_TOKEN, refreshToken);
  state = {
    ...state,
    accessToken,
    refreshToken: refreshToken ?? state.refreshToken,
    ready: true,
  };
  notify();
  return true;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return (
      data.msg ||
      data.error_description ||
      data.error ||
      data.message ||
      `request failed (${res.status})`
    );
  } catch {
    return `request failed (${res.status})`;
  }
}

export async function signUp(email: string, password: string): Promise<void> {
  if (!URL_ || !ANON) throw new Error("supabase not configured");
  if (password.length < 6) throw new Error("password must be 6+ chars");

  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data: any = await res.json();

  // supabase returns `user.id` when email-confirm is OFF (session created),
  // and a top-level `id` when email-confirm is ON (confirmation email sent).
  const userId: string | undefined = data?.user?.id ?? data?.id;
  const hasSession = !!data?.access_token || !!data?.session?.access_token;
  if (!userId) {
    throw new Error(
      "signup failed — supabase didn't return a user id. disable 'confirm email' in supabase."
    );
  }
  if (!hasSession) {
    throw new Error(
      "confirmation email sent. confirm it, then come back and sign in. (tip: turn off 'confirm email' in supabase to skip this.)"
    );
  }
  const accessToken: string | undefined = data?.access_token ?? data?.session?.access_token;
  const refreshToken: string | undefined = data?.refresh_token ?? data?.session?.refresh_token;
  if (!accessToken) throw new Error("signup returned no access token");
  await persist(userId, email.trim(), password, accessToken, refreshToken);
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!URL_ || !ANON) throw new Error("supabase not configured");

  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data: any = await res.json();
  const userId: string | undefined = data?.user?.id ?? data?.id;
  if (!userId) throw new Error("login returned no user id");

  const accessToken: string | undefined = data?.access_token ?? data?.session?.access_token;
  const refreshToken: string | undefined = data?.refresh_token ?? data?.session?.refresh_token;
  if (!accessToken) throw new Error("login returned no access token");
  await persist(userId, email.trim(), password, accessToken, refreshToken);
}

async function persist(
  userId: string,
  email: string,
  password: string,
  accessToken: string,
  refreshToken?: string
) {
  const key = deriveKeyBytes(password);
  await Promise.all([
    SecureStore.setItemAsync(KS_USER_ID, userId),
    SecureStore.setItemAsync(KS_EMAIL, email),
    SecureStore.setItemAsync(KS_KEY_B64, b64Encode(key)),
    SecureStore.setItemAsync(KS_ACCESS_TOKEN, accessToken),
    refreshToken
      ? SecureStore.setItemAsync(KS_REFRESH_TOKEN, refreshToken)
      : SecureStore.deleteItemAsync(KS_REFRESH_TOKEN),
  ]);
  state = {
    user: { id: userId, email },
    encKey: key,
    accessToken,
    refreshToken: refreshToken ?? null,
    ready: true,
  };
  notify();
}

export async function signOut(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KS_USER_ID),
    SecureStore.deleteItemAsync(KS_EMAIL),
    SecureStore.deleteItemAsync(KS_KEY_B64),
    SecureStore.deleteItemAsync(KS_ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KS_REFRESH_TOKEN),
  ]);
  state = {
    user: null,
    encKey: null,
    accessToken: null,
    refreshToken: null,
    ready: true,
  };
  notify();
}
