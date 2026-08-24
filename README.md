# MyVocab

A small personal app for words from your own language lessons.
You add what your teacher gave you today; the app decides what you repeat tomorrow.

*My words from my lessons → learning → checking → regular review.*

Currently set up for **Armenian → Russian** (word · pronunciation in Russian letters · translation).

## Running it

No build step, no dependencies, no server code. Any static file server works:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (A server is needed rather than opening
`index.html` directly, because the app uses ES modules and a service worker.)

### Publishing to GitHub Pages

Push this folder to a GitHub repository, then in **Settings → Pages** choose
`Deploy from a branch` → `main` / `/ (root)`. The app is then available at
`https://<user>.github.io/<repo>/` — open it once online and it keeps working offline.
On a phone use "Add to Home Screen" to get it as an app icon.

## Adding words after a lesson

The normal workflow: after a lesson, send the word list to Claude in the same
format shown below. Claude appends it as a new block in [js/seed.js](js/seed.js)
and pushes — GitHub Pages redeploys, and the words show up next time the app
loads on any device, filed under that lesson's name automatically.

Words already merged from `seed.js` are remembered per device (`seedMerged` in
the backup), so deleting one later doesn't bring it back on the next reload.

`+ Add words` in the app itself still works too, for anything you want to add
by hand right away without waiting on a deploy. Paste a whole list, one entry
per line:

```text
առաջադրել | предлагать / выдвигать | араджадрел
առնվազն | как минимум | арнвазн
բարեւ | привет | барев
```

`word or phrase | translation | pronunciation` — the pronunciation is optional, and
tabs or semicolons work as separators too (handy when pasting from a table).
The preview lets you fix any field or drop a line before adding.

A lesson name (`Lesson 12`, `Greetings`, …) is optional. It only records where the
words came from — daily practice always mixes lessons together.

## How the learning works

One direction: **Armenian → Russian** — see the word, say the translation.
(Russian → Armenian used to run alongside it; it's switched off for now —
`DIRECTIONS` in [js/srs.js](js/srs.js) turns it back on.)

Answers move a card along a ladder of intervals (`0 · 1 · 2 · 4 · 9 · 21 · 45 · 90` days):

| Answer | Effect |
| --- | --- |
| **Knew** | one step up — comes back later |
| **Didn't know** | back to the start — returns in the next sessions |

A word becomes **Learned** once it's far along the ladder, and drops back to
**Learning** by itself as soon as you start missing it. New words are shown
first in a plain read-through deck, then join normal checking.

The one page collects everything due, recent mistakes first, plus a batch of
new words (defaults: 24 cards, 10 new — `settings` in [js/store.js](js/store.js),
not editable in-app on purpose — there's no settings screen to keep it simple).

## One page, no tabs

Everything lives on a single screen: today's practice, your word counts, an
exam (pick "All words" or specific lessons, one card per word, score at the
end), the last two weeks, and backup. A **"See all words →"** link opens the
full searchable list when you need to look something up or fix a typo — it's
a click away, not a permanent tab.

## Your data

Everything is stored in this browser's `localStorage` under `myvocab.v1` — no accounts,
no backend, nothing leaves the device. Clearing site data erases it, so use
**Export backup** now and then; **Import backup** restores a saved file.

The word lists themselves also live in [js/seed.js](js/seed.js), which is part of the
deployed site — so they're backed up in git history independently of any one device.
Your practice progress (schedule, streaks, session history) stays device-local.

## Layout

```
index.html            app shell — just the header now, no nav
css/app.css           all styling, design tokens at the top
js/app.js             start-up, switches between the overview and words screens
js/config.js          the two language names
js/store.js           data model, persistence, history, backup, seed merging
js/wordsformat.js     shared "word | translation | pronunciation" line parser
js/seed.js            word lists from lessons, shipped with the app
js/srs.js             scheduling and building the daily/exam queues
js/study.js           the study session: intro cards, flashcards, results
js/screens/overview.js the one page: today, stats, exam, history, backup
js/screens/words.js    full word list, reached via a link, not a tab
js/screens/addwords.js "+ Add words" sheet
js/screens/worddetail.js one word's detail sheet
sw.js                  offline cache (bump CACHE after changing files)
```

After changing any file listed in `sw.js`, bump the `CACHE` constant there so
browsers fetch the new version instead of the cached one.

Switching to a different language later: change the two names in `js/config.js`.
