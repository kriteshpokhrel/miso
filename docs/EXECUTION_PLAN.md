# Nooki prototype execution plan

## Architecture
Electron and TypeScript provide maintained cross-platform transparent windows, tray, cursor and login APIs. Pure domain functions remain independent of Electron and future species. A sandboxed renderer receives a narrow typed preload bridge. The main process owns OS access, persistence and optional embedded `node-llama-cpp` inference, with no external inference server. The larger Electron/runtime footprint is the trade-off for this thin integrated slice.

## Dependencies and ownership
1. Integrator establishes shared contracts, build configuration and product direction.
2. Three agents run concurrently after those contracts: domain (`src/domain/**`), UI (`src/renderer/**`), AI (`src/main/ai/**`). They may read shared contracts but not modify them or dependency manifests.
3. Integrator owns preload, main OS integration, persistence, packaging and documentation. Reconciles agent interfaces, then runs integrated verification.
4. Verification depends on all three agents and native integration. No agent's isolated success establishes integrated completion.

## Acceptance criteria
- Domain: bounded hunger and energy, feed/pet/play reactions, hungry following intention, scripted needs, comment cooldown, no death/sickness; home pauses time and needs.
- UI: expressive original cat, functional controls and settings, keyboard access, reduced motion, honest model progress/errors/cancellation. Evaluate visual style rather than lock it as pixel art.
- OS: desktop wandering, cursor following when hungry, animation to edge before home hide, tray restore, persistent settings, startup default with disable.
- Privacy: validated IPC sender and payloads, context isolation, no renderer Node, no remote pages, process names only, strict allowlist, no titles/documents or telemetry.
- AI: explicit model size/license/source/consent, bounded cancellable download, integrity verification and atomic promotion, safe local storage/removal, capped inference, scripted fallback. No Ollama installation. No core feature depends on download/network/AI success.
- Release: focused tests, typecheck, renderer/main build, Windows desktop smoke and package build where available; CI/package configuration and developer, privacy, licensing and release documentation.
- macOS: implement platform adapter and packaging configuration, but explicitly mark native behavior/signing/notarization unverified until run on macOS.

## Negative and edge scenarios
Corrupt settings, invalid IPC, invalid allowlist entries, denied OS queries, AI disabled/missing/failing, redirected/oversized/corrupt/cancelled downloads, home during inference, rapid care actions, clock jumps, reduced motion, display removal and off-screen coordinates.

## Release boundary
This is an unsigned prototype, not a signed/notarized production release. Live verification evidence and any incomplete acceptance criteria belong in README and the final handoff.

## Confirmed iteration during implementation
Add occasional laptop imitation, affectionate break reminders, distance/repetition-based dragging disturbance with decaying irritation and harmless jokes, pet-only desktop presentation via context-menu care, configurable size, talking/walking animation, and playful clear preference names. Domain agent owns score/time rules and tests; renderer agent owns drag/context-menu interactions, new SVG expressions and settings; integrator owns constrained native dragging, sizing, menu and scheduling. These changes join the integration acceptance criteria rather than remain suggestions.

## Approved 3D replacement
The user rejected the flat character's limited emotion and approved an original rounded real-time 3D cat, with nearby-cursor head/eye tracking. Three.js provides real geometry, materials and a maintainable pose rig rather than simulated SVG shading; this introduces a WebGL 2 requirement and bounded GPU cost. Existing Electron boundaries, native movement, settings identity and offline behavior remain unchanged.

1. Define transient normalized attention and a typed event, with proximity/scale tests and home/sleep/drag/reduced-motion guards. No global coordinates enter the renderer, persistence or AI.
2. Independently build procedural original geometry and mood poses, then connect a separate WebGL entry to the existing gesture container. Preserve care, size, speech, keyboard access and settings; cap resource use and report graphics failures.
3. Integration depends on both: run rig/domain/UI tests and strict compilation, verify actual transparent native pixels and directional gaze/reset, inspect expressions, rebuild Windows installer and run packaged smoke. Update design/privacy/release evidence and retain explicit macOS/signing/hardware limits.

