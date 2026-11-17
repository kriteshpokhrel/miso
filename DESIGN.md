# Nooki renderer design

## Direction and surfaces

An original, soft-edged lilac cat keeps company on a transparent desktop stage. Apricot fur, blush cheeks and hand-shaped slate contours give the character a world of its own. Settings use a compact, familiar utility sheet rather than dashboard cards. The approved direction favors companionship over metrics and keeps optional AI secondary.

- **Pet:** a 300 × 300 transparent scene with only the character and occasional speech. Paws sit approximately 8px above the viewport floor, with the ground shadow ending 1px above it: no invisible toolbar-sized gap. There is no persistent desktop toolbar. Native main-process `setSize` and `setZoomFactor` implement the saved pet size; the renderer never scales the cat from that setting.
- **Preferences:** `?view=settings` selects the scrollable utility sheet. A brief gesture guide introduces tapping, dragging and the native care menu. Everyday behavior comes first, process-name privacy second, optional model disclosure and consent last.
- No external fonts, images, network requests or navigable remote links. Model license/source URLs are plain text.

## Implemented tokens

| Role | Value |
| --- | --- |
| Settings paper | `#f3f6f1` |
| Primary slate-green ink | `#293d37` |
| Secondary ink | `#52665d` |
| Separator | `#cbd6cc` |
| Sage action | `#365b48` |
| Lilac fur | `#d3c7e8` |
| Apricot patch | `#e8ab77` |
| Keyboard focus | `#6a4290`, 3px outline |
| Error surface / ink | `#fff0ec` / `#842e2d` |

System UI typography is 13px, with 12px supporting copy, 16px section headings and a 32px Nooki wordmark. Controls use 5–7px corners. Spacing follows compact 4–8px relationships, 12–16px control groups and 24–28px section separation. Hairline separators, not shadowed cards, organize settings.

## Character and interaction

The inline SVG is original artwork. Idle/walking, hungry, playing, purring, sleeping, mimicking, irritated and going-home states vary eyes, mouth, accessories and paw movement. Playing reveals a ball; purring reveals hearts; sleeping closes the eyes and adds sleep marks; home gives a small happy-house reaction. Mimicking reveals a tiny sage laptop with alternating typing paws and a slight nod. Irritation is theatrical: angled eyebrows, a frown, a tail flick and one stomping paw, never punishment. Walking alternates individual paws and lightly bobs the head. Only an actual main-supplied comment animates the talking mouth. Native main-process code owns all desktop movement, behavior timing and hiding; the laptop is an illustration, never application control.

A stationary primary-pointer tap invokes `care('pet')`. Right-click opens the native Feed/Pet/Play/Home/Settings menu. Enter, Space, Shift+F10, the Menu key and assistive synthetic activation open the same native menu. Settings restore is also a native bridge action. Busy petting actions are not repeated until settled; unavailable bridge and rejected actions produce visible, accessible errors. Speech appears only for main-supplied comments, with a short going-home exception; null comments leave the cat quiet without inventing mood chatter. The interface never supplies a fake bridge or simulated production state.

Dragging captures the pointer. A four-screen-pixel movement threshold separates dragging from tapping. The renderer calls `startDrag()`, then `dragPet()` at no more than 30Hz without queuing a backlog, then `endDrag()`. No cursor coordinates cross the bridge: main reads the OS cursor. Pointer cancellation, lost capture and window blur finish native dragging without petting. Starting and in-flight movement promises settle before ending a drag.

Preferences are explicit-save. Each changed field has a revision; live snapshots update clean fields without replacing in-progress edits or rebuilding the DOM. Edits made during a save remain unsaved. Invalid process names are associated with the textarea, which receives focus on failed submission. Client validation matches main's 30-name/80-character process-name limits.

Playful labels retain plain-language descriptions: **Morning pounce** is launch at sign-in; **Talkativeness** is comment frequency; **Easy paws** is reduced motion; **Pocket or pounce?** offers 70%, 100%, 130% and 150% pet sizes; **Stretch those paws** enables a loving reminder after 45 minutes of active companion time, paused at home. The new size and reminder values participate in the same revision-safe full-settings save.

The model section discloses actual snapshot metadata, including approximate download size and exact bytes, requires separate download consent, and exposes progress, cancellation, retry and removal. Cancellation remains available while a long-running download bridge call is pending. Model controls do not submit or discard preference drafts. Core scripted behavior needs no model.

## Accessibility and motion

Native labels, selects, textareas and checkboxes retain keyboard behavior. All settings buttons have visible names; focus uses a contrasting outline. The cat itself is a keyboard-focusable, named menu button with hidden gesture instructions and mood in its accessible name. Speech, save outcomes and model progress expose status; failures expose alerts. Untrusted strings use `textContent`, never HTML.

The saved reduced-motion preference and operating-system `prefers-reduced-motion` both stop all renderer animation and transitions, including typing, irritation and talking. There is no renderer-driven wandering or entrance animation. Motion-free states retain their distinct expressions and props.

## Verification boundary

Renderer build/type validation is separate from integrated Electron and operating-system verification. Focused renderer tests cover preference draft preservation, process-path rejection, model cancellation during a pending download, quiet speech, exact model-size disclosure, native menu shortcuts, tapping, throttled coordinate-free dragging and cancellation cleanup. Native tray restore, sign-in launch, window movement, packaged behavior and live screenshots must be checked by the integrator. Sign-in limitations are explicitly disclosed for unpackaged builds. Native main code also owns the post-drag fall to the desktop floor; the renderer does not emulate gravity.
