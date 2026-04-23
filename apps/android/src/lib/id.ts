/**
 * Simple RN-safe id generator. Avoids `uuid` which needs crypto.getRandomValues.
 * Collision-resistant enough for on-device ids: timestamp + random suffix.
 */

export function genId(): string {
  const t = Date.now().toString(36);
  const r1 = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(5, "0");
  const r2 = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(5, "0");
  return `${t}-${r1}${r2}`;
}
