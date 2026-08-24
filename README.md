# MyVocab

A small personal app for words from your own language lessons.
You add what your teacher gave you today; you decide when and how much to
learn — MyVocab just tracks where each word is.

*New → Learning → Learned. No schedule, no daily limit, no waiting for tomorrow.*

Works for any language pair — pick what you're learning and what you're
translating into when you add the first one; switch between languages any
time with the selector under the header. Each language keeps its own words
and progress, completely separate from the others.

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
word or phrase | translation | pronunciation
another word | its translation | pronunciation
```

`word or phrase | translation | pronunciation` — the pronunciation is optional, and
tabs or semicolons work as separators too (handy when pasting from a table).
The preview lets you fix any field or drop a line before adding.

A lesson name (`Lesson 12`, `Greetings`, …) is optional. It only records where the
words came from — daily practice always mixes lessons together.

## Languages

Every word belongs to a language pair ("deck") — the language you're
learning plus the one you're translating into, both free text, whatever
you type when you create it. The selector under the header switches the
active one; `+ Add words`, the New/Learning/Learned counts, the practice
rotation, and the exam all only ever touch the words in that deck. Adding
a second language doesn't affect the first one's progress at all.

## How the learning works

One direction: see the word, say the translation. (The reverse direction
used to run alongside it; it's switched off for now — `DIRECTIONS` in
[js/srs.js](js/srs.js) turns it back on.)

Every word is in one of three states:

- **New** — added, not started yet.
- **Learning** — in the rotation. Sitting in one continuous shuffled queue:
  answer **Knew** and the card goes further back in the queue; answer
  **Didn't know** and it comes back sooner. No fixed session length, no
  daily cap — do 5 words or 100, stop whenever, come back whenever.
- **Learned** — recalled successfully on **3 separate calendar days**,
  spanning **at least 3 days** since you started learning it (so a burst of
  quick answers late one night can't fake three "different days"). A wrong
  answer along the way knocks the count down by one, not back to zero.

**Learn new words** takes a batch from New (pick 5 / 10 / 20) through a
plain read-through — no testing — then straight into the rotation above.

**Exam** is the only thing that can *un-learn* a word: a one-shot,
multiple-choice test over everything currently Learned (the word, four
translation options, one right). A miss immediately sends that word back to
Learning — proof it wasn't as solid as it looked.

## One page, no tabs

Everything lives on a single screen: a segmented New / Learning / Learned
bar, a Practice row and a Learn row (whichever has words waiting leads),
exam, and backup. A **"See all words →"** link opens the full searchable
list when you need to look something up or fix a typo — it's a click away,
not a permanent tab.

## Your data

Everything is stored in this browser's `localStorage` under `myvocab.v1` — no accounts,
no backend, nothing leaves the device. Clearing site data erases it, so use
**Export backup** now and then; **Import backup** restores a saved file.

The word lists themselves also live in [js/seed.js](js/seed.js), which is part of the
deployed site — so they're backed up in git history independently of any one device.
Your Learning/Learned progress stays device-local.

## Layout

```
index.html                app shell — header + deck selector, no nav
css/app.css                all styling, design tokens at the top
js/app.js                  start-up, switches between the overview and words screens
js/deckbar.js              the language selector and "new language" sheet
js/store.js                data model, persistence, backup, seed merging
js/wordsformat.js          shared "word | translation | pronunciation" line parser
js/seed.js                 word lists from lessons, shipped with the app
js/srs.js                  New/Learning/Learned rules, exam question building
js/study.js                three study modes: intro, the carousel, the exam
js/screens/overview.js     the one page: counts, actions, exam, backup
js/screens/words.js        full word list, reached via a link, not a tab
js/screens/addwords.js     "+ Add words" sheet
js/screens/worddetail.js   one word's detail sheet
sw.js                       offline cache (bump CACHE after changing files)
```

After changing any file listed in `sw.js`, bump the `CACHE` constant there so
browsers fetch the new version instead of the cached one.
