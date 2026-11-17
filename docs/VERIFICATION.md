# Prototype verification

Verified on Windows on 2026-11-17. This records local evidence, not a claim of production readiness.

| Check | Result |
| --- | --- |
| Related GitHub issues/PRs and repository conventions | Fresh MIT repository; no existing issues, PRs or AGENTS.md contract |
| `npm test` | 56 tests passed: needs/sleep/home, disturbance, break timing, renderer drafts/gestures, privacy projection, download integrity/cancellation/storage and persistence |
| `npm run typecheck` / `npm run build` | Passed |
| Native Electron smoke | Passed isolated preload/no renderer Node, no toolbar, care, imitation/irritation, break scheduling, home edge-hide/needs pause, restore, size, consent, privileged IPC rejection and persistence |
| Fractional-DPI movement | Repeated native movement preserves size; explicit bounds avoid observed `setPosition` rounding growth |
| Windows foreground-name adapter | Native query succeeded; only success was logged, not the application's name |
| Model download | User explicitly consented to 105,454,432 bytes; pinned SHA-256 verified successfully |
| Embedded inference | Actual CPU inference ran in Node, Electron development app and packaged Windows executable; no Ollama or runtime binary download |
| Generated-output fallback | Repetitive and assistant-boilerplate outputs were observed, rejected, and replaced by existing scripted behavior; tiny-model quality remains limited |
| Windows packaging | `npm run dist -- --win nsis` passed; `release\Nooki Setup 0.1.0.exe` and unpacked app generated, unsigned |
| Packaged native smoke | Final unpacked `Nooki.exe --smoke-test --smoke-inference` passed including asar/native CPU library loading |
| UI review | Actual Electron captures inspected for pet-only scene, laptop mimic, grumpy reaction and quirky settings; mechanical design detector returned no findings |
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high` reported no known vulnerabilities |

Expected rejected IPC/consent calls log errors during smoke; those are assertions of denial, not unexpected failures. The model was tested with synthetic `code.exe` context and pet scalars, never document/window contents. Test model copies are not bundled or tracked.

## Still requiring target-platform/manual verification

- macOS build/runtime, menu bar, Spaces/full-screen behavior, foreground-name adapter, CPU library loading and login approval.
- Installation on a clean machine, actual OS sign-in/reboot behavior, signing, notarization and distribution trust.
- Physical multi-monitor edge cases, display removal and long-running resource measurements across target hardware.
- Physical mouse/tray interaction on each platform in addition to the automated gesture/bridge and native window checks.
- Pixel-perfect transparent click-through is not implemented; the pet window's small rectangular bounds can intercept clicks.

The configured Windows/macOS CI matrix has not been run remotely in this session. No release was published. Impeccable's requested CLI update could not locate the app-bundled skill installation; this session used the installed design skill and completed its local detector/review.
