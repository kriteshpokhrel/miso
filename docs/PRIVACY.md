# Privacy, model and resource notes

## Trust boundaries

The renderer loads local packaged files only. It has no Node.js integration, is sandboxed and context-isolated, denies navigation/new windows/permissions, and cannot make HTTP requests. CSP blocks remote scripts, connections, frames and forms. A narrow frozen preload bridge exposes named actions, not filesystem/shell/generic IPC access.

Main accepts requests only from its own top-level web contents. Settings and model operations are restricted to the settings window. Payloads are validated again in main. Application names are normalized and allowlisted exactly, not matched by substring or treated as commands.

No background application enumeration occurs. When local AI is enabled, a verified model is ready, comments are due, and the allowlist is nonempty, main queries only the foreground process/application name, no more often than once per 30 seconds. On Windows this uses the foreground process ID and `ProcessName`; on macOS it uses `NSWorkspace.frontmostApplication.localizedName`. Unallowlisted names are discarded before inference. No titles, documents or keyboard capture API is used.

Inference projects only an app name, cat personality and bounded pet scalar state into its prompt. No history is retained. Generated output is bounded plain text rendered through `textContent`, never HTML. A process name can itself reveal something about your work: leave the list empty or disable AI if you do not want that name processed locally.

## Network and consent

No model downloads automatically. Download requires explicit settings-window consent after the size, source, resource cost and license are displayed. The only application network operation is that download, initiated in main, from this fixed catalog entry:

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

`node-llama-cpp` embeds llama.cpp and ships native platform binaries. Runtime uses `build: 'never'`, `skipDownload: true` and CPU mode: no opportunistic compiler, source or binary download. Check upstream `node-llama-cpp`, llama.cpp, Electron and packaged dependencies' notices before distribution. The project's MIT license does not relicense dependencies or the Apache-2.0 model.

Two CPU threads, 512-token context, 64-token batch and 48-token output cap favor a small resource budget, not high-quality reasoning. At least 512 MiB free RAM is required before loading; Electron and native contexts consume additional memory. Downloads require at least the model's size in available disk space. Failed writes are surfaced. There is no GPU dependency.

Inference times out cooperatively after 12 seconds; native operations and cleanup are not a hard real-time deadline. Home/disable/quit abort in-flight work and release resources. Core behavior continues during loading and errors. The model unloads after each request rather than retaining RAM/history. Small-model output is not reliable factual advice, and repeated/invalid text is rejected in favor of scripted behavior.

## Local data and removal

Normal state lives under Electron's `userData` directory (`%APPDATA%\nooki` on Windows by default, `~/Library/Application Support/nooki` on macOS; product name/runtime may affect casing). It contains needs, home state, preferences, a local active-companion timer for break reminders, disturbance state, and allowlisted application names. It does not contain app-usage logs, model conversation history or telemetry identifiers.

Dragging moves only Nooki's own window. Main reads cursor position only for movement/following, never records a pointer history, and retains only a fading disturbance scalar for playful reactions. Imitation uses a timer, not activity capture. Break reminders use companion-active time, not keyboard monitoring. Jokes about other applications have no corresponding control or close API.

Use **Remove model** in settings to disable AI and remove its fixed local model/partial paths. Uninstallers may preserve per-user settings; remove the Nooki application-data directory manually only after quitting if you want to erase preferences. Do not delete shared system or parent directories.
