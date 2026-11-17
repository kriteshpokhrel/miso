# Nooki

A gentle desktop cat for Windows and macOS. Feed, pet or play; let Nooki wander nearby, or send them home for quiet. Needs never cause death or sickness. Core companionship works offline without AI.

**Prototype:** an original real-time 3D cat with glossy expressive eyes and compact settings. Windows development/native smoke verification is available; macOS integrations require verification on a Mac. Builds are unsigned. The pet requires WebGL 2-capable graphics; failures are reported visibly.

## Run

Use Node.js 22 LTS and npm on Windows or macOS:

```powershell
npm ci
npm start
```

The first launch opens preferences. **Only the pet** lives on the desktop: tap for a scritch, drag to move, or right-click for **Feed**, **Pet**, **Play**, **Home** and **Settings**. Focus the cat and press Enter or Shift+F10 to open the same menu. The tray/menu-bar icon restores Nooki; its menu also opens settings or quits. Closing settings does not quit the companion.

Nooki wanders along the current display's work-area floor. Nearby, their head and eyes turn toward your cursor and settle when it moves away. When hungry, they follow the cursor horizontally and can follow it to another display. Energy recovers during naps. **Home** walks to an edge, hides, pauses needs and comments, and unloads optional inference. Reduced motion skips travel, gaze and animated reactions; expressions remain. Home state and needs survive relaunch; elapsed time while closed is not charged.

Sometimes Nooki copies your work with a tiny laptop, without inspecting what you are doing. **Stretch those paws** offers an affectionate reminder after 45 minutes of active companion time; home pauses that timer. **Pocket or pounce?** adjusts pet size. **Talkativeness** controls occasional comments, including reminders.

Repeated long drags build a disturbance score that fades over time. Nooki may briefly look grumpy and joke about closing an app, but **cannot and will not close or control another application**. Scritches help them settle. This is expressive play, never a punishment.

**Launch at sign-in** defaults on in a packaged app. Development runs save the preference without registering the Electron development executable as a startup application. The OS may still require startup approval; see [platform limitations](docs/PLATFORMS.md).

## Optional private AI

Nooki already has scripted reactions. AI is off by default and is never needed for care, wandering or home.

1. In preferences, review the exact model size, source, Apache-2.0 license and resource note.
2. Explicitly consent, then download the model. You can cancel, retry or remove it.
3. Add application **names**, such as `Code.exe` on Windows or `Safari` on macOS, one per line.
4. Enable local AI and save preferences.

Only exact, case-insensitive allowlisted names can trigger inference. An empty list shares no names. No window titles, document contents, keystrokes, screenshots or app history are collected. The optional download connects to Hugging Face and its approved file-delivery hosts; the companion has no accounts, telemetry, cloud inference or external Ollama requirement.

The fixed model is **SmolLM2-135M-Instruct Q4_K_M**, **105,454,432 bytes** (about 101 MiB). It is deliberately small: generated text may be simplistic or unhelpful. Invalid/repetitive output is discarded and scripted comments remain available. CPU inference uses at most two threads, a 512-token context and 48 output tokens, with cooperative cancellation after 12 seconds. Native setup/cleanup can take additional time. The backend unloads after each inference and at home.

Model license, pinned source and integrity details: [privacy and model notes](docs/PRIVACY.md).

## Develop and verify

```powershell
npm test
npm run typecheck
npm run build
npm run smoke
npm run pack
npm run dist -- --win nsis
```

`npm run smoke` opens the actual Electron app briefly and exercises real transparent WebGL rendering, left/right gaze and neutral reset, reduced motion, isolated preload/IPC, care, edge-home hiding, needs pause, restore, settings, rejected privileged calls, download consent and persistence. It uses ignored `.smoke-data`, never changes login registration, and never downloads a model. Expected rejected-call errors appear in its output.

After you have independently consented and downloaded the catalog model into `.smoke-data\models`, `npx electron . --smoke-test --smoke-inference` also exercises the embedded backend. This flag itself does **not** download a model. Do not copy model weights into source control or the installer.

`npm run pack` produces an unpacked app under `release`. `npm run dist` builds the host platform's installer. A macOS `.dmg`/`.zip` must be built on a Mac. There is no auto-updater or automatic release publishing. Do not ship unsigned prototypes as trusted production releases.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/domain` | Pure deterministic needs, care, home and comment rules; future species configuration |
| `src/shared/contracts.ts` | Typed snapshot/settings/preload contract |
| `src/main` | Native windows, tray, IPC, process-name adapter, persistence |
| `src/main/ai` | Fixed model catalog, verified download/storage, private embedded inference |
| `src/renderer` | Local-only Three.js cat/pose rig, accessible interactions and preference sheet |

State is validated versioned JSON under Electron's per-user application data directory. Writes are serialized and atomically replaced. Unreadable state is preserved as a timestamped backup and reported in settings. Model files live in its `models` subdirectory; **Remove model** deletes only the catalog's own files.

See the [execution plan](docs/EXECUTION_PLAN.md), [verification evidence and remaining limits](docs/VERIFICATION.md), [platform/release checklist](docs/PLATFORMS.md), and [privacy notes](docs/PRIVACY.md). The repository and original artwork are MIT licensed; third-party runtime/model licenses are separate.
