# Platform verification and release boundaries

## Windows

Electron provides a transparent always-on-top, non-taskbar pet window; it uses display work areas rather than covering the taskbar. Movement is clamped, and display work areas are re-evaluated. Hungry following is horizontal at the desktop floor rather than an unrestricted pointer overlay. The transparent window's rectangular bounds can still intercept clicks around the artwork; pixel-perfect click-through is not implemented.

The tray provides restore, home, settings and quit. Closing the pet window sends it home. Closing preferences leaves the tray running. Startup registration is applied only by a normal packaged launch and respects the saved toggle. Windows can independently disable startup entries, and sign-in after reboot still needs a manual check.

Unsigned installers can trigger SmartScreen. Obtain a code-signing certificate for public distribution. Installing the prototype and accepting startup registration should be an explicit user action; automated smoke never registers startup.

## macOS

Implemented: tray/menu-bar template icon, transparent overlay, work-area bounds, login-item API and foreground application-name adapter using AppKit/NSWorkspace. No window titles or Apple Events document access is requested. Actual platform behavior, Spaces/full-screen interaction, login approval and native inference must be verified on a Mac.

`electron-builder` is configured for DMG and ZIP output, app category and hardened runtime. A production release requires an Apple Developer identity, signing every embedded native library, appropriate narrowly scoped entitlements, notarization and stapling. This repository does not supply signing credentials or claim notarization is complete. Validate the inference runtime and its dylibs against the hardened-runtime policy before distributing. Modern macOS can require the user to approve background/login items.

## Build and verification matrix

Use `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, then `npm run pack` on each target host. On Windows, `npm run dist -- --win nsis`; on macOS, `npm run dist -- --mac dmg zip`. Native binaries are platform/architecture specific; do not copy Windows `node_modules` to macOS or between architectures.

The committed CI workflow checks Windows and macOS dependencies, tests, types and package build. A configured workflow is not evidence that a remote run passed. Installer publication, signing, notarization and auto-updates are deliberately not automated.

## Manual release checklist

- Launch from the installed application, inspect cat/controls and open preferences.
- Verify idle wandering, hungry cursor-follow, expressions, feed/pet/play and sleep recovery.
- Verify home travels to an edge, disappears, pauses needs/comments and releases inference; restore through the native tray/menu bar.
- Change settings, quit/relaunch, and check persistence. Toggle sign-in launch both ways, inspect OS startup settings, then verify after actual sign-out/reboot.
- Check multiple displays, negative monitor coordinates, display removal, scaling, taskbar/Dock placement and reduced motion.
- With no model and offline, verify core behavior. With consent, exercise real download, mid-transfer cancel/retry, removal and inference. Ensure an unallowlisted foreground app never reaches inference.
- Check appearance/focus/keyboard access, comment frequency/off, error visibility, and CPU/RAM while idle/home/inference.
- Before distributing, review third-party licenses and sign/notarize on real target hardware.
