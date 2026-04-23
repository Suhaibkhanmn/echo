# Echo

Echo is an accountability app for messy daily thoughts.

It is for the things you would normally send to yourself on WhatsApp, drop into Notes, or leave floating in your head: half-tasks, book names, links to check later, errands, vague reminders, reflections, and those small "I should do this" thoughts that are easy to ignore by night.

During the day, you just capture. At night, Echo helps you close the loop. It looks at what you wrote, figures out what kind of thing each entry is, and asks the right kind of follow-up instead of treating everything like a generic todo.

## The Idea

Most notes apps are passive. They store your text and stop there.

Most todo apps are strict. They expect a clean task, a due date, and structure before you even know what the thought is.

Echo sits in the middle. It lets the input stay rough, then uses context later.

For example:

```text
Thinking, Fast and Slow
```

That is probably a book or reference, not a task.

```text
finish portfolio case study by friday
```

That is a task.

```text
i keep sleeping late and feeling useless next morning
```

That should not become a checkbox. Echo should ask whether it is still true, or whether you want to do something about it.

That difference is the product.

## Features

Echo includes:

- Android app built with Expo / React Native
- Desktop app built with Tauri / React
- Supabase sign up and sign in
- Encrypted sync through Supabase
- Client-side note encryption before cloud sync
- Quick capture
- Log / timeline view
- Close flow for night review
- One Thing mode for low-energy nights
- Carry-forward behavior when something is pushed
- Smart local notifications
- Gemini-powered entry classification
- Gemini-powered Close questions
- Heuristic/template fallback when Gemini is missing, broken, or rate-limited
- Mobile safe-area handling
- Mobile-safe layout across Capture, Settings, Close, and Log
- Sign out
- Desktop markdown and JSON export

## How Echo Thinks About Entries

When Gemini is enabled, Echo tries to understand what each entry is:

- task
- reminder
- reference
- book
- idea
- reflection
- question
- random note
- vent

That classification changes the night review.

Examples:

```text
finish portfolio case study by friday
```

Echo should treat this like something to close: done, pushed, or dropped.

```text
Hooked
```

Echo should treat this like a book/reference and ask whether you still want to revisit it.

```text
gym keeps getting pushed again
```

Echo should notice the pattern and ask about the repeated postponing, not just show the raw note.

## Close

Close is the night loop.

It reviews the things from the current day that still need attention. The reminder time is a nudge, not a hard gate. You can close before the reminder time, and Echo should still review what has been captured so far.

Close should not keep asking the same boring "did you do it?" question for every entry. The wording should vary, and the question should match the kind of entry:

- tasks get direct completion questions
- pushed tasks can carry forward
- books/references are treated as things to revisit
- reflections get "still true?" style prompts
- random notes are acknowledged without forcing fake productivity

## One Thing

One Thing mode is for nights when you do not want to review everything.

Instead of walking through the full list, Echo chooses what seems most worth closing. It should prefer important/actionable entries over random notes, and it should use the same classification and salience logic as the normal Close flow.

## Requirements

- Node.js 20+
- pnpm
- Android Studio / Android SDK for Android builds
- Rust for Tauri desktop builds
- Supabase project for auth and sync
- Gemini API key for AI behavior

Echo can run without Gemini, but then it falls back to simpler local rules and templates. The product feels much smarter with a working Gemini key.

## Project Structure

```text
apps/
  android/     Expo / React Native Android app
  desktop/     Tauri + React desktop app

packages/
  core/        shared product logic
  llm/         Gemini adapter, prompts, fallback templates
  embed/       embedding helpers
  ui/          shared desktop UI pieces

supabase/
  migrations/ database schema and sync policies
```

## Environment

Create a `.env` file from `.env.example`:

```powershell
cp .env.example .env
```

Typical values:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...

EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Users can also paste their Gemini API key inside the app settings.

## Install Dependencies

From the repo root:

```powershell
pnpm install
```

## Desktop Development

Run the desktop app in development:

```powershell
cd apps\desktop
pnpm tauri dev
```

## Build Desktop

```powershell
cd apps\desktop
pnpm tauri build
```

## Android Development

With a phone or emulator connected:

```powershell
cd apps\android
npx expo run:android
```

For dev-client reloads:

```powershell
cd apps\android
npx expo start --dev-client
```

## Build Android APK

```powershell
cd apps\android\android
.\gradlew.bat :app:assembleRelease --no-daemon --console=plain
```

Android APKs do not install on iPhone. iOS needs a separate iOS build through Xcode, EAS Build, TestFlight, or the App Store.

## Sync

Supabase is used for:

- sign up
- sign in
- cloud sync
- backup across desktop and mobile

Echo encrypts note content before syncing, so the cloud table stores encrypted payloads rather than readable notes.

## Privacy

Echo's privacy model:

- notes live on the user's device
- synced note content is encrypted before going to Supabase
- Supabase Auth separates user accounts
- Gemini only receives the entries and context needed for AI features

Important: if Gemini is enabled, selected note text is sent to Google for AI processing. That is the tradeoff for smarter classification and better Close questions.

## LLM Usage

Echo keeps Gemini usage compact:

- classify entries with short prompts
- send compact Close context
- fall back to templates when Gemini is unavailable

If Gemini is unavailable, Echo still works with local scoring and fallback prompts.

## Product Principle

Echo should stay focused.

The point is not to become a giant productivity system or a generic AI chat app. The loop is simple: capture what crossed your mind, then come back later and close what still matters.

Capture first. Close later. Keep the loop alive.
