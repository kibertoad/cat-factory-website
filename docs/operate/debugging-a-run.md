# Debug a Run from Outside the Browser

For anyone who has to answer "why did this run fail, stall, or cost that much" without a browser
open: a script, a dashboard, a CI job, or an LLM handed an API key and asked to diagnose a run.
Everything the app's own observability drill-down shows is available over `/api/v1/debug/*` under a
read-scope [public API key](../extend/public-api.md#managing-keys).

The app loads a run's whole telemetry into a browser, which is fine for a person with a scrollbar
and useless for a caller with a fixed context budget. This surface is the same data, walkable.

::: tip One rule shapes the whole surface
**A response's size is computable before the request is made.** Every list is keyset-paginated with
a hard limit, bodies are omitted unless you ask for them by character budget, and the big reads
state what they truncated. There is no endpoint here that can surprise you with a hundred megabytes.
See [Sizing a request](#sizing-a-request).
:::

## The endpoints

| Method / path | Returns |
| --- | --- |
| `GET /api/v1/debug/runs` | The workspace's runs, newest first. `?status=`, `?since=`, `?limit=`, `?cursor=` |
| `GET /api/v1/debug/runs/:runId` | The run's diagnostic **overview**: aggregates plus signals |
| `GET /api/v1/debug/runs/:runId/llm-calls` | Recorded model calls. `?agentKind=`, `?phase=`, `?outcome=`, `?contains=`, `?order=`, `?bodyChars=`, `?limit=`, `?cursor=` |
| `GET /api/v1/debug/llm-calls/:callId` | One call, full bodies. `?bodyChars=`, `?bodyOffset=`, `?view=raw\|messages` |
| `GET /api/v1/debug/runs/:runId/agent-context` | Captured dispatches, **sizes only**. `?stepIndex=`, `?limit=`, `?cursor=` |
| `GET /api/v1/debug/agent-context/:snapshotId` | One dispatch's prompts, fragments and injected files. `?bodyChars=`, `?bodyOffset=` |
| `GET /api/v1/debug/runs/:runId/search-queries` | Web searches the run's agents performed |
| `GET /api/v1/debug/runs/:runId/tool-calls` | Tool calls the run's agents made, bodies included. `?order=`, `?jobId=`, `?outcome=`, `?limit=`, `?cursor=` |
| `GET /api/v1/debug/runs/:runId/logs` | The run's provisioning event log |
| `GET /api/v1/debug/runs/:runId/llm-export` | The run's model activity as one bundle. `?limit=`, `?order=`, `?bodyChars=` |

Exact parameters and payload shapes for each are on the
[API Endpoint Reference](../reference/api-reference.md#debug).

Two details of the tool-call list are worth knowing before you use it. It is the one list that
returns its rows whole, bodies included, which it can do under the size rule because a tool call's
arguments and result are capped at CAPTURE time rather than windowed at read time. And it is the
one served in two orders:

- `recent`, the default, is the newest-first keyset every list here shares, with a cursor for
  walking a long run.
- `trajectory` is the run's calls oldest-first, in the order the agents actually made them. It is a
  bounded prefix, so it returns no cursor, and passing one with it is a `400` rather than a silent
  fall back to the other order.

**Do not re-sort a page yourself to get the trajectory.** It looks derivable from the rows and is
not: the per-call sequence number restarts at zero on every dispatch, and the job id is a string, so
ordering by it sorts a run's dispatches by agent-kind spelling and its re-runs `-10` before `-2`.

## 1. Find the run, then map it

`GET /debug/runs?status=failed` finds it; `GET /debug/runs/:runId` maps it.

Read `signals` first. They are precomputed derivations (failed calls, truncated output per agent
kind, container evictions, provisioning failures, a cold prompt cache), ordered most-severe first,
each with a count. A model that has to rediscover "13 of 40 calls were truncated" by arithmetic over
a JSON blob will sometimes get it wrong and will always spend context getting it right.

Signals are observations, never a verdict. A confident wrong cause is worse than an ordered list of
facts.

## 2. Follow the signal

Where each failure class keeps its evidence.

- **`provisioning_failed`: infrastructure.** `/logs` holds the verbatim (scrubbed) provider error.
  For a run whose container never came up there is no model telemetry at all, and this is the only
  place its cause of death is written. A container that came up and then died is covered by the
  overview's per-step eviction detail: exit state plus a log tail.
- **`llm_calls_failed`: the model side broke.** `/llm-calls?outcome=error`, then the point read for
  the bodies. Non-2xx statuses and error messages here mean transport, proxy or spend-gate trouble:
  an infrastructure problem wearing model clothes.
- **`output_truncated`: the model was cut off.** The per-kind insight names which agent kept hitting
  its output ceiling. The conversation to have is about output limits or task size, not correctness.
- **`tool_calls_failed` and `tool_retry_loop`: a tool broke inside the container.** A tool-EXECUTION
  failure is a perfectly healthy model call whose result came back bad, so it is invisible in every
  LLM number on the overview. The two are deliberately not the same kind of statement.
  `tool_calls_failed` is an **info**: it counts failures run-wide with the RATIO (34 of 36 and 34 of
  3,600 are the same count and opposite diagnoses) and fires on any run with a failure at all,
  because a failing tool call is the ordinary shape of an agent loop: a test that fails before it is
  fixed, a `grep` that matches nothing. `tool_retry_loop` is the **warning**: it fires only where
  failures concentrate on one agent-kind-and-tool pair, which is the difference between an agent
  re-running something that cannot work and one meeting the occasional failing command. Drill in
  with `/tool-calls?outcome=error`, and add `&order=trajectory` to see the loop in the order it ran.
- **`failure_outside_model_calls`: the run died while every model call looks healthy.** The signal
  is computed off the LLM telemetry alone, so it fires on a failure the model side cannot explain:
  tool execution inside the container, or the engine itself. Its message says which of three cases
  this is, because they need different next steps. Failing tool calls exist, so start at
  `/tool-calls?outcome=error` and narrow with `?jobId=` to the dispatch that died. Or a recorded
  loop in which nothing failed, so what is left is the engine. Or no trajectory at all, which is
  unrecorded rather than uneventful.
- **"the agent never used the tool it was given": read the step's `toolServers` first.** An agent
  that was never handed a tool server and one that had it and ignored it produce the same symptom,
  and the trajectory can only show the second. Each step carries what its dispatch decided: the
  servers it wired, and the ones it dropped with the reason for each. The field is ABSENT on a step
  no container dispatch recorded one for, which is a different fact from both lists being empty.
  What the reasons mean: [Why a run did not get the server](../extend/tool-servers.md#why-a-run-did-not-get-the-server).
- **`prompt_cache_cold`, or any cost question.** The overview's LLM totals carry the three input
  classes (fresh, cache read, cache write) separately. A loop that keeps invalidating its prefix and
  one riding a warm cache are indistinguishable once they are summed.
- **"why did this small task cost so much?": read the by-phase rollup.** It re-cuts the same
  aggregate by WHICH slice of the run's work spent the tokens: the agent's own edit loop, a pre-PR
  validation repair round, a reproduction-proof repair round. The by-agent-kind rollup cannot answer
  that, because one coder step contains every phase. Rows lead with the carry cost, each call's
  context counted once for every later turn that had to re-send it, so the phase that made
  everything after it expensive sorts first rather than merely the one that read the most. Compare a
  run's phases against each other; the absolute number means nothing. An empty phase is the
  unattributed slice and is always present rather than dropped, so "we could not attribute this"
  never reads as "nothing was spent here".
- **"what did it cost?": every rollup row carries a cost estimate**, in the currency named once on
  the LLM object. Each input class is priced at its own tier, so a cache-dominated run reports what
  it actually cost rather than several times it. It is a LIST-PRICE estimate, not a bill: a run on a
  subscription harness pays nothing per token and this reports what the same tokens would have cost
  metered. A null estimate means the deployment could not price that slice, and a null currency
  means it prices nothing at all. Neither is ever reported as `0`, and a total containing one
  unpriceable cell is null rather than a smaller number that still reads as complete.

## 3. Grep for the cause

When the model side looks healthy, the cause is almost always in the text. Search for it
server-side instead of paging bodies:

```
GET /debug/runs/:runId/llm-calls?contains=Validation%20failed&order=oldest
```

`contains` matches the prompt delta, the response and the reasoning, case-insensitively, in SQL, so
one request finds the needle across thousands of calls. Markers that have repeatedly paid off:

- `Validation failed for tool` or `must have required properties`: the model is emitting malformed
  tool arguments. If it keeps repeating after the error is fed back, that is a model-quality
  problem, not a prompt problem.
- A distinctive fragment of the run's failure message: finds the call where the terminal symptom
  first appears.
- `<tool_call>` in a RESPONSE: the model emitted a tool call as prose instead of through the
  structured channel.
- A file path, test name or error string from the task: finds where the agent first met it.

Each matched row reports a per-body match offset, null when the term is in a sibling body rather
than that one. Feed it to the point read to see the context AROUND the match, which is the `grep -C`
of this surface:

```
GET /debug/llm-calls/:callId?bodyOffset=<matchOffset - 500>&bodyChars=2000
```

`bodyOffset` windows a body from any position, so the middle and the tail of a large one are
reachable: the last tool result in a long delta and the end of a captured build log are exactly
where causes sit. Every slice states the offset it starts at, so neighbouring windows stitch.

### Attribute the spend

Every call row carries the phase that paid for it, plus its ordinal within that job's telemetry
sequence. Both are stamped by whoever owns the loop boundary, so they are read rather than inferred.
`?phase=validation-repair` narrows the page in SQL, which is what makes "the pipeline did work this
task never needed" answerable in one request instead of by paging the whole run.

Two values behave in ways worth knowing before you read a number off this.

- **An empty `phase=` is a real query**, selecting the unattributed slice, not "no filter". An
  inline call always lands there (a judge, a consensus panel, the requirements writer), because
  phases are boundaries the container harness owns and a call made outside a container has none to
  claim. So a run built entirely of inline steps reports its whole spend unattributed, and that is a
  complete answer rather than a missing one.
- **A null turn index is not a zero.** Wherever the producing channel has no turn concept, it is
  null. A `0` there would read as "the first turn" and sort every such call to the front of its
  phase.

## 4. Read the conversation

`GET /debug/runs/:runId/llm-calls?agentKind=coder&order=oldest&bodyChars=2000` walks one agent
kind's conversation forwards.

Each call's prompt is the DELTA, only the messages that call appended, because that is how the store
keeps prompts: a container agent re-sends its whole growing history every turn, so storing the full
array per call is about 21 times redundant. Concatenating the deltas in order reconstructs the
conversation, and each row says how many earlier messages its delta sits on top of.

For one call, `?view=messages` on the point read parses the delta into per-message rows (role, tool
name, tool calls with their arguments, content), each budgeted INDEPENDENTLY. In the raw view a
100 kB leading tool result must be paid for in full before anything after it is visible; in the
messages view every message shows its head. An unparseable delta degrades to the raw window and says
so, rather than guessing.

## 5. Hand the whole thing to a model

The steps above are a drill-down: cheap map, then targeted reads. When the caller IS a model and the
question is open, the round trips are the cost. `GET /debug/runs/:runId/llm-export` is the same
telemetry as one self-describing document:

```
GET /debug/runs/:runId/llm-export?limit=40&order=oldest&bodyChars=500
```

Three properties are the whole design:

- **The rollups cover the run; the call rows are a window.** The rollups are the same fold the
  overview publishes, computed over every recorded call whatever `limit` says, so a bundle budgeted
  down to 20 rows still states what the run actually cost.
- **Truncation and order are stated, never inferred.** A reader who does not know the cap cannot
  tell a complete bundle from a windowed one, and this is exactly the document where a partial sum
  gets quoted as a whole. The order says which END was kept: `oldest` reads the run forwards,
  `newest` keeps the tail that a run which died late says why in.
- **`available` separates "nothing recorded" from "nothing happened".** With no telemetry sink
  wired, the rollups fold empty and the call rows are absent, so the bundle is byte-identical to a
  run that made no model calls. Read it first: a model handed the document without it will diagnose
  the silence.

It is deliberately not resumable. A bundle answers a question about one end of a run; `/llm-calls`
is the resumable walk for a run you need whole.

## Sizing a request

A page's worst case is `limit × 3 × bodyChars` characters of body for the LLM-call list, and
`limit × row size` for everything else: agent-context index rows carry no body, and search and log
rows are small by construction. A `?view=messages` point read's worst case is
`(messageCount − elidedLeadingMessages) × bodyChars`, both factors already on the list row.

Ceilings:

| Parameter | Ceiling |
| --- | --- |
| `limit` | 100 |
| `bodyChars` on a list | 4,000 |
| `bodyChars` on a point read | 200,000 |
| `bodyOffset` | 2,000,000 |

The offset ceiling sits above the store's own 512 kB per-body cap, so every stored character is
reachable: a body larger than one window is read in stitched windows, and each response says which
part is in hand.

## Known limitations

- **A conversation is identified by agent kind, not by step.** Call rows carry no step index, so a
  step re-dispatched after an eviction, or repeated fixer attempts, interleave into one
  "conversation". A chain restart is visible as the elided-message count dropping back to zero
  partway through an oldest-first walk, and as the turn index resetting. Neither is a step index:
  they mark the boundary without naming which attempt sits on either side of it.
- **Two things genuinely fall outside the tool-call record**, and neither is reconstructed by
  guesswork: an engine-side failure, which no producer records, and an older runner image, which
  reports its bodies as withheld when it captured no argument text and has its whole dispatch
  skipped when it numbers no calls at all. The overview distinguishes "a clean loop was recorded"
  from "nothing was recorded", so neither absence reads as a run whose tools all worked.
- **Search case folding is ASCII**, and search terms are literal substrings rather than patterns.
- **Capture gates act upstream.** Prompt recording and per-workspace agent-context storage govern
  what text exists at all. This surface cannot see them, and reports a sink as available with a
  count of zero for a workspace that opted out.

## What it will not do

It is read-only, and it stays that way. Nothing here retries a run, edits a task, or changes
anything: those are the [board endpoints](../extend/public-api.md#board-workloads), which take a
`write`-scope key. A `read` key is enough for everything on this page, which is what makes it safe
to hand to a diagnostic agent.

---

Next: [Observability](./observability.md) for the dashboards and the retention windows, or
[Troubleshooting](./troubleshooting.md) for the failures with known fixes.
