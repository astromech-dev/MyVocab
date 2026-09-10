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
`study.js` owns the study sessions (`startIntro`, `startCarousel`,
`startExam`) and the two interstitial pickers (`pickLesson`,
`pickExamDir`), and renders all of them into the shared `#sheet` panel.

A word is **Learned after it's been recalled correctly on `LEARNED_DAYS`
(4) separate calendar days** ([js/srs.js:24](js/srs.js:24)). Only the
*first* correct answer of each day counts toward that total — spacing is
what builds memory — so `applyAnswer()` guards the increment with
`dir.lastGoodDay` and bumps `dir.goodDays` once per day. **`goodDays` never
resets**: a skipped day just leaves it where it was, which is the whole
point (a 150-word backlog drains one day at a time instead of stalling
because you can't get 2 hits on the same word in one session). Within a day
a word is drilled `REINFORCE_PER_DAY` (2) times — 3 if it's hard, see below;
first correct answer is progress, the rest reinforce — then `dir.dayDoneOn` is set and
`learningPool()` hides it until the next calendar day. `dir.repsToday` /
`dir.repsTodayDay` track today's count (reset lazily on day turnover — this
is the *throwaway* counter, not progress). A miss hands back one of today's
correct answers and, if today had already been counted, un-counts it (both
floored at zero) — bounded. `applyAnswer()` returns `'learned'` /
`'day-complete'` / `'continue'` so `study.js`'s carousel knows whether to
drop the card or keep circulating it; on `'continue'` after a correct
answer the carousel re-queues with a short gap (`KNEW_GAP_*` in
[js/study.js](js/study.js)) so the reinforcement rep lands the same session.
`refreshStatus()` never demotes — the *forward* Exam is the only path back to
Learning (via `learnAgain()`, which zeroes `goodDays` and sets the status
itself; also powers the manual "Learn again" in
[js/screens/worddetail.js](js/screens/worddetail.js)). Words carried over
from the older 2-stage model migrate in `normalizeWord()`: the old `level`
(0-2) maps straight onto `goodDays`.

**Hard words are drilled harder, not quarantined.** Each direction carries a
rolling `misses` balance: `+1` on a miss, `-1` on *any* correct answer,
clamped to `0..MISS_CAP` (5). At `HARD_AT` (3) `isHard(word)` goes true and
the word (a) leads its group in the session queue, (b) owes `3`
reinforcement reps that day instead of `REINFORCE_PER_DAY`, and (c) halves
its review gap. It is **not** a status — `word.status` stays
`new | learning | learned` and `refreshStatus()` doesn't know about it — so
the label comes off by itself as soon as the balance decays. The balance
answers "is this word failing me *now*", not "did I ever miss it".
`markLearned()` clears the balance, `learnAgain()` deliberately keeps it.

Those three are listed in order of measured effect, and **(c) is close to
inert — don't count on it.** On a 60-word pool (15 hard, everything missed
so nothing completes) hard words averaged 7.0 shows against 6.56, with an
identical median return gap of 60: the halved gap (6 vs 12) is far smaller
than the pool's cycle length, so the queue is effectively round-robin and
the difference never surfaces. On a small pool the `HARD_GAP_MIN` floor of 2
squashes it instead. It is kept because it costs one line and does no harm,
not because it carries the feature. (a) is strong — average first-appearance
position 2 vs 17 — and (b) is a flat +50% exposure. The real reason a hard
word recurs, though, is that you *miss* it, and a miss already comes back on
a much shorter gap than a correct answer.

**Today's reinforcement quota is latched in `dir.targetToday`**, not
re-derived per answer, and it only ever ratchets up. Deriving it fresh made
(b) unreachable: the miss balance decays *before* the quota check, so a word
sitting exactly on `HARD_AT` lost the label on its own first correct answer
and then owed the ordinary two — measured, every hard word finished in 2
reps. Ratcheting also lets a word missed into hardness mid-day pick up the
extra rep immediately instead of waiting for tomorrow. `targetToday` resets
with `repsTodayDay` on day turnover, and in `markLearned`/`learnAgain`.
Words that predate the field get one seeded from their lifetime
`checks`/`mistakes` in `normalizeWord()` — once, keyed off the field being
absent, and never for Learned words. The badge shows in the word list and on
the word's own screen but **never on a study card**: knowing a card is
flagged before you answer colours the self-assessment.

`startCarousel()` in [js/study.js](js/study.js) orders each session's queue
in four groups, shuffled within each: hard-and-not-practiced-today,
not-practiced-today, hard-and-seen-today, seen-today. So reopening Practice
later the same day surfaces different words instead of reshuffling the whole
pool from scratch, and the words that keep slipping are the ones you meet
while still fresh.

The review gaps in `study.js` are clamped at **both** ends. `unknown` used to
run at a *bigger* ratio than `knew` with no ceiling, so past a ~30-word pool
a card you missed came back later than one you knew (100 words: +35 turns vs
+25) — the scheduler was quietly deprioritising exactly the words that
needed work. "A miss comes back soonest" now holds at every pool size
because unknown's ratio is lower (0.15 vs 0.25) *and* its ceiling is lower
(12 vs 35); the margin is tightest around a 40-word pool, where knew sits on
its floor of 10 and unknown is at 6. Don't reintroduce an unbounded gap.

