# Miso architecture

## Decisions and boundaries

Electron provides cross-platform transparent windows, tray/menu-bar integration,
cursor/display APIs, startup integration and a sandboxed renderer. TypeScript
keeps domain, native and rendering contracts aligned. This trades a larger
installation/runtime footprint for one maintainable Windows/macOS application.
A native-per-platform UI would reduce some framework overhead but duplicate OS
and rendering integration. A browser-only application cannot provide this
desktop window/tray behavior.

Three.js renders original procedural companions with real geometry and expressive
poses. WebGL 2 and target-driver verification are required. The optional
`node-llama-cpp` backend embeds local CPU inference: no Ollama service or
opportunistic runtime downloads. Scripted behavior is always available, so a
missing model, denied download or inference failure does not disable the pet.

## Process and window ownership

Main (`src/main/index.ts`) owns saved state, timers, movement, native windows,
bounded OS helpers, tray, IPC and the optional AI service. Every window loads the
same local HTML/preload with a different view and isolated session partition.

| Window/view | Responsibility | Privileged access |
| --- | --- | --- |
| Pet/default | Transparent creature, gestures, drag and keyboard menu trigger | Care, narrow toggles and its own dragging |
| `care` | Temporary fixed-scale eight-action upper arc | Care and narrow Stay/Roam/following toggles; no general settings/model writes or dragging |
| `speech` | Non-focusable, click-through dialogue | Snapshot reads only |
| `settings` | Companion choice, draft preview, preferences and model management | Validated general settings and model operations |

All renderers are sandboxed, context-isolated and Node-free. They deny external
navigation, new windows, network requests and permission requests. The frozen
`window.miso` bridge names each operation. Main validates the live owner and
top-level frame before payload processing; shutdown/dead-owner checks precede
native getters to avoid destroyed-object races.

The pet's native bounds and page zoom follow its 50%-150% setting. Care and speech
use separate zoom-1 windows, not inverse-zoom text inside a larger pet frame.
This keeps 44px care targets and readable dialogue without moving the creature
or permanently enlarging its input rectangle. Pure `src/shared/pet-ui.ts`
calculates work-area-clamped popup bounds and the upper arc. Speech flips below a
compact perch when room permits; only its local arrow anchor reaches the
renderer, never global positions.

Opening care suspends native travel and actual scene drawing. Blur/outside
dismissal does not reclaim focus from another app; Escape requests pet focus.
Closing resumes the interrupted hop clock rather than advancing it invisibly.
Speech never takes focus, ignores mouse events, and hides on cancellation, Home
or care opening. Auxiliary views create no Three.js scene. Extra native windows
are the resource/lifecycle trade-off for independent UI scale.

## Simulation and movement

Pure functions in `src/domain` implement hunger, energy, care, sleep, Home,
scripted lines, active-time break reminders and fading drag disturbance. Main
owns clocks/random scheduling and persists validated bounded state. Closed-app
time is not charged. Needs never become sickness or death.

Movement uses explicit native dimensions, fractional positions, acceleration and
speed-coupled animation. It follows a sufficiently roomy active-window top edge,
otherwise the display floor. Read-only geometry helpers return transient bounds
and visibility/maximized metadata only. Release lands locally before following;
cross-display routes require adjacent, floor-aligned displays. Sleep pins the
position, Stay pauses autonomous travel, and system reduced motion overrides
motion preferences. Roam switches Still to Gentle but never overrides the OS.

Only normalized motion/attention and descriptive following status cross into
renderers. Hungry cursor following, imitation and break reminders do not require
application-content access. Irritation is harmless dialogue and animation, not
an application-control capability.

## Species and rendering

`src/shared/species.ts` is the identity/needs/personality/care-text registry.
`PetModel` and the exhaustive factory in `src/renderer/pet-models.ts` define model
availability. Settings generates its companion radio choices from that registry.
Selecting previews a draft; Save applies it and starts the chosen species with
fresh gentle needs while preserving Home. Appearance colors are shared.

The approved original cat retains its independent rig. Dog and panda compose
`quadruped-model.ts`; octopus owns an independent eight-arm crawl.
`companion-kit.ts` shares facial expressions, props, resource ownership and Home
choreography. `soft-limb.ts` deforms continuous tapered surfaces in place rather
than creating meshes each frame. New species must implement the full interface
and tests; no generic fallback silently claims support.

`pet-scene.ts` owns camera, lighting, renderer and model disposal. Desktop and
draft preview are separate scenes. Hidden views suspend drawing, the preview is
lazy, and animation is capped at 30fps with device pixel ratio at most 2.
Graphics failures are visible. These limits are not battery-life measurements.

## State and settings

`contracts.ts` defines the shared snapshot/API and defaults. Main validates
settings and state at every external boundary. `StateStore` serializes writes
and atomically replaces versioned JSON; unreadable state is backed up and
reported instead of silently discarded.

Renderer drafts track dirty fields/revisions so broadcasts and completed older
saves cannot overwrite newer edits. Companion, coat and behavior choices apply
only on Save. Narrow quick actions persist their named preference without
granting the care window arbitrary settings access.

Normal data is under Miso's per-user application-data directory; models occupy
its `models` subdirectory. Application identity changes do not import or delete
earlier identities' files. No telemetry or application-usage history is stored.

## Optional AI lifecycle

Settings explicitly consents to the fixed, size-disclosed model. Download checks
trusted HTTPS redirects, byte length, hash and storage safety before atomic
promotion. Cancellation cleans only owned partial files. Startup verifies an
installed model before use.

Inference is gated on enabled AI, a ready model, due comments and an exact
allowlisted app name. Prompt projection contains only that name, personality and
bounded pet state. Output is bounded plain text; unsuitable output falls back to
scripted behavior. Resource caps, cancellation and unload-after-request/Home
limit retention. See [PRIVACY.md](PRIVACY.md) for precise guarantees and limits.

## Validation map

Pure tests cover domain/geometry/contracts; renderer tests cover drafts,
selection, gestures and auxiliary-view behavior; rig tests cover poses,
deforming geometry, reduced motion and disposal. Native smoke checks actual
transparent pixels, IPC denial, popup scale/focus/lifecycle, settings geometry,
persistence and every companion's rendered states. Packaged smoke runs the
built executable rather than treating compilation as runtime evidence.

See [VERIFICATION.md](VERIFICATION.md) for fresh results and
[PLATFORMS.md](PLATFORMS.md) for target-platform/manual release checks.
