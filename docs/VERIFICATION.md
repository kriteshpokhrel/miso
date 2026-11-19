# Prototype verification

Verified on Windows on 2026-11-17. This records local evidence, not a claim of production readiness.

| Check | Result |
| --- | --- |
| Related GitHub issues/PRs and repository conventions | Fresh MIT repository; no existing issues, PRs or AGENTS.md contract |
| `npm test` | 145 tests passed: needs/manual sleep/home, all four species' contracts/care/persistence/personality, motion/surface/connected-display routing, drag stress, timed reactions, renderer drafts/radio selection/gestures/auxiliary views, gaze/expressions/reduced motion/disposal, finite continuous limbs, gentle gait cadence/projected planted paws, closed-window IPC guards, fixed-size popup geometry/edge clamping, bounded OS helpers, validation/migration, privacy projection, download integrity/cancellation/storage and persistence |
| `npm run typecheck` / `npm run build` | Passed |
| Remote Windows/macOS CI | [Desktop checks for source commit `a0c00ca`](https://github.com/kriteshpokhrel/miso/actions/runs/44084533515) passed on both `windows-latest` and `macos-latest`: clean dependency installation, all tests, strict types and unpacked packaging. This verifies the macOS build, not interactive macOS runtime/permissions/signing |
| Miso rename | No previous-name references remain in tracked files or compiled application code. Native and packaged smoke require both the application name and renderer title to be Miso and exercise the renamed isolated `window.miso` bridge. Origin now points to the verified `kriteshpokhrel/miso` repository |
| Native Electron smoke | Passed actual transparent WebGL, directional gaze/reset, top-edge fixture and hop phases, speed-coupled walking, local vertical release landing, in-drag irritation/five-second hold/reassurance, superseded speech cancellation, eight-action frozen care arc at 50% and 100%, persisted quick pin/follow toggles, lying sleep/focus anchoring/tap wake, relaxation/yawning, all Home phases/needs pause/restore, consent/IPC denial, coat drafts/save/reopen and all companion models |
| Fractional-DPI movement | Repeated native movement preserves size; explicit bounds avoid observed `setPosition` rounding growth |
| Windows foreground-name adapter | Persistent helper cold and warm native queries passed; only success was logged, not the application's name. Response/exit/deadline/error cases are covered by focused tests |
| Model download, earlier prototype evidence | User explicitly consented to 105,454,432 bytes; pinned SHA-256 verified successfully. No model was downloaded during this refinement |
| Embedded inference, earlier prototype evidence | Actual CPU inference ran in Node, Electron development and packaged Windows executables without Ollama/runtime binary downloads. The final movement/settings package was checked without model weights; live inference was not rerun for this iteration |
| Generated-output fallback, earlier prototype evidence | Repetitive and assistant-boilerplate outputs were observed, rejected, and replaced by scripted behavior; tiny-model quality remains limited. Current projection/output rules retain focused test coverage |
| Windows packaging | `npm run dist -- --win nsis` passed for the final companions/readable-UI source; unsigned `release\Miso Setup 0.1.0.exe` is 134,653,436 bytes, rebuilt at 18:04:29 local host time on 2026-11-17. The default Electron application icon remains a distribution limitation |
| Packaged native smoke | Actual final `release\win-unpacked\Miso.exe --smoke-test` exited 0 with both `MISO_SPECIES` and `MISO_SMOKE passed`, exercising the same complete native/UI/companion checks, including bounded model disclosures and compact Pets at 500x540. Home travel took 1,402ms and the house sequence 4,302ms; separate bounded observation budgets avoid truncation. No unexpected `Object has been destroyed`, `TypeError` or startup failure occurred |
| Destroyed-object regression | Reproduced a late drag-end authorization path accessing a destroyed window getter after a failed smoke shutdown. Added dead-owner/sender/shutdown guards before native getters, with three focused authorization regressions. Final packaged output contained no `Object has been destroyed` or `TypeError` |
| UI review | Inspected actual original-character walking/joins, sleep without props, care, eating, frightened falls, jumps and Home; fresh new-species idle/walk/sleep/laptop contact sheet and corrected unobscured typing limbs; fresh Pets at 660x800 and 500x540, compact color fields, bounded General model disclosure, Tiny care and maximum-length speech. Companion radios are distinct and settings rules no longer cross fields. Native assertions require nonzero visible geometry, not an empty in-bounds rectangle |
| Dependency audits, earlier unchanged-lockfile evidence | Runtime audit reported no known vulnerabilities; full audit had no high/critical advisories and six moderate entries in the electron-builder/minimatch development-tool chain. Dependencies were not changed during this refinement; no forced breaking downgrade or fresh audit was performed |
| Bundled licensing | Three.js MIT notice copied into the packaged renderer alongside its bundled code |
| Coat closet | Actual shared 3D preview exercised through presets and color/pattern inputs. Drafts did not change saved desktop appearance; single tone applied one material color while retaining contrast; reopened settings restored it; custom dual colors rendered on the actual desktop and round-tripped through the atomic store |
| Coat layout | Current native captures reviewed at regular and 500x540 window sizes, including stacked controls, four companion radio choices and reachable sticky Save. Native checks reject actual two-dimensional label/field intersections, horizontal overflow and descendant fields crossed by a divider. No new dependency or generic privileged IPC surface |
| Tiny care/speech | Zoom-1 transparent auxiliary windows keep eight 44px targets and labels at least 12px at both pet scales. Native checks preserve the pet's exact bounds and rendered pixels with care open, reject overlapping/clipped labels, and require all 72 unbroken stress-test characters' actual glyph rectangles inside the speech viewport. The decorative tail is intentionally outside the text box and is not treated as clipped text |
| Auxiliary-window privileges | Actual care-window general settings/model writes and dragging are denied; speech-window care mutation is denied. Valid named pin/follow toggles persist. Roam resumes Gentle from Still without changing system reduced-motion preference. Auxiliary views instantiate no 3D scene |
| Additional companions | Actual Settings radio clicks preview dog/panda/octopus without changing the saved desktop; explicit Save applies and persists each. Native care and eight captured states per companion pass. Model tests cover finite/deforming geometry, reduced motion and owned-resource disposal; the original cat files are unchanged |
| Repository documentation | Root `AGENTS.md` routes product/design/architecture/privacy/platform/verification guidance. `docs/ARCHITECTURE.md` records native-window scaling, trust boundaries, rendering composition, state and AI lifecycle; no absent governance/ADR system is assumed |

Expected `Untrusted request` and explicit-consent rejection logs during smoke are intentional negative assertions, not unexpected failures. The earlier inference checks used synthetic `code.exe` context and pet scalars, never document/window contents. Model weights and `.smoke-data` evidence are not bundled or tracked.

An earlier companion-only run encountered a transient Windows `EPERM` replacing the smoke state's temporary file; a retry and subsequent complete native runs passed. State-store code was not weakened or given a silent-success fallback. During UI verification, overly broad initial assertions counted the decorative speech tail as text overflow and a correctly stacked label as horizontal overlap. They were corrected to measure actual glyph visibility and two-dimensional field intersections; the complete native run then passed.

The approved walking change preserves the original body, face, eyes, tail, coat and care poses. The rejected whole-animal redesign is not included. The product is now **Miso**, including its package, installer identity, IPC bridge/channels, native helpers, renderer copy and documentation. Miso uses a fresh `Miso` application-data directory without legacy-name aliases or automatic import; existing data from earlier identities remains untouched.

## Still requiring target-platform/manual verification

- macOS build/runtime, menu bar, Spaces/full-screen behavior, foreground-name adapter, CPU library loading and login approval.
- Installation on a clean machine, actual OS sign-in/reboot behavior, signing, notarization and distribution trust.
- Physical multi-monitor edge cases, display removal and long-running resource measurements across target hardware.
- Physical mouse/tray interaction on each platform in addition to the automated gesture/bridge and native window checks.
- Physical mouse/keyboard operation of each platform's native color dialog; automated coverage changes the same color input through its DOM event and verifies real material rendering, not the OS dialog UI itself.
- Pixel-perfect transparent click-through is not implemented; the pet window's small rectangular bounds can intercept clicks.
- WebGL 2 compatibility on other graphics drivers/hardware, context-loss recovery under an actual driver failure, and long-running 3D CPU/GPU/memory/battery cost. The renderer reports unavailable/lost graphics explicitly and caps draws at 30fps and pixel ratio at 2; those are not battery-life measurements.

The Windows/macOS CI evidence above is for the named source commit; it does not replace the target-platform/manual checks. No release was published at the time of this earlier verification. Impeccable's requested CLI update could not locate the app-bundled skill installation; this session used the installed design skill and completed its local detector/review.

## Release-preparation validation (2026-11-19)

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed on macOS ARM64 |
| `npm test` | 145 tests passed |
| `npm run typecheck` / `npm run build` | Passed |
| `npm run dist -- --mac dmg zip` | Passed; unsigned macOS ARM64 DMG and ZIP generated. Code signing was skipped because no valid Developer ID identity is configured. This is packaging evidence, not macOS runtime verification. |
| Native macOS `npm run smoke` | Failed in six attempts. Two first timed out waiting for the 3D coat preview to report selected colors; another stopped at a stationary-tap assertion; another timed out waiting for the octopus preview. The diagnostic run reported the coat canvas `ready:true`, still at its default colors `bda6df`/`fff0d9`, with no render/preview error while cocoa colors were expected. After the smoke explicitly showed/focused Settings, the dog rendered but the panda preview timed out. No cause was isolated; this does not establish a macOS runtime defect or verify macOS runtime behavior. The tag release gate does not include native smoke, and this limitation is disclosed in the prototype release notes. |
| Windows NSIS installer and tag-triggered release workflow | [Release run 44587325283](https://github.com/kriteshpokhrel/miso/actions/runs/44587325283) passed Windows and macOS clean installation, 145 tests, typecheck, installer generation and publication for source `76d015b`. |
| Published prototype | [v0.1.0-prototype.1](https://github.com/kriteshpokhrel/miso/releases/tag/v0.1.0-prototype.1) is a prerelease, not a draft or production release, with Windows NSIS, macOS ARM64 DMG/ZIP and SHA-256 checksums. The manifest was corrected after publication to use downloaded asset basenames, including GitHub's space-to-dot normalization of the Windows installer name; all three hashes match GitHub's uploaded-asset digests. Native runtime limitations above remain unresolved. |

## Release metadata repair (2026-11-20)

A lightweight `v0.1.0` tag at merge commit `dbadf558` triggered
[run 44590020212](https://github.com/kriteshpokhrel/miso/actions/runs/44590020212).
Both package jobs rejected the tag/version mismatch and publication was skipped.
Separately, the existing prototype release entry had been relabeled as
`v0.1.0`/production and its installer filenames changed without changing their
digests. The same release entry and assets were restored to
`v0.1.0-prototype.1`, prototype notes, original filenames and prerelease status;
neither tag was moved or deleted and no binaries were rebuilt. The stable tag
is retained as a historical ref, not a supported production release.

The follow-up workflow limits triggers to prototype tags, validates strict
prototype numbering and both manifests, and explicitly disables Latest.
