# AI Interview Prep Kit

Turns a job posting and a company URL into a study plan you can actually work
through: questions grounded in the posting's requirements, flashcards, and a
day-by-day schedule that fits the time you have.

The organising idea is a hard split between what a model is good at and what it
must not be trusted with. **The model writes prose. Code decides facts.** A
question's wording is generated; whether every must-have requirement is covered,
how many days the plan spans, and how the work divides across them are computed
and verified in TypeScript. A model that quietly drops a requirement is caught,
not believed.

---

## Quick start

Requires Docker and an API key for one provider.

```bash
cp .env.example .env      # then paste your key into .env
docker compose up --build
```

Then open <http://localhost:3000>.

If ports 3000 or 4000 are already taken on your machine:

```bash
WEB_PORT=3500 API_PORT=4500 docker compose up --build
```

### Getting a key

**Gemini** has a genuine free tier and is the default —
<https://aistudio.google.com/apikey>. Free keys are Flash-only at 10 requests per
minute and 250 per day; a kit costs roughly four calls, so a free key is good for
about sixty kits a day.

**Anthropic** is supported for a key you already hold. There is no free tier, so
leave it unset unless you mean to spend. `claude-haiku-4-5` costs a cent or two
per kit.

With exactly one key set the provider is inferred. Set `LLM_PROVIDER` to choose
explicitly.

### The batch command

Section 9 of the brief specifies a headless mode, which runs without the web app:

```bash
npm install
npm run evaluate -- --input fixtures/cases.example.json --output out/kits.json
```

Every case is attempted. A case that fails is recorded with a reason and the run
continues, so one bad posting cannot take down a batch.

---

## Architecture

Three processes, composed together:

| Service | What it is | Why |
| --- | --- | --- |
| `web` | Next.js 16, React 19, Tailwind | The kit is a document you edit, so it wants a real client |
| `api` | Express, sessions in Mongo | Owns generation, so a browser tab closing cannot kill a run |
| `mongo` | MongoDB 7 | Kits are nested documents read whole, and its atomic updates are load-bearing |

Mongo is deliberately **not** published to the host. Only the API needs it, and
leaving it closed means nothing else on the machine can reach an unauthenticated
database.

### Inside the API

```
src/
  core/          no framework, no I/O it does not own — this is the part under test
    kit/         Appendix A schema, provenance, merge, reconcile
    coverage/    which requirements have questions, and which do not
    schedule/    day allocation and effort estimation
    evidence/    the candidate-side coverage check (see Evidence Gaps)
    practice/    Leitner spaced repetition
    retrieval/   URL guard, robots.txt, fetch, link scoring, crawl
    llm/         provider-agnostic client: prompts, rate limits, JSON repair
    generation/  the prompts and the adoption of model output into kit items
    pipeline/    orchestration, tracing, error classification
  server/        Express: HTTP, auth, persistence, jobs
  cli/           npm run evaluate
```

`core` knows nothing about Express or Mongo. Everything external reaches it
through a port, which is why the pipeline can be tested end to end against fakes
with no network and no key.

### How the research and generation are sequenced

Both the interface and the batch command run the one path in
`core/pipeline/run-kit.ts`, in this order. The sequencing is genuine: each step
responds to what the last one found, and the two deterministic steps are never
handed to the model.

1. **`extract-role`** — pulls requirements from the pasted JD *alone* (no
   crawled text can leak in), each marked `must`/`nice` with a stable id.
2. **`research-company`** — crawls the company's own site: ranks links, finds
   the about and hiring pages (paths are discovered, never hard-coded), and
   summarises a brief with cited sources.
3. **`search-public-discussion`** — a *separate* best-effort look beyond the
   company's site for public accounts of how it interviews. Time-boxed and
   failure-swallowing: nothing found is reported honestly, never fabricated.
4. **`generate-questions`** — writes questions for the requirements, given the
   brief, the hiring process and any public discussion, so a company known for a
   system-design round produces a different kit.
5. **coverage loop (code)** — `checkCoverage` finds must-haves with no question;
   the pipeline re-asks *only* for those, re-checks, and repeats up to three
   passes, stopping early if a pass closes no gaps.
6. **`generate-flashcards`**, then **`allocate-schedule` (code)** — the schedule
   is arithmetic, decided here, not by a prompt.
7. **`validate-kit`** — the kit is validated against the Appendix A schema before
   it is ever saved or returned.

---

## The decisions worth defending

### Coverage is a loop, not a prayer

Asking a model for "a question per requirement" and trusting the result is the
obvious approach and it silently loses requirements. Instead the pipeline
generates, then **checks coverage in code**, then re-asks only for the must-haves
still uncovered, up to a pass limit. If it gives up it says so in the kit and in
the UI rather than pretending. Passes are recorded in `coverage.passes`.

### Provenance, so regeneration cannot eat your work

Every question and flashcard carries one of three states:

- `generated` — the model wrote it, a regeneration may replace it
- `edited` — you changed it, a regeneration keeps it
- `pinned` — protected until you unpin it

