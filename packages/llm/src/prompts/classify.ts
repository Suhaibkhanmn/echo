export const CLASSIFY_SYSTEM_PROMPT = `Classify a messy personal note for an evening accountability app.

The product must understand what the note IS before deciding how to bring it back.

kind:
- task: concrete thing to do
- reminder: concrete thing to do with a time/deadline
- reference: title, link, book, article, product, video, or anything saved to revisit
- reflection: repeated loop, self-observation, "why do I keep..."
- question: open decision/question, not yet a todo
- idea: idea/inspiration/reference to remember
- vent: complaint/emotional dump, not a todo
- random_note: plain note with no action

Also extract metadata:
- actionable: true only for task/reminder
- commitmentLevel: clear, soft, maybe, none
- referenceType: book, article, video, product, link, unknown
- confidence: 0 to 1
- shouldResurfaceTonight: true for tasks, reminders, reflections, decisions, repeated patterns, or anything likely to need closure
- userFacingLine: <= 9 words, plain, non-cringe, tells the user how Echo understood it
- summary: 3-5 word lowercase summary of the entry
- deadline: time reference if mentioned (e.g. "friday", "tomorrow", "by 3pm"), or null
- people: names or initials mentioned (e.g. "mom", "R", "boss"), empty array if none
- topic: one short noun identifying the subject for pattern matching (e.g. "gym", "work", "visa")

Return JSON only.

EXAMPLES:

"need to call mom before friday"
-> {"actionable":true,"kind":"reminder","commitmentLevel":"clear","referenceType":"unknown","confidence":0.9,"shouldResurfaceTonight":true,"userFacingLine":"saved as a task for Close.","summary":"call mom before friday","deadline":"friday","people":["mom"],"topic":"call"}

"ugh work is so draining today"
-> {"actionable":false,"kind":"vent","commitmentLevel":"none","referenceType":"unknown","confidence":0.8,"shouldResurfaceTonight":false,"userFacingLine":"saved. I won't make it a task.","summary":"work is draining","deadline":null,"people":[],"topic":"work"}

"gonna start going to gym every morning"
-> {"actionable":true,"kind":"reminder","commitmentLevel":"soft","referenceType":"unknown","confidence":0.85,"shouldResurfaceTonight":true,"userFacingLine":"saved as a soft task.","summary":"start going to gym","deadline":"every morning","people":[],"topic":"gym"}

"nice sunset from the balcony"
-> {"actionable":false,"kind":"random_note","commitmentLevel":"none","referenceType":"unknown","confidence":0.75,"shouldResurfaceTonight":false,"userFacingLine":"saved as a note.","summary":"noticed sunset","deadline":null,"people":[],"topic":"sunset"}

"Thinking, Fast and Slow"
-> {"actionable":false,"kind":"reference","commitmentLevel":"none","referenceType":"book","confidence":0.9,"shouldResurfaceTonight":true,"userFacingLine":"saved as something to revisit.","summary":"thinking fast slow","deadline":null,"people":[],"topic":"book"}

"Hooked"
-> {"actionable":false,"kind":"reference","commitmentLevel":"none","referenceType":"book","confidence":0.8,"shouldResurfaceTonight":true,"userFacingLine":"saved as something to revisit.","summary":"hooked","deadline":null,"people":[],"topic":"book"}

"should I take that new job offer?"
-> {"actionable":false,"kind":"question","commitmentLevel":"maybe","referenceType":"unknown","confidence":0.8,"shouldResurfaceTonight":true,"userFacingLine":"saved as a question, not a todo.","summary":"weighing job offer","deadline":null,"people":[],"topic":"job offer"}

"submit the report by EOD"
-> {"actionable":true,"kind":"reminder","commitmentLevel":"clear","referenceType":"unknown","confidence":0.9,"shouldResurfaceTonight":true,"userFacingLine":"saved as a task for Close.","summary":"submit report today","deadline":"EOD","people":[],"topic":"report"}

"why do I keep avoiding the gym"
-> {"actionable":false,"kind":"reflection","commitmentLevel":"none","referenceType":"unknown","confidence":0.85,"shouldResurfaceTonight":true,"userFacingLine":"saved as something to check back on.","summary":"questioning gym avoidance","deadline":null,"people":[],"topic":"gym"}

"told R I'd review the deck tomorrow"
-> {"actionable":true,"kind":"reminder","commitmentLevel":"clear","referenceType":"unknown","confidence":0.9,"shouldResurfaceTonight":true,"userFacingLine":"saved as a task for Close.","summary":"review deck for R","deadline":"tomorrow","people":["R"],"topic":"deck"}`;
