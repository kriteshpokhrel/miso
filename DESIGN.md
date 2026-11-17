# Miso renderer design

## Direction and surfaces

An original, sculpted cat keeps company on a transparent desktop stage. Rounded volumes, glossy violet eyes, blush cheeks and a contrasting ear, muzzle and chest create an expressive toy-like character. Default fur is lilac and cream; the user can choose her own single- or dual-tone coat. Real-time Three.js geometry replaces the previous flat SVG at the user's request; no GitHub mascot geometry, artwork or textures are reused. Settings retain their compact, familiar utility sheet rather than dashboard cards.

- **Pet (Experience):** a 300 × 300 transparent scene with only the character. The WebGL canvas occupies the lower 280 × 236 area. There is no persistent desktop toolbar or opaque scene backdrop. Explicit native main-process `setBounds` and `setZoomFactor` implement the saved pet size; the renderer never scales the model from that setting.
- **Care and speech:** temporary transparent `?view=care` and `?view=speech` native windows retain zoom 1, independent of pet scale. Care uses a 430 × 270 upper arc with 44px targets and 12px labels; speech uses a 280 × 104 area with 12.5px text and a local anchored tail. Main clamps placement without resizing/moving the pet. Speech ignores clicks and never takes focus. Neither auxiliary view creates a 3D scene.
- **Preferences (Operate):** `?view=settings` selects a quiet utility sheet with a persistent Pets/General sidebar. Pets combines distinct companion radio choices, the actual selected model's draft preview, coat customization and size/behavior. General contains startup, process-name privacy and optional model setup. A brief gesture guide introduces tapping/dragging and surrounding care icons. A sticky Save bar stays reachable on compact windows; no dashboard cards.
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

System UI typography is 13px, with 12px supporting copy, 16px section headings and a 28px Miso wordmark. Controls use 5–7px corners. Spacing follows compact 4–8px relationships, 12–16px control groups and 24–28px section separation. Spacing and headings organize settings; avoid redundant row/fieldset/section rules and never run dividers through fields.

## Character and interaction

`cat-model.ts` builds original procedural geometry and a composable pose rig without a WebGL dependency in tests. Rounded triangular extruded ears replace the cone/base lumps; no side head patch protrudes from an ear. Feeding reveals a bowl and eases the head into a chewing pose. Play bats a bouncing ball; petting closes the eyes with head nuzzles and sculpted hearts. Sleep closes the eyes and adds sleep marks; imitation reveals a laptop with typing paws. Irritation folds the ears, narrows the eyes and flicks the tail **during** shaking. A timed angry warning softens into a separately spoken affectionate reassurance.

Additional companions extend that same sculpted world without replacing the cat. Dog/panda compose `quadruped-model.ts`: floppy versus round ears, dog muzzle/wagging tail versus dark panda eye patches/paws, continuous joint-driven legs and subtle speed-coupled weight shifts. `octopus-model.ts` has a rounded mantle, eight tapered continuous arms, suction cups and phase-offset crawling; it does not inherit cat limbs. `companion-kit.ts` shares glossy eyes, bounded gaze, facial states, care props and house choreography. `SoftLimb` keeps geometry buffers stable while control points move. Sleep lowers the character and tucks its limbs without held props. Single/dual colors remain shared preferences; fixed eye whites and identifying dark panda markings retain contrast. Companion changes preview the actual rig before explicit Save, then persist its identity and initial needs. No new asset or network dependency is introduced.

Walking rotates sideways and uses four continuous tapered leg surfaces driven by two-bone joints, planted stance and lifted swing arcs. Thigh roots and ankles terminate inside the original torso and paws; no separate oval bones remain visible. Original body, face, eyes, tail, coat and care poses are preserved. Body and chest share two gentle weight shifts per stride, with a smaller head shift and quieter breathing during walking. Travel speed advances the gait using the actual canvas/world scale. The parent rig is never stretched. Surface jumps have anticipation, forward-reaching paws, flight and a soft landing; larger drops show wide eyes and spread/flailing paws. Home temporarily widens the transparent stage to 500 CSS pixels, shows an arched house, admits the pet behind its front wall and slides the house right before hiding. Native code owns travel. No other application can be closed or controlled.

Nearby cursor attention composes with the mood, rather than replacing it: smoothed head yaw/pitch and separate pupil offsets make the cat look toward the user. Main computes bounded normalized direction within 1.5 window widths of the pet, at most 10Hz. It stops while hidden, home, asleep, dragging or reduced-motion enabled. Raw global cursor coordinates never enter the renderer, storage or inference.

A stationary tap pets, or wakes a sleeping pet. Right-click shows eight labeled icons on an upper semicircle: Feed, Scritches/Pats, Play, Sleep/Wake, Stay/Roam, Follow, Home and Settings. The restored shortcuts use narrow validated actions rather than general preference writes. Main pauses native travel before the options appear; the scene then suspends drawing without shrinking or repositioning the pet. Closing resumes both and preserves an interrupted hop's clock. Enter, Space, Shift+F10, Menu key and assistive activation open the same menu; arrows navigate, Escape restores keyboard focus, and Tab/outside input/blur/drag dismiss. Blur does not steal focus back from another application. A small keyboard-only underline replaces the intrusive full-canvas focus rectangle; pointer interaction clears keyboard focus.

