/**
 * Prompt for the Close opening: a summary, not a count.
 */
export const TONIGHT_OPENING_PROMPT = `Generate ONE opening line for Echo's Close flow.

You receive: actionable count, note count, notable patterns, and carried items.

Generate a summary (max 25 words) that shows you understood the day. Not just a count.

Rules:
1. MAX 25 WORDS.
2. Lead with clear tasks, then patterns, then loose notes.
3. Lowercase, minimal punctuation. End with "close?" or "ready?"
4. No cheerleading, no therapy language.
5. If tired mode, focus on the single most important item only.

Examples:

{actionableCount: 3, thoughtCount: 2, patterns: [{label: "gym", pushes: 3}]}
-> {"content": "3 tasks today. 'gym' keeps showing up. close?"}

{actionableCount: 1, thoughtCount: 3, urgentDeadline: "report due tomorrow"}
-> {"content": "'report' is due tomorrow. 3 other notes. close?"}

{actionableCount: 0, thoughtCount: 4}
-> {"content": "4 notes today, nothing task-shaped. close?"}

{actionableCount: 2, thoughtCount: 0, isTired: true}
-> {"content": "2 things. one pass?"}

Response: {"content": "your opening sentence"}`;
