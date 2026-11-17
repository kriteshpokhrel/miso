# Miso repository guide

This root contract applies throughout the repository. Read the relevant source
and documentation before changing behavior. A nearer `AGENTS.md`, if introduced,
must state its scope and keep this document's shared safety boundaries.

## Start here

| Work | Read |
| --- | --- |
| Setup, commands and user-visible behavior | [README.md](README.md) |
| Product scope and non-goals | [PRODUCT.md](PRODUCT.md) |
| Existing visual and motion language | [DESIGN.md](DESIGN.md) |
| Process ownership, IPC, rendering and extension points | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Data, permissions, model download and inference | [docs/PRIVACY.md](docs/PRIVACY.md) |
| Platform integration and release checklist | [docs/PLATFORMS.md](docs/PLATFORMS.md) |
| Actual validation evidence and known gaps | [docs/VERIFICATION.md](docs/VERIFICATION.md) |
| Implementation history and acceptance criteria | [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) |

## Stack and ownership

- Electron, strict TypeScript and npm; supported development hosts are Windows
  and macOS with Node.js 22. Dependency versions and scripts live in
  `package.json` and `package-lock.json`.
- `src/domain`: pure simulation, reactions, attention and motion calculations.
  Keep Electron, DOM, filesystem and OS access out.
- `src/shared`: typed contracts, species definitions and pure presentation
  geometry. Keep this layer usable in both main and renderer.
- `src/main`: native window/tray lifecycle, validated IPC, persistence and bounded
  read-only platform adapters. `src/main/ai` owns optional download/inference.
- `src/renderer`: local-only DOM interaction, settings drafts and procedural
  Three.js artwork. Main owns saved state; renderer owns temporary form drafts.
- `scripts`: build asset copying. `.github/workflows/ci.yml` defines the target
  build matrix, not evidence that a remote run passed.

## Mandatory behavior

- Search existing implementations and reuse the contracts/helpers. Keep changes
  focused, strictly typed and dependency-light. Update directly related docs.
  Explain architectural alternatives and trade-offs in `docs/ARCHITECTURE.md`
  when changing ownership, permissions, storage or runtime dependencies.
- Keep core pet behavior offline and independent of AI. Gentle needs never cause
  death or sickness. Home pauses needs/comments and releases optional inference.
- Preserve the approved original cat's appearance. New species implement
  `PetModel` and use the exhaustive factory; do not silently substitute the cat
  or list an unimplemented animal as supported.
- Keep pet scale separate from care/speech scale. Tiny is 50%; care targets and
  dialogue must stay readable. Opening care must not move/resize the pet and
  must suspend both travel and scene drawing.
- Keep species/appearance/behavior edits draft-only until explicit Save.
  Preserve dirty revisions across incoming snapshots and in-flight saves.
- Honor system reduced motion. Dispose owned geometry/materials/helpers and
  timers; never leave background processes or hidden drawing loops running
  after their owner is closed.
- Validate IPC owner, live top-level frame and payload in main. Only Settings
  may write general preferences or manage models. Care gets named narrow
  toggles/actions, speech gets snapshot reads, and dragging stays overlay-only.
  Never replace the frozen preload bridge with generic IPC, shell or file APIs.
- Keep renderers sandboxed, context-isolated, Node-free and local-only. Deny
  external navigation, renderer networking and permissions. Render generated
  text as text, not markup.
- Do not collect window titles, document contents, screenshots, keystrokes or
  app history. Foreign-window bounds are transient and main-only. AI receives
  only an exact allowlisted process name, personality and bounded pet state.
  There is no foreign-application control API, including for irritation jokes.
- Never download models without explicit consent. Preserve fixed catalog,
  redirect allowlist, size/hash verification, cancellation, safe local storage
  and explicit error reporting. Do not fetch runtime inference binaries.
- Preserve unrelated work. Do not commit credentials, model weights, captures,
  `.smoke-data`, `dist`, `release` or `node_modules`. Do not bypass denied OS or
  tool approvals. Restrict cleanup to specifically owned paths.

## Validation and delivery

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run smoke
npm run dist -- --win nsis
```

Install dependencies only when needed. Run focused existing tests first, then the
integrated suite/build for cross-layer changes. Add regressions for changed
behavior, including invalid input, cancellation and reduced motion as relevant.
There is no separate lint script; do not claim one ran.

Native smoke opens real windows and a tray icon, uses ignored `.smoke-data`,
does not register startup or download weights, and checks real rendered output.
For a Windows package, run the actual `release\win-unpacked\Miso.exe
--smoke-test` too. Build/test macOS on a Mac; do not infer platform success from
Windows or configured CI. Record fresh results, historical evidence and
unverified limitations distinctly in `docs/VERIFICATION.md`.

Use conventional commits such as `feat:`, `fix:`, `docs:` and `test:`. Include the
required assistant coauthor trailer when applicable. Push or create a pull
request only when requested. A generated installer is unsigned unless signing
has actually been configured and verified.

## Do not assume

- The product/repository name is **Miso**. Do not add old-name aliases or automatic
  data imports; earlier application-data directories remain untouched.
- A smaller pet does not justify smaller text, overlapping controls or a larger
  persistent invisible input rectangle.
- A passing renderer unit test does not prove native positioning, popup focus,
  transparent pixels, physical multi-display behavior or packaged inference.
- Missing/denied OS metadata must produce an honest desktop fallback, not
  broader permissions or fabricated success.
- Signing, notarization, clean-machine startup, real monitor/DPI transitions and
  sustained resource use require separate target-machine evidence.
