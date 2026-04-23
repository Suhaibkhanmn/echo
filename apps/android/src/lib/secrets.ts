import * as SecureStore from "expo-secure-store";
import { kvDelete, kvGet } from "./kv";

const GEMINI_KEY = "gemini_api_key";

let geminiApiKeyCache: string | null = null;

export async function loadSecrets(): Promise<void> {
  let key = await SecureStore.getItemAsync(GEMINI_KEY);
  if (!key) {
    const legacy = kvGet(GEMINI_KEY);
    if (legacy) {
      key = legacy;
      await SecureStore.setItemAsync(GEMINI_KEY, legacy);
      kvDelete(GEMINI_KEY);
    }
  }
  geminiApiKeyCache = key?.trim() || null;
}

export function getGeminiApiKeySync(): string | undefined {
  return geminiApiKeyCache ?? undefined;
}

export async function setGeminiApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed) {
    await SecureStore.setItemAsync(GEMINI_KEY, trimmed);
    geminiApiKeyCache = trimmed;
  } else {
    await SecureStore.deleteItemAsync(GEMINI_KEY);
    geminiApiKeyCache = null;
  }
  kvDelete(GEMINI_KEY);
}