`mergeRegenerated` reconciles new output against existing items using those
states. This is the hardest state problem in the brief and the reason the model's
output is never written straight over stored data.

Regeneration is per section, so disliking the flashcards does not cost you the
questions. A rebuild says up front how many items it will replace and how many
are protected, because a guarantee the user cannot see is not one they can act
on. New items continue the id sequence rather than reusing the ids of items just
discarded, so a pin or a practice record can never quietly reattach to different
content.

### The builder is a real editor

Every part of a kit can be reshaped: edit any question, answer outline,
flashcard or the company brief inline; **reorder** questions; **move** a question
to another category; **add** a question or flashcard by hand; and **delete**
either. A hand-added item is `edited` from birth, so a regeneration never sweeps
it away. Every write carries the version it was made against and is refused if
the kit moved underneath it.

Two "sections" are regenerated differently on purpose. The **schedule** is
deterministic, so rather than a button that re-runs the same arithmetic to the
same result, it is *recomputed automatically* after every edit that could change
it — a stronger guarantee than a manual trigger. The **brief** is prose the user
most often wants to word themselves, so it is directly editable; a full rebuild
(which re-crawls) remains available via regenerating the whole kit.

If the user edits the kit while a rebuild is running, the write is refused and
the regenerated result is thrown away: their words outrank the model's, and
that race is the whole reason edits carry a version.

### Edits are reconciled, not trusted

Editing which requirements a question tests changes what the kit covers, which
changes what the schedule should contain. So after every edit the deterministic
parts are **recomputed** — coverage re-checked, schedule reallocated, dangling
references pruned. You edit prose; the invariants are restored by code.

### Passwords use Node's own scrypt

A memory-hard KDF OWASP considers acceptable, with no native build step, so a
clean clone installs without a compiler. Cost parameters are stored alongside
each hash so they can be raised later without invalidating existing users.
Sign-in verifies a dummy hash when no user matches, so a missing account and a
wrong password take the same time.

### Untrusted pages are structurally quarantined

Company sites are attacker-controlled text being fed to a model. Every fetched
page is wrapped in an `<untrusted_document>` element, and the tags the prompt
uses structurally are escaped inside that content, so a page saying "ignore your
instructions" arrives as data rather than as instructions. Private and loopback
addresses are refused in production to prevent SSRF.

---

## How the four hard interaction problems are handled

The brief singles these out; each has tests asserting the behaviour.

**A generation that takes ninety seconds.** `POST /kits` returns `202` the moment
the work is claimed, not when it finishes. Progress is a pollable resource, so it
survives a refresh, a second tab, and a dropped connection — none of which an
in-memory stream would. The UI shows the pipeline's own step descriptions, not a
spinner.

**Triggered twice.** Starting a run is a single atomic `findOneAndUpdate` whose
filter *is* the guard: Mongo applies the condition and the write as one
operation, so two simultaneous clicks cannot both win. A test fires two
concurrent triggers and asserts both are refused and exactly one job exists.

**Fails halfway.** Every path ends in a terminal state, and a failed rerun leaves
the existing kit untouched — a timed-out regeneration does not destroy the kit
you were studying from. A worker that dies leaves a claim that becomes
reclaimable once its heartbeat goes quiet, so a crash cannot strand a kit as
permanently "generating".

**An edit in flight.** Every edit carries the version it was made against. An
edit racing a regeneration is refused rather than overwriting the result, and the
UI shows both versions side by side so you can keep yours, take theirs, or merge.
Your text is never discarded without you seeing it.

---

## Evidence Gaps — the custom feature

Every candidate reads a posting and thinks "I know Kubernetes". Almost nobody
audits whether they have a **specific story** to tell about it. That gap is what
sinks real interviews.

You record your actual experiences once in a story bank. The audit then maps
stories to requirements and reports what is missing — deliberately mirroring the
kit's own coverage checker, pointed at the candidate instead of the question
bank. Suggested links can no more invent evidence than a generated question can
invent a requirement.

It distinguishes the gap that matters from noise:

- **Critical** — a must-have the kit *will* interview you on, with no story
- Not critical — a nice-to-have gap, or a must-have nothing will ask about
- **Overused** — one anecdote stretched across four requirements usually
  convinces on none of them

---

## Practice mode

Leitner boxes with intervals of 0, 1, 2, 4, 7 and 14 days. A confident answer
promotes one box; a failed one returns to the start rather than stepping down,
because an item you could not answer is unlearned rather than slightly less
known. Nothing is ever scheduled past the interview. Ordering is total and
derived only from stored state, so the same inputs always produce the same queue.

The whole session is drivable from the keyboard: space reveals the answer, then
one digit grades it. Anything slower and people stop doing spaced repetition
after two days.

---

## The plan is anchored to a date, and recut when you fall behind

A kit is created against an **interview date**, not a day count. "Seven days" is
the question a scheduler wants to ask and the worst one to ask a person: seven
days from when, and does that include the morning of? A date removes the
arithmetic, turns Day 3 into Thursday, and makes a countdown possible.

