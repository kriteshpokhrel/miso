# Privacy, model and resource notes

## Trust boundaries

The renderer loads local packaged files only. It has no Node.js integration, is sandboxed and context-isolated, denies navigation/new windows/permissions, and cannot make HTTP requests. CSP blocks remote scripts, connections, frames and forms. A narrow frozen preload bridge exposes named actions, not filesystem/shell/generic IPC access.

Main accepts requests only from its own live top-level web contents. Shutdown, destroyed senders and destroyed owner windows are rejected before reading native frame/window getters, preventing late drag-end requests from touching released objects. Settings and model operations are restricted to the settings window. Payloads are validated again in main. Application names are normalized and allowlisted exactly, not matched by substring or treated as commands.

Application-name queries remain AI-gated: only when local AI is enabled, a verified model is ready, comments are due and the allowlist is nonempty, no more often than once per 30 seconds. Windows uses a persistent read-only helper for the foreground process ID and `ProcessName`; cold startup and warm responses have separate bounded deadlines, capped responses and owned-child cleanup rather than repeatedly compiling P/Invoke. macOS uses `NSWorkspace.frontmostApplication.localizedName`. Home, sleep, disabling AI, an empty allowlist, model removal and quit dispose the name lookup. Errors expose sanitized context, not raw commands or names. Unallowlisted names are discarded before inference. No titles, documents or keyboard capture API is used.

Separately, **A window seat** reads transient foreground-window bounds at most once per 750ms while away from home and motion is enabled. Windows uses a persistent read-only PowerShell/PInvoke helper (foreground handle, visibility/minimized/maximized state and frame rectangle). macOS uses CoreGraphics onscreen metadata filtered to the frontmost owner, extracting only its bounds; it does not request titles or screenshots. Own-window focus retains the last external target. Bounds never enter the renderer, storage, logs or AI; only a human-readable following status and normalized motion state/speed are sent to the renderer. There are no foreign-window control operations. Disabling following, Still/system reduced motion, home or quit stops tracking; sleep and pinning dispose the helper and pause queries while retaining the last transient target for resumption. OS failures are reported and fall back to the desktop. macOS permission/metadata behavior is unverified; denied access is not bypassed.

Inference projects only an app name, the selected species' personality and bounded pet scalar state into its prompt. No history is retained. Generated output is bounded plain text rendered through `textContent`, never HTML. A process name can itself reveal something about your work: leave the list empty or disable AI if you do not want that name processed locally.

## Network and consent

No model downloads automatically. Download requires explicit settings-window consent; size stays visible and source/license/resource information is available under **Model details**. The only application network operation is that download, initiated in main, from this fixed catalog entry:

- Repository: `bartowski/SmolLM2-135M-Instruct-GGUF`
- File: `SmolLM2-135M-Instruct-Q4_K_M.gguf`
- Pinned revision: `09816acd5d99df7be770d85ea30822623dab342c`
- Bytes: `105454432`
- SHA-256: `2e8040ceae7815abe0dcb3540b9995eaa1fa0d2ca9e797d0a635ae4433c68c2d`
- License: Apache-2.0, upstream [SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/main/LICENSE)
- Quantization source: [pinned repository](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/tree/09816acd5d99df7be770d85ea30822623dab342c)

The downloader permits HTTPS and fixed trusted delivery hosts, validates every redirect and response length, bounds disk use, verifies SHA-256, and promotes a temporary file only after verification. Cancellation/failure cleans its own partial file. Startup verifies an installed model before use. Symlinks/junctions/hardlinks are not accepted as model storage. A same-user malicious program with write access to application data is outside this prototype's isolation boundary.

Hugging Face/file delivery hosts receive your IP address and ordinary HTTP download metadata. No pet or application context is sent with the download. npm development dependency installation may contact package/binary registries; that is separate from application runtime behavior.

## Inference and licensing

`node-llama-cpp` embeds llama.cpp and ships native platform binaries. Runtime uses `build: 'never'`, `skipDownload: true` and CPU mode: no opportunistic compiler, source or binary download. Check upstream `node-llama-cpp`, llama.cpp, Electron and packaged dependencies' notices before distribution. The procedural 3D renderer bundles MIT-licensed Three.js with its notice in `dist/renderer/THIRD_PARTY_NOTICES.txt`; the original character uses no third-party art. The project's MIT license does not relicense dependencies or the Apache-2.0 model.

Two CPU threads, 512-token context, 64-token batch and 48-token output cap favor a small resource budget, not high-quality reasoning. At least 512 MiB free RAM is required before loading; Electron and native contexts consume additional memory. Downloads require at least the model's size in available disk space. Failed writes are surfaced. There is no GPU dependency.

The **pet's 3D graphics**, unlike inference, require a WebGL 2-capable graphics context. Rendering requests low power, caps draws at 30fps and pixel ratio at 2, and stops animation while hidden or Still/system reduced motion is enabled. Settings creates a preview only on the Pets page and suspends it on General. No floor/shadow backdrop is rendered. Native movement is bounded to 30Hz with fractional positions; motion notifications are capped at approximately 15Hz. Preview failure does not block saving colors. GPU/driver compatibility and sustained resource use require target-machine measurement; these caps are not a battery-life guarantee.

Inference times out cooperatively after 12 seconds; native operations and cleanup are not a hard real-time deadline. Home/disable/quit abort in-flight work and release resources. Core behavior continues during loading and errors. The model unloads after each request rather than retaining RAM/history. Small-model output is not reliable factual advice, and repeated/invalid text is rejected in favor of scripted behavior.

## Local data and removal

Normal state lives under Electron's `userData` directory (`%APPDATA%\nooki` on Windows by default, `~/Library/Application Support/nooki` on macOS; product name/runtime may affect casing). It contains needs, home state, preferences, a local active-companion timer for break reminders, disturbance state, and allowlisted application names. It does not contain app-usage logs, model conversation history or telemetry identifiers.

Appearance preferences contain only a single/dual pattern and two six-digit RGB hex colors, validated in main. Pets-page drafts remain in renderer memory until saved. The old reduced-motion boolean migrates to Still or Gentle; new values are Still/Gentle/Lively and a following toggle. No character assets or palettes are fetched, and appearance/movement choices are not sent to inference.

Dragging moves only Nooki's own window. Main reads cursor position for movement/following and nearby head/eye attention. The gaze bridge sends bounded normalized direction, not global coordinates, at most 10Hz while tracking; it neutralizes immediately while home, hidden, asleep, dragging or motion is disabled. Gaze is never saved, logged, networked or included in AI prompts. Drag scoring holds current velocity/reversal timing only during the gesture; only a fading disturbance scalar is persisted, not cursor history. Imitation uses a timer, not activity capture. Break reminders use companion-active time, not keyboard monitoring. The separate angry/affectionate joke beats have no application-control API.

Use **Remove model** in settings to disable AI and remove its fixed local model/partial paths. Uninstallers may preserve per-user settings; remove the Nooki application-data directory manually only after quitting if you want to erase preferences. Do not delete shared system or parent directories.
