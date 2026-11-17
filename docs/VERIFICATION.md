# Prototype verification

Verified on Windows on 2026-11-17. This records local evidence, not a claim of production readiness.

| Check | Result |
| --- | --- |
| Related GitHub issues/PRs and repository conventions | Fresh MIT repository; no existing issues, PRs or AGENTS.md contract |
| `npm test` | 122 tests passed: needs/manual sleep/home, species contracts, motion/surface/connected-display routing, drag stress, timed reactions, renderer drafts/gestures, gaze/expressions/reduced motion/disposal, continuous-leg attachment/finite geometry, gentle gait cadence/projected planted paws, closed-window IPC guards, bounded OS helpers, validation/migration, privacy projection, download integrity/cancellation/storage and persistence |
| `npm run typecheck` / `npm run build` | Passed |
| Native Electron smoke | Passed actual transparent WebGL, directional gaze/reset, top-edge fixture and hop phases, speed-coupled walking, local vertical release landing, in-drag irritation/five-second hold/reassurance, superseded speech cancellation, five-action frozen care arc, settings-only pinning, lying sleep/focus anchoring/tap wake, relaxation/yawning, all Home phases/needs pause/restore, 50% size, consent/IPC denial, coat drafts/save/reopen and persistence |
| Fractional-DPI movement | Repeated native movement preserves size; explicit bounds avoid observed `setPosition` rounding growth |
| Windows foreground-name adapter | Persistent helper cold and warm native queries passed; only success was logged, not the application's name. Response/exit/deadline/error cases are covered by focused tests |
| Model download, earlier prototype evidence | User explicitly consented to 105,454,432 bytes; pinned SHA-256 verified successfully. No model was downloaded during this refinement |
| Embedded inference, earlier prototype evidence | Actual CPU inference ran in Node, Electron development and packaged Windows executables without Ollama/runtime binary downloads. The final movement/settings package was checked without model weights; live inference was not rerun for this iteration |
| Generated-output fallback, earlier prototype evidence | Repetitive and assistant-boilerplate outputs were observed, rejected, and replaced by scripted behavior; tiny-model quality remains limited. Current projection/output rules retain focused test coverage |
| Windows packaging | `npm run dist -- --win nsis` passed for the final source; unsigned `release\Nooki Setup 0.1.0.exe` is 134,630,952 bytes, rebuilt at 16:07 local host time on 2026-11-17. The default Electron application icon remains a distribution limitation |
| Packaged native smoke | Actual rebuilt `release\win-unpacked\Nooki.exe --smoke-test` passed the integrated checks, including visible bounded model disclosures at 660x800 and 500x540. Home travel took 5,658ms and the house sequence 4,370ms in this run; separate bounded observation budgets avoid truncating the sequence |
| Destroyed-object regression | Reproduced a late drag-end authorization path accessing a destroyed window getter after a failed smoke shutdown. Added dead-owner/sender/shutdown guards before native getters, with three focused authorization regressions. Final packaged output contained no `Object has been destroyed` or `TypeError` |
| UI review | Inspected actual original-character side/three-quarter walking, continuous thigh joins, sleep without props, care arc, eating, frightened falls, jump phases and house entrance/turn/departure. Model metadata now opens beside its information icon, flips above when needed and remains scrollable inside regular/compact viewports. Native assertions require visible nonzero popup geometry, not merely an in-bounds empty rectangle |
| Dependency audits, earlier unchanged-lockfile evidence | Runtime audit reported no known vulnerabilities; full audit had no high/critical advisories and six moderate entries in the electron-builder/minimatch development-tool chain. Dependencies were not changed during this refinement; no forced breaking downgrade or fresh audit was performed |
| Bundled licensing | Three.js MIT notice copied into the packaged renderer alongside its bundled code |
| Coat closet | Actual shared 3D preview exercised through presets and color/pattern inputs. Drafts did not change saved desktop appearance; single tone applied one material color while retaining contrast; reopened settings restored it; custom dual colors rendered on the actual desktop and round-tripped through the atomic store |
| Coat layout | Current native captures reviewed at regular and compact widths, including stacked controls and a native assertion that Save remains in the compact viewport. No additional dependencies or generic privileged IPC surface added |

Expected `Untrusted request` and explicit-consent rejection logs during smoke are intentional negative assertions, not unexpected failures. The earlier inference checks used synthetic `code.exe` context and pet scalars, never document/window contents. Model weights and `.smoke-data` evidence are not bundled or tracked.

The approved walking change preserves the original body, face, eyes, tail, coat and care poses. The rejected whole-animal redesign is not included. A possible product rename is still undecided; no app identity or local-data migration was performed.

## Still requiring target-platform/manual verification

- macOS build/runtime, menu bar, Spaces/full-screen behavior, foreground-name adapter, CPU library loading and login approval.
- Installation on a clean machine, actual OS sign-in/reboot behavior, signing, notarization and distribution trust.
- Physical multi-monitor edge cases, display removal and long-running resource measurements across target hardware.
- Physical mouse/tray interaction on each platform in addition to the automated gesture/bridge and native window checks.
- Physical mouse/keyboard operation of each platform's native color dialog; automated coverage changes the same color input through its DOM event and verifies real material rendering, not the OS dialog UI itself.
- Pixel-perfect transparent click-through is not implemented; the pet window's small rectangular bounds can intercept clicks.
- WebGL 2 compatibility on other graphics drivers/hardware, context-loss recovery under an actual driver failure, and long-running 3D CPU/GPU/memory/battery cost. The renderer reports unavailable/lost graphics explicitly and caps draws at 30fps and pixel ratio at 2; those are not battery-life measurements.

The configured Windows/macOS CI matrix has not been run remotely in this session. No release was published. Impeccable's requested CLI update could not locate the app-bundled skill installation; this session used the installed design skill and completed its local detector/review.
