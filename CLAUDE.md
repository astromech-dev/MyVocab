# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MyVocab is a static, offline-first PWA for personal vocabulary drilling (New →
Learning → Learned, no fixed schedule). No build step, no framework, no
package manager — vanilla ES modules loaded directly by the browser, one
`<script type="module">` in [index.html](index.html).

## Running it

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. A real server is required (not `file://`)
because the app uses ES modules and registers a service worker.

There is no build, lint, or test command — there is no `package.json`. Verify
changes by loading the page and exercising the feature in the browser.

### Deploying

Pushing to `main` on GitHub with Pages enabled (`Deploy from a branch` →
`main` / `/`) is the deploy. No CI, no separate build artifact — the source
files are what ships.

**After changing any file listed in `SHELL` in [sw.js](sw.js:5), bump the
`CACHE` constant** ([sw.js:3](sw.js:3)) or returning visitors keep the stale
cached version (the service worker serves cache as the offline fallback and
its own list of cached files is not auto-derived).

## Architecture

**Render model:** every module exports a `render*(root, ...)` function that
sets `root.innerHTML` to a full HTML string and rewires listeners via
delegation (`on()` in [js/dom.js](js/dom.js:11)). There is no virtual DOM and
no component tree — re-rendering means regenerating the whole string and
replacing the container (see the `#screen` swap in
[js/app.js](js/app.js:16)), which is why listeners are always bound to the
*fresh* element (`inner()` pattern used throughout `js/study.js`,
`js/screens/*.js`) rather than accumulated on a persistent one.

**State:** [js/store.js](js/store.js) holds one module-level object (`store`)
that is the entire app state, persisted as a single JSON blob in
`localStorage` under `myvocab.v1` (debounced 250ms, flushed immediately on
`pagehide`/`hidden`). Screens don't hold their own copies of domain data —
they read `store` accessors and call `subscribe()` or re-run `render()`
after any mutating call (`addWords`, `updateWord`, `touched()`, etc., which
all `save()` + `notify()`).

**Data model:** `store.decks` are independent vocabularies (just `{id, name,
createdAt}` — the `deck` naming is internal only, user-facing label is always
"vocabulary", never "dictionary" or "language pair"); `store.words` all carry
a `deckId` and every deck-scoped query (`counts`, `lessons`, `pickNewWords`,
`learningPool`, exam building) filters by it. Adding a second deck never
touches another deck's words or progress. [js/screens/overview.js](js/screens/overview.js:62)
gates everything else behind having at least one deck — with none, it
renders [js/screens/onboarding.js](js/screens/onboarding.js), a two-step
first-run flow (welcome + restore-from-backup, then name-the-first-vocabulary)
that hands off to `addDeck()`/`importBackup()`.

**SRS logic lives in [js/srs.js](js/srs.js), UI flow in
[js/study.js](js/study.js)** — keep that split. `srs.js` has no DOM code: it
mutates a `word` object and recomputes `status` via `refreshStatus()`.
`study.js` owns the four study sessions (`startIntro`, `startCarousel`,
`startExam`, `pickLesson`) and renders into the shared `#sheet` panel.

A word is **Learned after it's been recalled correctly on `LEARNED_DAYS`
(4) separate calendar days** ([js/srs.js:24](js/srs.js:24)). Only the
*first* correct answer of each day counts toward that total — spacing is
what builds memory — so `applyAnswer()` guards the increment with
`dir.lastGoodDay` and bumps `dir.goodDays` once per day. **`goodDays` never
resets**: a skipped day just leaves it where it was, which is the whole
point (a 150-word backlog drains one day at a time instead of stalling
because you can't get 2 hits on the same word in one session). Within a day
a word is drilled `REINFORCE_PER_DAY` (2) times — first correct answer is
progress, the rest reinforce — then `dir.dayDoneOn` is set and
`learningPool()` hides it until the next calendar day. `dir.repsToday` /
`dir.repsTodayDay` track today's count (reset lazily on day turnover — this
is the *throwaway* counter, not progress). A miss hands back one of today's
correct answers and, if today had already been counted, un-counts it (both
floored at zero) — bounded. `applyAnswer()` returns `'learned'` /
`'day-complete'` / `'continue'` so `study.js`'s carousel knows whether to
drop the card or keep circulating it; on `'continue'` after a correct
answer the carousel re-queues with a short gap (`KNEW_GAP_*` in
[js/study.js](js/study.js)) so the reinforcement rep lands the same session.
`refreshStatus()` never demotes — Exam is the only path back to Learning
(via `learnAgain()`, which zeroes `goodDays` and sets the status itself;
also powers the manual "Learn again" in
[js/screens/worddetail.js](js/screens/worddetail.js)). Words carried over
from the older 2-stage model migrate in `normalizeWord()`: the old `level`
(0-2) maps straight onto `goodDays`.

`startCarousel()` in [js/study.js](js/study.js) orders each session's queue
with words not yet practiced today first (shuffled among themselves), words
already practiced today after — so reopening Practice later the same day
surfaces different words instead of reshuffling the whole pool from scratch
every time.

**Lesson picker:** when the eligible words for Learn / Practice / Exam span
more than one named lesson, `pickLesson()` interrupts with a "Which lessons?"
step before the real session starts (`newWordLessons()` /
`learningPoolLessons()` / `learnedLessons()` in `srs.js` decide whether to
show it — 0 or 1 lesson name means skip straight to the session). It's a checkbox list —
every lesson starts ticked, plus an "All lessons" select-all row at the top,
and one primary **Start** button (disabled while nothing is ticked). The
choice comes back to the caller as `onChoose(lessons)`: `null` when every
lesson is still ticked, otherwise an array of the ticked lesson names. That
value is passed straight to the `lessons` argument of `pickNewWords()` /
`learningPool()` / `learnedWords()` (all accept `null`, a single name, or an
array, via `lessonFilter()` in `srs.js`). See the call sites in
[js/screens/overview.js](js/screens/overview.js:146).

**Two-direction support is dormant, not removed:** `DIRECTIONS` in
[js/srs.js:32](js/srs.js:32) currently only trains target→native (`'fr'`).
The reverse direction (`'rf'`) is tracked in the data model
(`word.dirs.rf`) but excluded from `DIRECTIONS`, so re-enabling it is a
one-line change, not a data migration.

**Screens** (`js/screens/*.js`) are the only consumers of `store.js` +
`srs.js` + `study.js` for a given piece of UI; `js/app.js` just switches
between `overview` and `words`, `js/deckbar.js` renders the deck switcher
(outside `#screen`, hence its own refresh call — see the comment in
[js/app.js:14](js/app.js:14)).

## The seed.js word-import workflow — read before touching js/seed.js

[js/seed.js](js/seed.js) ships to anyone who loads the app, so as of commit
`cc45638` it is **deliberately kept empty** — personal vocabulary must not be
committed there anymore. Do not append lesson word lists to `js/seed.js`
even if asked to "add these words to the app"; use the in-app **+ Add words**
flow instead (or point the user to it), which stores words in `localStorage`
only. `js/store.js`'s `mergeSeed()` and `seedMerged` bookkeeping still exist
to support any lessons already merged from history, but the file itself
should stay `LESSONS = []` going forward.

## Word paste format

Shared by `+ Add words` and `seed.js` lessons, parsed by
[js/wordsformat.js](js/wordsformat.js): `term | translation | pronunciation`
per line, pronunciation optional, `|`/tab/`;` all accepted as separators.
