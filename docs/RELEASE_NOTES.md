# Miso 0.1.0 Prototype Prerelease

This is an unsigned prototype prerelease for evaluation, not a trusted production release.

## Downloads

- Windows: unsigned NSIS installer.
- macOS: unsigned DMG and ZIP. A successful macOS build does not establish that runtime permissions, embedded inference libraries, login behavior or Spaces integration work on a Mac.
- `SHA256SUMS.txt` contains SHA-256 checksums for the attached installers.

## Important limitations

- No code signing or notarization is configured. The operating system may warn or block installation; do not bypass security prompts unless you understand the risk and intentionally choose to evaluate this prototype.
- No auto-updater is included.
- The release workflow runs tests, typechecking and installer builds on Windows and macOS runners. It does not verify installed-app behavior on clean target devices or physical multi-display/DPI behavior.
- macOS runtime permissions and integration, login approval, Windows installed-app behavior, reduced-motion behavior on target hardware, and sustained resource use still need manual verification.
- During release preparation, the native macOS smoke test did not complete in six attempts. Two initially timed out waiting for coat-preview colors; other attempts stopped at stationary-tap, octopus-preview or panda-preview assertions. A diagnostic run found the canvas ready with its original colors and no render error while the smoke expected a palette change; a later run explicitly showed and focused the settings window, rendered the dog, then timed out waiting for the panda. The cause was not isolated, and macOS runtime behavior is not verified by this prerelease.
- The app requires WebGL 2-capable graphics. Core companionship works offline; optional AI remains opt-in and requires a separate explicit model download.
