# Nooki

A gentle desktop cat for Windows and macOS. Feed, pet or play; let Nooki wander nearby, or send them home for quiet. Needs never cause death or sickness. Core companionship works offline without AI.

**Prototype:** an original real-time 3D cat with glossy expressive eyes and compact settings. Windows development/native smoke verification is available; macOS integrations require verification on a Mac. Builds are unsigned. The pet requires WebGL 2-capable graphics; failures are reported visibly.

## Run

Use Node.js 22 LTS and npm on Windows or macOS:

```powershell
npm ci
npm start
```

The first launch opens preferences. **Only the pet** lives on the desktop: tap for a scritch, drag to carry, or right-click for an **upper semicircle** of Feed, Play, Sleep, Home and Settings. Opening care freezes travel and the rendered pose without shrinking or moving the pet; closing resumes it. Enter or Shift+F10 opens the same controls; arrows move focus and Escape dismisses them. Feeding brings a bowl and eating pose; scritches earn nuzzles and hearts; play brings a ball. **Sleep** lies down with quiet breathing and visual snoring, without props or audio; tap to wake. A sleeping pet stays where it is even if another display becomes active. The tray/menu-bar icon restores Nooki and its menu opens settings or quits.

Nooki strolls along the active window's **top edge** when it has room above it, otherwise along the display's work-area floor. **A window seat** controls this geometry-only following; maximized, minimized, cramped or unavailable windows fall back with a reason shown in Pets. Compact perching reclaims transparent speech padding without shrinking the pet; speech moves below. Four continuous, joint-driven walking legs blend into the original torso and paws, with speed-matched planted steps and two gentle weight shifts per stride instead of rapid bouncing. Surface jumps crouch, reach and settle; larger drops show a frightened paws-out pose.

After carrying, Nooki first falls straight down on the release display, then waits briefly before following. Reaching another display uses an adjacent, floor-aligned route rather than a diagonal flight; gaps or vertically offset floors retain a safe local fallback with a carry-there hint. Physical multi-monitor/DPI transitions still need manual verification.

**Home** walks right, reveals a little house, lets her enter, then slides the house off the right edge before hiding. Needs and comments pause immediately and optional inference unloads. **Paw pace** offers Still, Gentle and Lively: no autonomous motion, occasional slow strolls, or more frequent faster exploring. System reduced motion overrides all three and skips home travel/animation; expressions and care props remain. Home state and needs survive relaunch; elapsed time while closed is not charged.

Nooki sometimes relaxes, gently kneads or yawns, and occasionally copies work with a tiny laptop without inspecting your activity. **Stay, please** in Pets settings stops autonomous position changes while preserving expressive animation and manual carrying. **Stretch those paws** offers a break reminder after 45 minutes together; home pauses the timer. **Pocket or pounce?** offers 50%, 60%, 70%, 80%, 90%, 100%, 130% and 150%. **Talkativeness** controls occasional comments. Speech is capped at 72 characters and three seconds; new care, dragging, sleep, settings or home cancels older dialogue and stale AI responses.

In **Settings → Pets**, select Nooki and customize her in the same place: **Single tone** or **Dual tone**, coat/contrast colors, four palettes, size and behavior. **General** holds startup and optional AI. The live 3D preview only tries colors on: **Save preferences** applies them to the desktop and remembers them. Single tone keeps your contrast color for switching back. **Revert coat edits** leaves other drafts intact.

Repeated rapid drag reversals build a fading disturbance score. Irritation appears **during** shaking, not only after release; ordinary carrying adds little stress. The angry expression lasts five seconds before a separate affectionate reassurance. The warning bubble still clears within three seconds, and a new action cancels the sequence. Nooki **cannot and will not close or control another application**. Scritches help her settle. This is expressive play, never a punishment.

**Launch at sign-in** defaults on in a packaged app. Development runs save the preference without registering the Electron development executable as a startup application. The OS may still require startup approval; see [platform limitations](docs/PLATFORMS.md).

## Optional private AI

Nooki already has scripted reactions. AI is off by default and is never needed for care, wandering or home.

1. In **General**, check the visible model size; expand **Model details** for its source, Apache-2.0 license and resource note.
2. Explicitly consent, then download the model. You can cancel, retry or remove it.
3. Opt in to common app-name presets (Chrome, VS Code, Outlook, browsers, Slack, Teams, Terminal, IntelliJ IDEA and GitHub Desktop). **Add another app by process name** accepts custom names, not paths. Presets use platform-specific exact names and do not scan installed apps.
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

`npm run smoke` exercises real transparent WebGL, gaze, a deterministic native window-edge fixture/hop, sideways walking, Still, eating, live drag irritation and separate reassurance, radial care, the house entrance/departure, needs pause, restore, sidebar/model disclosure, privileged IPC denial, consent and persistence. It also checks draft-only coat preview/save/reopen and compact Save visibility. It uses ignored `.smoke-data`, never registers startup or downloads a model, and does not inspect the user's foreground window; the read-only Windows geometry helper is verified separately. Expected denied calls log errors.

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

## Adding another species

Only the cat is implemented. Add a definition to `src/shared/species.ts` for needs, care, personality and scripted lines, with an optional `reactToCare` strategy. Implement the anatomy-independent `PetModel` interface and register its factory in `src/renderer/pet-models.ts`; the exhaustive registry catches missing models at compile time. The selector comes from that registry. Shared simulation, care, persistence and AI projection do not need cat-specific edits. A dog, panda or eight-armed octopus supplies its own rig and poses rather than inheriting cat limbs. Unregistered species are rejected, not presented as completed characters.