## Coat customization iteration
Add a dedicated Coat closet page within existing Settings: single/dual-tone selection, two color pickers, named palette presets, a draft-only live preview and explicit save/revert. Reuse existing geometry and settings persistence rather than introducing character assets or another privileged API. Acceptance includes legacy defaults, strict hex/pattern validation, accent retention in single mode, revision-safe background/save handling, lazy paused preview graphics, material updates without rebuilding the rig, native preview/save/reopen evidence and compact-layout Save visibility.

## Natural movement and expressive care iteration
The user approved following the **top edge of the active window**, with desktop fallback. Motion is purposeful: speed-coupled gait/turning, bounded smooth surface hops, immediate irritation, eating/batting/scritches and a quiet house entrance/departure, not decorative UI motion.

1. **Motion/contracts prerequisite:** typed travel notifications without coordinates; Still/Gentle/Lively profiles and legacy migration; fractional dt-based acceleration/braking; geometry-only platform tracking; system accessibility override; live reversal-based stress. Accept deterministic tests for bounded surfaces, fallbacks, frame-rate independence, ordinary carrying versus shaking, invalid settings/native responses and staged dialogue.
2. **Rig, dependent on motion:** clean rounded ears without a head patch/base bulge; side-facing four-paw gait tied to velocity, tucked airborne/dragged paws and distinct eating/affection/play poses. Home walks right, reveals a house, admits the pet, then slides the house offscreen. No window-control API; Still/system reduced motion skips travel. Accept direct geometry/pose/teardown tests and actual native rendered evidence.
3. **Settings/interaction, dependent on contracts:** Pets/General sidebar; real cat selection and coat customization together; three motion levels and following toggle; size/behavior drafts preserved. Info disclosure holds optional-model metadata, not visible size/consent. Accessible surrounding care icons replace the native list. Speech has a readable anchored tail and separate warning/reassurance beats. Pointer interaction must not force a focus ring; keyboard focus must remain visible.
4. **Integration, dependent on all:** strict build/tests, native top-edge fixture, native Windows helper, in-drag irritation, both dialogue beats, eating and radial controls, all home phases, compact/sidebar/disclosure/save/persistence evidence; one batched visual pass and at most one coherent correction/confirmation. Rebuild Windows installer and run packaged smoke. Update privacy/platform/design evidence; macOS, OS permissions, physical multi-display and signing remain explicit unverified boundaries.

An independent UI delegation was attempted but its custom agent required an absent governance contract. No contract was invented; the integrator retained ownership and completed that work directly. No new dependency or generic privileged IPC surface was introduced.

## Final approved refinements

- Keep the original character: integrate only continuous walking-leg surfaces and calmer, gait-synchronized body/head movement. The alternative whole-animal redesign was rejected and is not included. Acceptance: thigh/ankle endpoints remain inside the original torso/paws, geometry/normals remain finite, shared coat materials and disposal remain correct, and two full strides produce four subtle weight shifts.
- Reduce the care arc to Feed, Play, Sleep, Home and Settings; retain direct-tap scritches and settings-only pinning. Freeze travel and drawing while care is open. Keep species-neutral sidebar labels and sizes down to 50%.
- Chosen sleep lies down without props and remains anchored despite foreground/display changes. Release first lands vertically on its current display, then resumes following; cross-display walking requires connected floor-aligned work areas. Physical display/DPI verification remains a manual boundary.
- Hold anger for five seconds before reassurance, independently expire concise speech, and prevent interrupted warnings or AI responses from overwriting new care.
- Verify the actual integrated renderer, native Home arrival/entry/departure and model disclosure before rebuilding the Windows installer and running its packaged smoke. Travel and the 4.3-second Home sequence have separate bounded smoke deadlines; slow travel must not consume the sequence's observation budget.
- Reconcile developer/privacy/design/platform documentation, record actual evidence in `VERIFICATION.md`, then commit the integrated source. Naming alternatives remain a product decision, not an implicit migration.

Final local outcome: 122 tests, strict types/build, native integration, unsigned NSIS generation and the actual unpacked Windows executable's smoke passed. The reported destroyed-object teardown race now rejects closed-window requests before touching native getters. Model details were visually confirmed open and bounded at regular and compact sizes. macOS, physical monitor/DPI transitions, clean-machine installation/startup and signing/notarization remain the explicit release boundaries in `VERIFICATION.md`; live inference evidence for this iteration is historical, not presented as a fresh model run.
