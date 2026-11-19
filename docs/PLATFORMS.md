# Platform verification and release boundaries

## Windows

Electron provides a transparent always-on-top, non-taskbar pet window. Frame-rate-independent movement accelerates/brakes at up to 30Hz and retains fractional positions. Explicit native bounds avoid fractional-DPI size drift. Hungry cursor following stays on the current surface/display; dragging can move displays. A read-only persistent PowerShell/PInvoke helper supplies the active window's physical frame bounds and maximized/visibility state, converted to Electron DIPs. A sufficiently wide window with 236 scaled CSS pixels of free work area above it offers a compact top-edge perch; otherwise the desktop floor is used. OS errors are visible and do not break care. No title/content access or foreign-window control is involved. Pixel-perfect transparent click-through is not implemented.

Manual release first falls vertically onto the current display's work-area floor, then waits 800ms before following an active window. Cross-display following walks through adjacent displays whose work-area bottoms align within eight DIPs. Gaps and vertically offset floors use a local fallback with a carry-there explanation. Sleeping freezes native position before target-display selection; pinning pauses autonomous position changes while retaining manual carrying and expressions. Deterministic route/drop checks do not replace physical multi-monitor/DPI verification.

The tray provides restore, home, settings and quit. Closing the pet window sends it home. Closing preferences leaves the tray running. Startup registration is applied only by a normal packaged launch and respects the saved toggle. Windows can independently disable startup entries, and sign-in after reboot still needs a manual check.

Care and speech are separate transparent, always-on-top windows at zoom 1, clamped to the pet's display work area. They do not change the scaled pet frame. Speech is non-focusable and ignores mouse input; care dismisses on blur and Escape can restore pet focus. Verify focus, stacking and workspace behavior on each target OS, including while changing display scaling.

Unsigned installers can trigger SmartScreen. Obtain a code-signing certificate for public distribution. Installing the prototype and accepting startup registration should be an explicit user action; automated smoke never registers startup.

## macOS

Implemented: tray/menu-bar template icon, transparent overlay, work-area bounds, login API and AI-gated foreground-name adapter using AppKit/NSWorkspace. Geometry-only window following uses an independent JXA/CoreGraphics adapter selecting the frontmost owner's onscreen layer-zero bounds. No Accessibility, Screen Recording, title or document access is requested; metadata availability and actual permissions on current macOS versions are unverified. If unavailable/denied, report it and use the desktop, never bypass approval. Spaces/full-screen interaction, login approval, metadata coordinates and native inference must be verified on a Mac.

`electron-builder` is configured for DMG and ZIP output, app category and hardened runtime. A production release requires an Apple Developer identity, signing every embedded native library, appropriate narrowly scoped entitlements, notarization and stapling. This repository does not supply signing credentials or claim notarization is complete. Validate the inference runtime and its dylibs against the hardened-runtime policy before distributing. Modern macOS can require the user to approve background/login items.

## Build and verification matrix

Use `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, then `npm run pack` on each target host. On Windows, `npm run dist -- --win nsis`; on macOS, `npm run dist -- --mac dmg zip`. Native binaries are platform/architecture specific; do not copy Windows `node_modules` to macOS or between architectures.

The CI workflow checks Windows and macOS dependencies, tests, types and unpacked package builds. A configured workflow is not evidence that a remote run passed. Only `vX.Y.Z-prototype.N` tags may start release packaging; stable tags are outside this workflow. The guard checks the exact prototype format and agreement with both package manifests. The GitHub prerelease is created only after both platform jobs pass dependency installation, tests, typechecking and native installer generation, and is explicitly excluded from Latest. It attaches the Windows NSIS installer and macOS DMG/ZIP with SHA-256 checksums. It does not sign or notarize them, run target-device/manual checks, or configure auto-updates. Linux is not a supported release target.

## Prototype prerelease

The current package version is `0.1.0-prototype.1`; its matching tag is `v0.1.0-prototype.1`. The release workflow creates a GitHub prerelease, not a production release. Review [the release notes](RELEASE_NOTES.md) for user-facing limitations. The tag starts the required platform jobs; do not describe the release as available until the workflow succeeds on both platforms. macOS runtime permissions, signing/notarization, clean-machine installation, Windows installed-app behavior, and physical display/hardware scenarios still require separate verification.

## Manual release checklist

- Launch from the installed application, inspect each companion/controls and open preferences.
- Verify idle wandering, hungry cursor-follow, expressions, feed/pet/play and sleep recovery. Sleep must lie down without props and remain on the same display while focus changes elsewhere; tap wakes it.
- Verify Home walks right, brings in a house, enters it, then slides the house right before hiding; needs/comments pause immediately and inference unloads. Restore through the tray/menu bar; Still/system reduced motion skips animation.
- Change settings, quit/relaunch, and check persistence. Toggle sign-in launch both ways, inspect OS startup settings, then verify after actual sign-out/reboot.
- In Pets, use the native color picker, switch single/dual tone, preview without applying, save/relaunch and verify remembered colors. Check sidebar navigation, narrow stacked layout and reachable Save. In General, model details must start collapsed while size and explicit consent remain available.
- Exercise all three roaming levels, continuous gait/turn/stop with gentle synchronized body movement, a real normal window with room above it, moving/resizing/maximizing/minimizing that window, and fallback/restoration across displays/DPI. Release on another display and confirm local vertical landing precedes following; check connected, disconnected and vertically offset display floors. Shake rapidly and confirm irritation before release, five seconds of anger and separate reassurance.
- Check all eight care actions, arrows/Escape/outside dismissal, restored Scritches/Pats, Stay/Roam persistence and Follow. At 50% and 100%, controls and speech must remain readable without moving/resizing the pet. Speech must not intercept clicks or steal focus.
- Switch Cat/Dog/Panda/Octopus with mouse and radio-group keyboard controls, preview before Save, save/relaunch, and check each model's care/sleep/imitation/Home. Inspect Pets and General at regular and 500x540 window sizes; no field/divider overlap or unreachable Save.
- Check multiple displays, negative monitor coordinates, display removal, scaling, taskbar/Dock placement and reduced motion.
- With no model and offline, verify core behavior. With consent, exercise real download, mid-transfer cancel/retry, removal and inference. Ensure an unallowlisted foreground app never reaches inference.
- Check appearance/focus/keyboard access, comment frequency/off, error visibility, and CPU/RAM while idle/home/inference.
- Before distributing, review third-party licenses and sign/notarize on real target hardware.
