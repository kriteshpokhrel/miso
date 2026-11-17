# Prototype verification

Verified on Windows on 2026-11-17. This records local evidence, not a claim of production readiness.

| Check | Result |
| --- | --- |
| Related GitHub issues/PRs and repository conventions | Fresh MIT repository; no existing issues, PRs or AGENTS.md contract |
| `npm test` | 63 tests passed: needs/sleep/home, disturbance, break timing, renderer drafts/gestures, nearby-cursor normalization, 3D gaze/expressions/reduced motion/resource disposal, privacy projection, download integrity/cancellation/storage and persistence |
| `npm run typecheck` / `npm run build` | Passed |
| Native Electron smoke | Passed actual WebGL pixels with transparent surroundings, left/right head tracking through preload and neutral reset, home/reduced-motion attention guards, isolated preload/no renderer Node, no toolbar, care, imitation/irritation, break scheduling, home edge-hide/needs pause, restore, size, consent, privileged IPC rejection and persistence |
| Fractional-DPI movement | Repeated native movement preserves size; explicit bounds avoid observed `setPosition` rounding growth |
| Windows foreground-name adapter | Native query succeeded; only success was logged, not the application's name |
| Model download | User explicitly consented to 105,454,432 bytes; pinned SHA-256 verified successfully |
| Embedded inference | Actual CPU inference ran in Node, Electron development app and packaged Windows executable; no Ollama or runtime binary download |
| Generated-output fallback | Repetitive and assistant-boilerplate outputs were observed, rejected, and replaced by existing scripted behavior; tiny-model quality remains limited |
| Windows packaging | `npm run dist -- --win nsis` passed; `release\Nooki Setup 0.1.0.exe` and unpacked app generated, unsigned |
| Packaged native smoke | Rebuilt 3D `Nooki.exe --smoke-test` passed including actual WebGL/gaze and native integration. Before the graphics upgrade, `--smoke-inference` also passed asar/native CPU library loading; no new model download was made for 3D verification |
| UI review | Actual original 3D cat, directional gaze, laptop mimic and grumpy reaction captures inspected; self-shadow artifacts removed and packaged captures confirmed. Settings retained their previously verified design; mechanical design detector returned no findings |
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high` reported no known vulnerabilities |
| Complete dependency audit | No high/critical advisories; six moderate entries in the existing electron-builder/minimatch development-tool chain. No forced breaking dependency downgrade applied; Three.js has no reported advisory |
| Bundled licensing | Three.js MIT notice copied into the packaged renderer alongside its bundled code |

Expected rejected IPC/consent calls log errors during smoke; those are assertions of denial, not unexpected failures. The model was tested with synthetic `code.exe` context and pet scalars, never document/window contents. Test model copies are not bundled or tracked.

## Still requiring target-platform/manual verification

- macOS build/runtime, menu bar, Spaces/full-screen behavior, foreground-name adapter, CPU library loading and login approval.
- Installation on a clean machine, actual OS sign-in/reboot behavior, signing, notarization and distribution trust.
- Physical multi-monitor edge cases, display removal and long-running resource measurements across target hardware.
- Physical mouse/tray interaction on each platform in addition to the automated gesture/bridge and native window checks.
- Pixel-perfect transparent click-through is not implemented; the pet window's small rectangular bounds can intercept clicks.
- WebGL 2 compatibility on other graphics drivers/hardware, context-loss recovery under an actual driver failure, and long-running 3D CPU/GPU/memory/battery cost. The renderer reports unavailable/lost graphics explicitly and caps draws at 30fps and pixel ratio at 2; those are not battery-life measurements.

The configured Windows/macOS CI matrix has not been run remotely in this session. No release was published. Impeccable's requested CLI update could not locate the app-bundled skill installation; this session used the installed design skill and completed its local detector/review.