Autonomous relaxation uses a low, tucked pose, relaxed eyes and gentle alternating kneading; yawns close the eyes and ease the mouth open and shut. Chosen sleep eases into a grounded lying pose without held props, persists until wake, gently recovers energy, breathes and pulses floating sleep marks. It is silent, and comments/reminders stop during sleep. Sleep freezes the native position before surface/display selection, so foreground changes cannot relocate it. Carrying and releasing first lands locally; following resumes after an 800ms pause, using connected floor-aligned displays rather than diagonal travel. Care, travel and home take priority over idle poses. Body-language references informed the original poses, not copied geometry: [Cats Protection body language](https://www.cats.org.uk/help-and-advice/cat-behaviour/cat-body-language) and [kneading](https://www.cats.org.uk/cats-blog/why-do-cats-knead). Yawn timing is an authored cartoon gesture.

Speech is a plain warm-paper bubble with a small tail, limited to 72 characters and at most three seconds. Its independent native scale preserves readable wrapping even for an unbroken maximum-length line at Tiny. The angry expression lasts five seconds before a separate 2.2-second affectionate reassurance; the warning bubble clears within three seconds independently of the expression. Main clears expiry on the movement clock, cancels the sequence on a new action and rejects superseded in-flight AI responses. Compact window perching reclaims the normal transparent header and places speech below when space permits. No scrolling or message history is introduced.

Dragging captures the pointer. A four-screen-pixel movement threshold separates dragging from tapping. The renderer calls `startDrag()`, then `dragPet()` at no more than 30Hz without queuing a backlog, then `endDrag()`. No drag coordinates cross the bridge: main reads the OS cursor. The separate attention event carries only normalized gaze direction. Pointer cancellation, lost capture and window blur finish native dragging without petting. Starting and in-flight movement promises settle before ending a drag.

Preferences are explicit-save. Each changed field has a revision; live snapshots update clean fields without replacing in-progress edits or rebuilding the DOM. Edits made during a save remain unsaved. Invalid process names are associated with the textarea, which receives focus on failed submission. Client validation matches main's 30-name/80-character process-name limits.

Playful labels retain plain descriptions: **Morning pounce** is launch at sign-in; **Talkativeness** is comment frequency; **Paw pace** is Still/Gentle/Lively; **A window seat** follows the active top edge; **Stay, please** pins position without suppressing animation or manual carrying; **Pocket or pounce?** offers 50–100% in 10% steps plus 130% and 150%; **Stretch those paws** enables a reminder after 45 minutes together, paused at home. Preferences use revision-safe saves. Care's named Stay/Roam toggle persists pinning without settings privileges; Roam switches Still to Gentle when necessary, while system reduced motion still wins.

Sidebar labels are species-neutral text with restrained sage selection, not animal icons or dark blocks. General offers opt-in, platform-specific app checkboxes plus a collapsed custom process-name field; it neither scans installed apps nor broadens a saved alias when another setting changes.

**Pets** preserves the quiet sage world. Registry-generated Cat/Dog/Panda/Octopus choices form a radio group above the neutral live preview, distinct from ordinary setting rows; arrows/Home/End select and focus. Pattern/native color controls sit beside the preview and stack on narrow windows. Named Lilac cream, Cocoa cream, Peach milk and Storm cloud swatches have pressed-state semantics. Single tone uses one fur color; dual tone recolors species-appropriate accents. Eyes, nose, cheeks, identifying panda markings and props retain their colors. Single tone disables contrast without erasing it; Revert touches only appearance. Pending saves cannot replace newer edits/reversions.

The preview creates the same model on the first Pets visit, with neutral motion/attention; General suspends its loop. Drafts update material uniforms without rebuilding geometry. A typed local DOM event carries the draft, not privileged IPC; actual desktop changes require validated Save and atomic persistence. Missing appearance fields migrate; invalid patterns/hex colors fail. Everything remains local.

The model section keeps actual approximate size/exact bytes and separate consent visible. A native information disclosure holds model name, license, source and resource costs without crowding setup. Its icon sits beside the label; viewport-anchored placement flips above when needed, clamps horizontally and scrolls within a bounded height. Progress/cancel/retry/removal remain available; cancellation works while download IPC is pending. Model actions do not discard drafts. Scripted behavior needs no model.

## Accessibility and motion

Native labels, selects, textareas and checkboxes retain keyboard behavior. All settings buttons have visible names; focus uses a contrasting outline. The cat itself is a keyboard-focusable, named menu button with hidden gesture instructions and mood in its accessible name. Speech, save outcomes and model progress expose status; failures expose alerts. Untrusted strings use `textContent`, never HTML.

Still and operating-system reduced motion stop native travel, renderer animation and transitions, including typing, irritation, talking and the home sequence. Gentle strolls at 42 DIP/s on a longer schedule; Lively at 86 DIP/s more frequently, scaled with pet size. System override is disclosed in Pets. Motion-free states retain distinct expressions/props.

`pet-scene.ts` owns a transparent orthographic WebGL 2 scene and local lighting, without a floor or hard shadow strip. Low-power preference, a 30fps draw cap and DPR cap of 2 bound costs; hidden windows stop the loop and Still renders only state/viewport changes. Geometry/materials/renderer/listeners are disposed. Unsupported graphics and lost contexts report visible alerts instead of a pretend fallback; colors remain saveable without preview graphics. Three.js's MIT notice ships with the renderer.

## Verification boundary

Renderer tests cover drafts/concurrent save/revert, invalid app paths, pending-download cancellation, quiet speech, model size, sidebar/motion drafts, radial care/keyboard dismissal, no pointer-induced focus, and coordinate-free dragging. Main owns surface selection, eased native travel, jumps and OS reduced-motion enforcement. A separate narrow motion event carries state/direction/speed/progress, never window coordinates. Native/packaged smoke checks actual pixels and desktop integration; macOS/physical multi-monitor and startup approval remain manual boundaries.

The 3D upgrade adds direct rig tests for gaze/neutral settling, mood expressions, reduced motion and resource disposal. Native smoke requires actual WebGL pixels with transparent surroundings, exercises the typed gaze event in both directions and its neutral reset, and captures real expressions. GPU/driver compatibility and sustained resource use still require representative target hardware.
