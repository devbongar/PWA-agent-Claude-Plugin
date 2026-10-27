---
name: app-ui-craft
description: Short, rule-numbered UI craft standard for building and reviewing screens inside a real app (PWA on phone, tablet and desktop), with a pre-delivery checklist. Preloaded by frontend-developer and ui-reviewer.
---
# App UI craft

The working standard for screens and components **inside an existing app**. Each rule has an ID so you can cite it ("L2", "S1"). The project's design system and the approved plan always win over these rules; these fill the gaps.

## How to use this (required)

- **Before writing or reviewing a component:** name the 2 to 5 rules below that matter most for it, in one line each (for example, "S1: the disabled Save button needs its reason next to it").
- **Before reporting back:** answer the **pre-delivery checklist** at the bottom, item by item (pass, fail or n/a, with a short note for each fail).
- **Activation check:** in your report, say which rule changed a decision you made ("L3 made me widen the dialog to fit the table"). If none did, say "no rule changed a decision". Don't claim rules you didn't use.

## Fit (redesign mode)

- **F1. Classify first.** Is this an **Extension** (new part of an existing UI), **Redesign · Preserve**, or **Redesign · Overhaul**? Default to Extension.
- **F2. Extension = indistinguishable.** New elements reuse the existing components, tokens, spacing, radius, type scale and wording. Someone who knows the app shouldn't be able to spot the new part.
- **F3. Copy before inventing.** Find the closest existing screen or component and match it. Name it in your notes.
- **F4. No rogue values.** Colours, spacing and font sizes come from the project's tokens or existing classes. A new hex value or magic number needs a reason.

## Layout and restraint

- **L1. Every element earns its place.** No filler, no decorative extras, no sections nobody asked for.
- **L2. Size to the content.** A card, panel or button shouldn't be mostly empty space (a card two-thirds empty is a layout bug). Let content set the width, or fill the space with a better arrangement.
- **L3. Containers fit their content.** A dialog, popover or dropdown must be at least as wide as its widest content (table, form row, long label) at every size. No horizontal scroll or clipped text inside it.
- **L4. Readable measure.** Body text lines about 45 to 75 characters; constrain wide text blocks on desktop.
- **L5. Use desktop space.** On desktop, use columns, side panels or tables, not a stretched phone layout. On phones, one column.
- **L6. Modals adapt.** A modal on a phone becomes full-width or a bottom sheet; on desktop it has a sensible max width. Size it from its content (L3), not fixed viewport breakpoints alone.
- **L7. Group by meaning.** Related controls sit together, near what they affect. If a control needs a label to explain what it changes, move it closer to that thing.

## States and feedback

- **S1. Disabled needs a reason, right there.** A disabled control shows why, directly next to it or as its helper text. Never leave the explanation orphaned elsewhere on the screen. Better still: keep it enabled and explain on press, when that's clearer.
- **S2. Every interactive element has its states:** hover (mouse), focus-visible (keyboard), pressed, disabled, loading. Async actions show progress and prevent double submits.
- **S3. Every screen has loading, empty, error and offline states.** Empty states say what goes here and how to add it.
- **S4. Four kinds of feedback:** status, completion, warning, error. Validate inline as people type or leave a field, not only on submit. Errors say what happened and how to fix it.
- **S5. Destructive actions:** undo where possible; confirm only when irreversible.

## Touch, input and access

- **T1. Tap targets at least 44x44 px** (pad small icons; spacing counts). 36x24 is a fail.
- **T2. Inputs at least 16px** font, with the right `type`, `inputmode` and `autocomplete`.
- **T3. Keyboard:** everything reachable with Tab, visible focus, Escape closes dialogs, focus returns to the trigger.
- **T4. Contrast:** text at least 4.5:1 (3:1 for large text and icons). Don't rely on colour alone.
- **T5. Labels:** icon-only buttons have accessible names; specific labels beat generic ones ("Add report", not "Submit").

## Type and visual

- **V1. Hierarchy from size, weight and spacing together;** the most important thing is the most obvious.
- **V2. Tight leading and slight negative tracking on large headings;** comfortable leading (about 1.5) on body text. Spacing in `rem`, so larger text doesn't break layout.
- **V3. No AI clichés** unless the brand uses them: purple-pink gradients, emoji as icons, cards with a coloured left border, decorative SVG people, fake stats or testimonials.
- **V4. Placeholders over fakes:** missing icon, image or data gets an honest placeholder, never invented content.
- **V5. Nothing leaks:** no code comments, debug text, `undefined`, or raw keys visible on screen.

## Motion (only when the work has it)

- **M1. Respond instantly;** press feedback within about 100 ms.
- **M2. Motion explains change** (where something came from, where it went) and is interruptible.
- **M3. Respect `prefers-reduced-motion`.**
- For gestures, drag, sheets, springs or depth, load `ph1-pwa-kit:apple-design` and follow it.

## Pre-delivery checklist

Answer each item in your report: **pass / fail / n/a**, with a note for every fail.

1. **Fit:** mode classified (F1); new parts match the closest existing screen (F2, F3); no rogue colours or sizes (F4).
2. **Layout:** no mostly-empty containers (L2); dialogs and popovers fit their content at phone, tablet and desktop (L3, L6); desktop uses the space (L5).
3. **States:** hover, focus, pressed, disabled, loading on every control (S2); loading, empty, error, offline on every screen (S3).
4. **Disabled controls** each show their reason next to them (S1).
5. **Tap targets** at least 44x44 px (T1); inputs at least 16px (T2).
6. **Keyboard and contrast** (T3, T4); accessible labels (T5).
7. **Text:** no overflow, clipping or orphaned words in key places; readable measure (L4).
8. **Nothing leaks** onto the screen (V5); no clichés or fake content (V3, V4).
9. **iPhone edge-to-edge:** background under the status bar, content below the safe area (see the agent's status bar rules).
10. **Motion** (if any) is fast, interruptible and honours reduced motion (M1 to M3).

Sources: distilled from the bundled web-design-engineer and apple-design skills (MIT), for use inside a production app.
