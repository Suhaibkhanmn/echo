/**
 * Desktop auth — email+password via Supabase Auth REST.
 * After login, we set the sync pair_id = user.id and passphrase = password,
 * which the existing sync module uses for encryption.
 */
import { setPair, clearPair, setSyncEnabled } from "./sync";

const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const ENV_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

const LS_USER_ID = "auth_user_id";
const LS_EMAIL = "auth_email";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  passphrase: string | null;
  ready: boolean;
}

let state: AuthState = { user: null, accessToken: null, passphrase: null, ready: false };
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
  return !!ENV_URL && !!ENV_ANON;
}

function getUrl(): string {
  return localStorage.getItem("supabase_url") ?? ENV_URL ?? "";
}
function getAnon(): string {
  return localStorage.getItem("supabase_anon_key") ?? ENV_ANON ?? "";
}

export function bootstrapAuth(): void {
  localStorage.removeItem("sync_pair_passphrase");
  state = { user: null, accessToken: null, passphrase: null, ready: true };
  notify();
}

async function parseErr(res: Response): Promise<string> {
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
  const url = getUrl();
  const anon = getAnon();
  if (!url || !anon) throw new Error("supabase not configured");
  if (password.length < 6) throw new Error("password must be 6+ chars");

  const res = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const data: any = await res.json();
  // supabase returns user.id when email-confirm is OFF (session created),
  // and a top-level `id` when email-confirm is ON (waiting for email click).
  const userId: string | undefined = data?.user?.id ?? data?.id;
  const hasSession = !!data?.access_token || !!data?.session?.access_token;
  if (!userId) {
    throw new Error(
      "signup failed — supabase didn't return a user id. " +
        "disable 'confirm email' under authentication → providers → email."
    );
  }
  if (!hasSession) {
    // email-confirmation is on. we can't keep the user signed in until they
    // click the email, so bounce them to sign-in rather than silently accepting.
    throw new Error(
      "confirmation email sent. confirm it, then come back and sign in. " +
        "(tip: turn off 'confirm email' in supabase to skip this.)"
    );
  }
  const accessToken: string | undefined = data?.access_token ?? data?.session?.access_token;
  if (!accessToken) throw new Error("signup returned no access token");
  await persist(userId, email.trim(), password, accessToken);
}

export async function signIn(email: string, password: string): Promise<void> {
  const url = getUrl();
  const anon = getAnon();
  if (!url || !anon) throw new Error("supabase not configured");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const data: any = await res.json();
  const userId: string | undefined = data?.user?.id ?? data?.id;
  if (!userId) throw new Error("login returned no user id");
  const accessToken: string | undefined = data?.access_token ?? data?.session?.access_token;
  if (!accessToken) throw new Error("login returned no access token");
  await persist(userId, email.trim(), password, accessToken);
}

async function persist(userId: string, email: string, password: string, accessToken: string) {
  localStorage.setItem(LS_USER_ID, userId);
  localStorage.setItem(LS_EMAIL, email);
  // wire up existing sync pipe: pair_id = user_id, passphrase = password
  setPair(userId, password, accessToken);
  setSyncEnabled(true);
  state = { user: { id: userId, email }, accessToken, passphrase: password, ready: true };
  notify();
}

export function signOut(): void {
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_EMAIL);
  clearPair();
  setSyncEnabled(false);
  state = { user: null, accessToken: null, passphrase: null, ready: true };
  notify();
}
