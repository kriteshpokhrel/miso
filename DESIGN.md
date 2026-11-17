# Nooki renderer design

## Direction and surfaces

An original, sculpted cat keeps company on a transparent desktop stage. Rounded volumes, glossy violet eyes, blush cheeks and a contrasting ear, muzzle and chest create an expressive toy-like character. Default fur is lilac and cream; the user can choose her own single- or dual-tone coat. Real-time Three.js geometry replaces the previous flat SVG at the user's request; no GitHub mascot geometry, artwork or textures are reused. Settings retain their compact, familiar utility sheet rather than dashboard cards.

- **Pet (Experience):** a 300 × 300 transparent scene with only the character and occasional speech. The WebGL canvas occupies the lower 280 × 236 area, leaving room above for speech. There is no persistent desktop toolbar or opaque scene backdrop. Explicit native main-process `setBounds` and `setZoomFactor` implement the saved pet size; the renderer never scales the cat from that setting.
- **Preferences (Operate):** `?view=settings` selects the scrollable utility sheet, with Everyday company and Coat closet page buttons. A brief gesture guide introduces tapping, dragging and the native care menu. Everyday behavior comes first, process-name privacy second, optional model disclosure and consent last. A sticky Save preferences bar keeps the action reachable on compact windows.
- No external fonts, images, network requests or navigable remote links. Model license/source URLs are plain text.

## Implemented tokens

| Role | Value |
| --- | --- |
| Settings paper | `#f3f6f1` |
| Primary slate-green ink | `#293d37` |
| Secondary ink | `#52665d` |
| Separator | `#cbd6cc` |
| Sage action | `#365b48` |
| Sculpted lilac material | `#bda6df` |
| Peach preset fur | `#d99576` |
| Cream material | `#fff0d9` |
| Glossy iris | `#5244a1` |
| Keyboard focus | `#6a4290`, 3px outline |
| Error surface / ink | `#fff0ec` / `#842e2d` |

System UI typography is 13px, with 12px supporting copy, 16px section headings and a 32px Nooki wordmark. Controls use 5–7px corners. Spacing follows compact 4–8px relationships, 12–16px control groups and 24–28px section separation. Hairline separators, not shadowed cards, organize settings.

## Character and interaction

`cat-model.ts` builds original procedural geometry and a composable pose rig without a WebGL dependency in its tests. Idle/walking, hungry, playing, purring, sleeping, mimicking, irritated and going-home states vary eyes, brows, ears, mouth, props and paws. Playing reveals a ball; purring/home reveal sculpted hearts; sleeping closes the eyes and adds sleep marks. Mimicking reveals a tiny sage laptop with alternating typing paws and a slight nod. Irritation is theatrical: angled eyebrows, narrowed eyes, folded ears, a frown, a tail flick and one stomping paw, never punishment. Walking alternates individual paws and lightly bobs the head. Only an actual main-supplied comment animates the talking mouth. Native main-process code owns desktop movement, behavior timing and hiding; the laptop never controls applications.

Nearby cursor attention composes with the mood, rather than replacing it: smoothed head yaw/pitch and separate pupil offsets make the cat look toward the user. Main computes bounded normalized direction within 1.5 window widths of the pet, at most 10Hz. It stops while hidden, home, asleep, dragging or reduced-motion enabled. Raw global cursor coordinates never enter the renderer, storage or inference.

A stationary primary-pointer tap invokes `care('pet')`. Right-click opens the native Feed/Pet/Play/Home/Settings menu. Enter, Space, Shift+F10, the Menu key and assistive synthetic activation open the same native menu. Settings restore is also a native bridge action. Busy petting actions are not repeated until settled; unavailable bridge and rejected actions produce visible, accessible errors. Speech appears only for main-supplied comments, with a short going-home exception; null comments leave the cat quiet without inventing mood chatter. The interface never supplies a fake bridge or simulated production state.

Dragging captures the pointer. A four-screen-pixel movement threshold separates dragging from tapping. The renderer calls `startDrag()`, then `dragPet()` at no more than 30Hz without queuing a backlog, then `endDrag()`. No drag coordinates cross the bridge: main reads the OS cursor. The separate attention event carries only normalized gaze direction. Pointer cancellation, lost capture and window blur finish native dragging without petting. Starting and in-flight movement promises settle before ending a drag.

