---
name: jobs-ios-web
description: "Jobs/Ive taste plus iOS muscle memory for web PWAs. Use when redesigning Verbatim or any capture-and-read iPhone app. Triggers on: make it Apple, simplify, native feel, sheet UI, Jobs, Ive, HIG, iOS design. Produces fewer screens, honest materials, and physical sheets — not a Swift rewrite."
---

# Jobs-grade iOS on the web

The attached HIG/SwiftUI skills fail this product. They dump clinic architecture, Watch layouts, and SF Symbol catalogs onto a Home Screen PWA. Jobs would throw them out.

One job: **paste a link, read the words.** If a control does not serve that, it is gone.

Channel Jobs for what exists. Channel Ive for how it feels. Channel iOS for where the thumb already knows to go.

---

## Why the default fails

Without this skill the output is a costume:

- Serif on chrome, SF on the reading surface (materials lying)
- Three sample chips, three marketing cards, two CTAs
- Glass on content, bounce on fade-ins, a dashboard shrunk to 390px
- SwiftUI snippets the engineer cannot ship

Exploration without this skill writes "Paste a link." in a display face and then explains YouTube / Apple / Spotify / RSS / export. That is a brochure. The field should be the brochure.

---

## The one thing

Five words: **the words, from the link.**

Home is capture. The page sheet is reading. Recents and Export are action sheets. Nothing else is a world.

---

## Core principles (with why)

### 1. Remove until it breaks, then add one back

Jobs cut 17 products to 4. Do that to the screen.

Home needs: large title, one field, one primary, the queue. Samples belong in the empty queue as rows — not chips competing with Get transcript.

If you cannot tell a friend which button to press, you have not decided.

### 2. Honest materials

Chrome is SF (the system). The transcript is the book — serif, 19–21px, ~1.5 leading, measure under 38em.

Do not put Instrument Serif on "Paste a link." That is decoration pretending to be content. Do not put Figtree on the words. That is chrome pretending to be a book.

Paper is the reading surface. Ink canvas is capture. Glass is only on bars. Content stays opaque.

### 3. Spatial model is the product

- **Root** — large title, one scroll, grouped inset lists
- **Page sheet (~96dvh)** — the task: fetch, pick episode, read
- **Action sheet** — Recents, Export, Cancel as its own group

Tabs are peer worlds. We do not have peer worlds. Single/Bulk is a segmented control, not a tab bar.

Back/Close must exist. Standalone has no Safari chrome. Trapping the user is a blocker.

### 4. Directness

Press feedback this frame (`:active { opacity: 0.55 }`). Sheets track the finger 1:1, inherit velocity, rubber-band past open, spring with `appleSpring`. Bounce only after a flick. Reduced motion is a 200ms fade, no travel.

Do not spring list rows. Do not lock input until `transitionend`.

### 5. Finish the back of the drawer

Error, timeout, retry, cancel, and reload are first-class. A queue that dies on refresh is unfinished wood.

Auto-retry *blocked* and *network* once. Let a running job be cancelled. Persist the queue. Stale responses must not overwrite a newer job.

### 6. Human copy

Never: "Get the full transcript — YouTube, Apple Podcasts, Spotify, or RSS."
Say: "Paste a link." The field's placeholder names the sources.

Never: "Could not fetch" as a brand voice.
Say the failure in the user's words: "YouTube is blocking captions from here." Then one action: Try Again.

---

## Anti-patterns (never)

| Costume | Why it fails |
|---|---|
| Fake status bar / drawn home indicator | Instantly a website wearing iOS |
| Serif large titles on root | Chrome is not literature |
| Three Try chips + three feature cards | Two stories. Say one. |
| Glass on rows, cards, page | Glass is a layer above content, once |
| Hover-only primary | Thumbs do not hover |
| `maximum-scale=1` | Fix 16px inputs instead |
| CSS keyframes for a draggable sheet | Cannot inherit velocity or reverse |
| Bounce on a menu nobody threw | Physics without a throw is costume |
| SwiftUI `NavigationStack` prescriptions | They asked you to fix a website |
| Feature explainer empty state | Empty queue should offer a sample row |
| Hard stop at sheet 0 | Rubber-band or it feels frozen |

---

## Before / after

**Home**

Before: serif "Paste a link.", paragraph of sources, chips, marketing cards.
After: SF 34pt/700 large title. One grouped composer. Empty queue is three tappable sample rows. Primary 50px.

**Reader**

Before: 17px sans wall, badges as decoration, cheap image outline.
After: Cover (16:9 video / square show art). Title serif. Meta 15px secondary. Body serif 20px/1.5. Search is a quiet field. Times are a text control, not a second primary.

**Failure**

Before: shake + essay hint, no way out except Close.
After: the error, one sentence hint, Try Again (50px), Close still in the bar.

**Reload**

Before: queue evaporates; in-flight work is forgotten.
After: running jobs restore as queued and resume. Done jobs still have their words.

---

## Measurements (iOS → web)

- Large title 34pt, weight 700, tracking -0.022em, SF
- Body chrome 17pt / 1.29
- Reading body 20px / 1.5 serif, max-width 38em
- Primary button 50px, radius 12
- Row 60px, thumb 44×44, radius 8
- Hits 44px; inputs 16px
- Tint `#2C5EA8` on paper, cream on canvas
- Sheet 12px top radii, grabber 36×5, detent ~96dvh
- Safe area: `max(env(safe-area-inset-*), 8px)` so a 0px inset does not kiss the Island

---

## Quality checklist

- [ ] I can say the product in five words
- [ ] One primary per screen
- [ ] Serif is only on the reading surface
- [ ] Sheet is a task; action sheet is a choice; root is capture
- [ ] Press is instant CSS; drag is a spring from the live value
- [ ] Error has Try Again; running can be cancelled; queue survives reload
- [ ] No fake chrome, no glass on content, no marketing cards
- [ ] Thumb at 390px, one-handed, no hover requirement

If any box is open, it is not done. Real artists ship when it is inevitable — not when it is comprehensive.