Every gap is then **jittered by ±`GAP_JITTER` (0.35)**. Jitter exists
because a *fixed* gap preserves clusters forever — two cards answered on
consecutive turns get the same gap and return on consecutive turns for the
rest of the session, which is why a freshly introduced batch used to march
through Practice as one undiluted block. The spread is wide enough that the
two distributions' tails cross, and that is deliberate: holding "a miss
comes back soonest" for every individual *draw* caps jitter at ±0.2, and
measuring that showed it barely mixes anything (60-word pool: cards moved
1.2 positions on average between rounds, 18 of 60 not at all; at 0.35 it's
7.6 and 5). The property worth keeping is that misses come back sooner *on
average* — one card's drawn gap versus another card's is meaningless to the
learner — and it holds by a wide margin: measured on a 20-word pool, a
missed card returns after a median of 10 turns against 24 for a known one.

Note that on a large pool the *nominal* gap is not what you wait: with 60
cards in rotation the queue backlog dominates, and both kinds come back
after ~50 turns. The gaps bind at the pool sizes Practice actually runs at.

**`pickDue()` picks the next card, and the session stores the result** in
`session.current` rather than recomputing it per render. That is load-
bearing: the tie-break is random (whole-turn gaps mean real ties, and always
taking the first entry would reintroduce a fixed order), so two calls can
disagree — and `renderCarousel` rendering one card while `answerCarousel`
grades another would file answers against the wrong word. `pickDue` also
refuses to return the card just shown unless it's the only one left: a gap
only promises a card isn't due for N turns, not that anything else *is* due
sooner, so a short queue could otherwise show the same card twice running.

**Thin Practice sessions pad themselves.** `practiceSession()` in `srs.js`
returns `{ pool, filler }`: `pool` is `learningPool()` (what the overview
counts), `filler` tops the rotation up to `PRACTICE_ROTATION` (20) with
words that already hit their day quota. Without it, learning a fresh batch
*after* the day's practice leaves those new words as the only thing in the
pool — everything else retired at `dayDoneOn` — so there is genuinely
nothing to interleave with. Filler earns nothing: `applyAnswer` finds
`repsToday` already at quota so one correct answer re-closes the day and the
card leaves rotation, and `lastGoodDay` is already today so `goodDays`
cannot move. A *miss* on filler is real work again (it costs today's credit
like any miss), and `answerCarousel` clears the entry's `filler` flag so the
session summary counts it. `startCarousel` **weaves** filler through the
group order rather than appending it — trailing filler would leave the real
words in the same block it was added to break up.

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

**Exam runs in portions of `EXAM_BATCH` (20), never the whole pile.** A
218-word exam is not a harder exam, it's an exam that never gets taken.
`examBatch()` takes the Learned words this direction has checked least
recently — `lastExamAt` unset (never checked) sorts first — then shuffles the
portion for presentation, the same sort-then-shuffle split as
`pickNewWords`. It is deliberately **not** weighted toward words with a bad
history: a portion's job is to sweep everything eventually, and sampling by
difficulty or at random leaves a long tail that never gets checked.

`applyExamAnswer` stamps `dir.lastExamAt` on *every* answer, pass or miss —
that stamp is the whole rotation mechanism, and re-serving what you just
failed would stall the sweep. A forward miss needs no special case because
demotion removes the word from the Learned pool until it re-graduates; a
reverse miss stays Learned by design, and the results screen's "back to
practice" button is the remedy. `dir.examPasses` counts passes and is the
"how solid is this really" number — unlike `goodDays`, which stops at 4 and
never moves again, it keeps growing. Both are per direction, and both are
surfaced on the word's own screen for the trained direction only.

`examStats(dir)` feeds the direction picker ("158 of 218 never checked this
way") and the results screen's remaining-coverage line, so the work reads as
finite rather than as a wall.

**Exam is flashcards, one pass, either direction.** `pickExamDir()` runs
before it (and before `pickLesson()`) and hands back `'fr'` or `'rf'`; there
are no multiple-choice options any more — recognising the right answer among
four is not recall. `applyExamAnswer()` in `srs.js` grades it: a miss in the
forward direction demotes, a miss in the reverse direction **does not**.
That asymmetry is deliberate — `'rf'` is never trained (see `DIRECTIONS`), so
grading it would wipe out most of a deck through no fault of the learner;
`renderExamDone()` offers "Move N words back to Learning" as a choice
instead. Reverse misses also stay out of `dirs.fr.misses`, so one hard exam
can't flag half the deck as hard. `applyExamAnswer()` deliberately leaves
`lastPracticed` alone so a word you just failed leads the next Practice
session rather than trailing it.

**Two-direction support is dormant in *Practice*, not removed:**
`DIRECTIONS` in [js/srs.js](js/srs.js) only trains target→native (`'fr'`) —
that's what defines Learned and what the carousel drills. The reverse
direction (`'rf'`) is tracked in the data model (`word.dirs.rf`) and is
already reachable through the exam's direction picker; adding it to
`DIRECTIONS` would make Practice train both, which doubles the work per word
— a product decision, not a migration.

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
[js/wordsformat.js](js/wordsformat.js). `parseWordLines(text, mode)`:

- **`mode: 'columns'`** (default) — one entry per line, fields in the order
  `term / translation / pronunciation`. Separators accepted between fields:
  `|`, a tab, `;`, a run of **2+ spaces**, or a **spaced dash** (`-` `–` `—`).
  Pronunciation optional. A single space is *not* a separator (terms are
  often multi-word).
- **`mode: 'rows2'` / `'rows3'`** — each entry spans 2 or 3 consecutive
  non-blank lines (term, then translation, then pronunciation); a blank line
  ends the current entry early. For lists pasted with every field on its own
  line.

The `+ Add words` paste step ([js/screens/addwords.js](js/screens/addwords.js))
exposes `mode` as a dropdown and shows a live "N words detected" readout under
the textarea so a mis-parsed paste is obvious before the preview step. `seed.js`
and `packs.js` always call it with the default `columns` mode.