Preferences are explicit-save. Each changed field has a revision; live snapshots update clean fields without replacing in-progress edits or rebuilding the DOM. Edits made during a save remain unsaved. Invalid process names are associated with the textarea, which receives focus on failed submission. Client validation matches main's 30-name/80-character process-name limits.

Playful labels retain plain-language descriptions: **Morning pounce** is launch at sign-in; **Talkativeness** is comment frequency; **Easy paws** is reduced motion; **Pocket or pounce?** offers 70%, 100%, 130% and 150% pet sizes; **Stretch those paws** enables a loving reminder after 45 minutes of active companion time, paused at home. The new size and reminder values participate in the same revision-safe full-settings save.

**Coat closet** preserves the quiet sage settings world. A roomy neutral preview stage sits beside the pattern and native color controls; narrow windows stack them. Lilac cream, Cocoa cream, Peach milk and Storm cloud presets use named, two-part swatches with pressed-state semantics, not color-only labels. The single-tone coat uses one fur material color throughout; dual tone recolors the ear/patch, muzzle, chest, paw tips and tail tip. Eyes, nose, cheeks and props are not recolored. Choosing single tone disables the contrast picker without erasing its value. Revert coat edits touches only appearance; pending saves cannot overwrite newer color edits or reversions.

The preview creates the same 3D model lazily when Coat closet opens, with quiet idle behavior rather than desktop wandering/cursor tracking. Draft changes update material uniforms without rebuilding geometry. A typed local DOM event carries the revision-preserved draft to the renderer; it is not privileged IPC and cannot change the actual pet. Save preferences uses the existing validated settings bridge and atomic store. Old settings gain defaults only for absent appearance fields; invalid pattern or non-six-digit hex colors fail explicitly. All color customization remains local.

The model section discloses actual snapshot metadata, including approximate download size and exact bytes, requires separate download consent, and exposes progress, cancellation, retry and removal. Cancellation remains available while a long-running download bridge call is pending. Model controls do not submit or discard preference drafts. Core scripted behavior needs no model.

## Accessibility and motion

Native labels, selects, textareas and checkboxes retain keyboard behavior. All settings buttons have visible names; focus uses a contrasting outline. The cat itself is a keyboard-focusable, named menu button with hidden gesture instructions and mood in its accessible name. Speech, save outcomes and model progress expose status; failures expose alerts. Untrusted strings use `textContent`, never HTML.

The saved reduced-motion preference and operating-system `prefers-reduced-motion` both stop all renderer animation and transitions, including typing, irritation and talking. There is no renderer-driven wandering or entrance animation. Motion-free states retain their distinct expressions and props.

`pet-scene.ts` owns a transparent orthographic WebGL 2 scene, local lighting and a desktop floor shadow. Low-power GPU preference, a 30fps draw cap, device-pixel-ratio cap of 2 and a 512px shadow map bound rendering costs. Hidden windows stop the loop; reduced motion renders only on state/viewport changes. Geometry, materials, renderer and event observers are disposed on unload. Everyday company does not create a WebGL context; Coat closet creates one on first opening and suspends its loop when leaving the page. The preview omits the desktop shadow. Unsupported graphics, context loss and frame errors produce visible alerts rather than a pretend flat fallback; colors remain editable/saveable if preview graphics fail. Three.js's MIT notice ships with the renderer.

## Verification boundary

Renderer build/type validation is separate from integrated Electron and operating-system verification. Focused renderer tests cover preference draft preservation, process-path rejection, model cancellation during a pending download, quiet speech, exact model-size disclosure, native menu shortcuts, tapping, throttled coordinate-free dragging and cancellation cleanup. Native tray restore, sign-in launch, window movement, packaged behavior and live screenshots must be checked by the integrator. Sign-in limitations are explicitly disclosed for unpackaged builds. Native main code also owns the post-drag fall to the desktop floor; the renderer does not emulate gravity.

The 3D upgrade adds direct rig tests for gaze/neutral settling, mood expressions, reduced motion and resource disposal. Native smoke requires actual WebGL pixels with transparent surroundings, exercises the typed gaze event in both directions and its neutral reset, and captures real expressions. GPU/driver compatibility and sustained resource use still require representative target hardware.