Every study plan then breaks the same way: it is written once, the user misses
two days, and from then on it describes a past that did not happen. So the plan
shown on the home screen is **recomputed on every read** rather than stored:
whatever is still unpractised is allocated across whatever days are left, by the
same allocator that built it originally.

When it will not fit, it cuts rather than lies. Nice-to-have material is
deferred before must-have material, and if the must-haves alone still overflow a
sustainable day it says so instead of quietly producing a four-hour Tuesday.

All of it is civil-date arithmetic in UTC, never timestamps — a plan spanning a
daylight-saving change contains a 23-hour day, and counting in local time gets
"which day is today" wrong by one.

---

## Readiness is a number you can argue with

One score, 0–100, on the home screen. Two rules govern it.

**It is honest.** Only work the user actually did earns points. Coverage is
deliberately excluded from the numerator — it is the generator's achievement,
not the candidate's, and letting a well-built kit contribute would mean opening
the app and closing it again scored twenty per cent. An untouched kit scores
zero. Practice is measured by Leitner box rather than by attempts, because a
question answered confidently once is not as safe as one that has survived four
spaced sightings.

**It is explainable.** The number always decomposes into named components with
their own sentences and weights, and it names the single highest-leverage next
action. Missing coverage applies as a *ceiling* rather than a deduction: you
cannot be ready for a requirement nothing asks you about, so if half the
must-haves are untested the score cannot pass fifty however hard you practise.

Evidence is dropped from the score entirely when the story bank is unused, its
weight redistributed, so declining to use a feature cannot make you look
unprepared.

---

## Testing

```bash
npm test          # 512 tests across 37 files
npm run typecheck
```

No setup, no API key, no network calls. Server tests run against a real MongoDB
rather than mocks: if one is listening on port 27019 the suite uses it, and if
not it starts an in-memory server for the run. Docker is therefore optional for
testing.

To test against your own Mongo instead:

```bash
docker run -d --name prepkit-test-mongo -p 27019:27017 mongo:7
npm test
```

Port 27019, not the 27018 the dev stack uses. The suite creates and drops
databases as it goes, so it is never pointed at a Mongo you are developing
against.

The suite needs no API key and makes no network calls. A fake provider serves
canned model responses and a fixture server hosts four company websites covering
the awkward cases: a site with a hiring page, one with none, a near-empty site,
and one whose robots.txt refuses crawlers.

To drive the whole app with no key and no spend:

```bash
./scripts/dev-stack.sh --stub
```

The double ignores its input and always returns the same kit, so it is for
exercising plumbing and never for judging output quality.

---

## Configuration

Every variable is documented in `.env.example`. The ones that matter:

| Variable | Default | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | — | Set one |
| `LLM_PROVIDER` | inferred | `gemini` or `anthropic` |
| `LLM_MODEL` | per provider | `gemini-2.5-flash`, `claude-sonnet-5` |
| `SESSION_SECRET` | dev default | Boot fails in production if left as the default |
| `ALLOW_PRIVATE_HOSTS` | `false` in production | Blocks SSRF to private addresses |
| `EVALUATE_CONCURRENCY` | `2` | Cases in parallel; all share one rate limit |

---

## Sources used

- **Appendix A and B** of the assessment brief define the kit and report shapes.
- **OWASP Password Storage Cheat Sheet** for the scrypt parameters and for the
  decision to require length rather than character composition.
- **`robots.txt` conventions**, including `Crawl-delay`, are honoured by the
  crawler; only the company's own domain is ever fetched.
- **Leitner (1972)** for the spaced repetition intervals.
- Provider documentation for Google Gemini and Anthropic request formats.

Company content is fetched live from the URL you supply. Nothing is scraped ahead
of time, and every page used is listed in the kit under "Pages read" so a brief
can be checked rather than taken on trust.

---

## Known limitations

- **Seniority can come back empty** when a posting never states a level. The
  model correctly declines to invent one, but the UI renders a blank instead of
  saying "not stated".
- **JavaScript-rendered sites read thin.** The crawler fetches HTML and does not
  execute scripts, so a fully client-rendered site yields a sparse brief. It
  reports what it found rather than inventing the rest.
- **One shared rate limit.** Concurrent cases share one budget, which costs
  throughput under a free-tier key but avoids being throttled.
- **Readiness does not know what you said out loud.** Practice is self-graded,
  so the score measures honest self-assessment rather than answer quality.
  Grading the content would need a model call per answer and a far stronger
  claim than this system can support.
- **Deferred questions are not resurfaced.** When a replan sets nice-to-have
  material aside to make the must-haves fit, it is reported but there is no way
  to pull an individual question back in.
- **Public discussion depends on a public company.** The search step is genuine
  but keyless, and the batch cases use local/fictional companies, so it usually
  returns nothing — which is the honest result the brief asks for, not a gap.
- **Questions are generated in one pass, then per-gap.** The first draft is a
  single call spanning categories; the coverage loop then makes *separate*,
  targeted calls for what is uncovered. This keeps the run inside the free-tier
  rate budget (five cases in fifteen minutes) rather than fanning out one call
  per category, which is the deliberate trade-off.
