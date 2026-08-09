# Debug a Run from Outside the Browser

For whoever has to answer "why did this run fail, stall, or cost that much" without a scrollbar: an
on-call engineer working from a terminal, a script, or an LLM handed an API key and asked to
diagnose. Eight read-only endpoints under `/api/v1/debug/*` serve the same telemetry the
[observability](./observability.md) drill-down shows, in pages whose size you can predict before you
ask for them.

They take an ordinary `read`-scope [API key](../extend/public-api.md#authenticating).

::: warning A read key reaches prompts
These endpoints serve prompt and response bodies that the app gates behind workspace roles. Treat a
key that can call them as sensitive even though it is only `read` scope.
:::

## The endpoints

| Method and path | Returns |
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

The tool-call list is the one that returns rows whole, bodies included, because a tool call's
arguments and result are capped at capture time rather than at read time. It is also the one served
in two orders:

- **`recent`** (the default) is the newest-first keyset every list here shares, with a cursor to walk
  a long run.
- **`trajectory`** is the run's calls oldest-first, in the order the agents actually made them. It is
  a bounded prefix, so it returns no cursor, and passing one is a `400` rather than a silent fall
  back to the other order.

**Do not re-sort a page yourself to get the trajectory.** It looks derivable from the rows and is
not: `seq` restarts at zero on every dispatch, and `jobId` is a string, so ordering by it sorts a
run's dispatches by agent-kind spelling and its re-runs `-10` before `-2`.

Both orders take `?jobId=` to narrow to one dispatch, and `?outcome=ok|error` to narrow to the calls
that worked or the ones that did not.

## 1. Find the run, then map it

```
GET /api/v1/debug/runs?status=failed
GET /api/v1/debug/runs/:runId
```

Read `signals` first. They are precomputed derivations (failed calls, truncated output per agent
kind, container evictions, provisioning failures, a cold prompt cache), ordered most-severe first,
each with a count. Rediscovering "13 of 40 calls were truncated" by arithmetic over a JSON blob
sometimes gets it wrong and always costs context.

Signals are **observations, never a verdict**. A wrong confident cause is worse than an ordered list
of facts.

The overview costs a handful of SQL aggregates and reads no body at all. Its `sinks` block says which
detail endpoints have anything in them, so you only issue the expensive reads for data that exists.

## 2. Follow the signal

| Signal | What it means | Where the evidence is |
| --- | --- | --- |
| `provisioning_failed` | Infrastructure, not the model | `/logs`, which holds the verbatim provider error. For a run whose container never came up there is no model telemetry at all, and this is the only place its cause of death is written |
| `llm_calls_failed` | The model side broke | `/llm-calls?outcome=error`, then the point read for bodies. Non-2xx statuses here mean transport, proxy or spend-gate trouble: an infrastructure problem wearing model clothes |
| `output_truncated` | The model was cut off | The per-kind insight names which agent kept hitting its output ceiling. The conversation to have is about output limits or task size, not correctness |
| `tool_calls_failed` | A tool broke inside the container | `/tool-calls?outcome=error`. This is an **info**, not a warning: a failing tool call is the ordinary shape of an agent loop (a test that fails before it is fixed, a `grep` that matches nothing), so it carries the ratio, because 34 of 36 and 34 of 3,600 are the same count and opposite diagnoses |
| `tool_retry_loop` | An agent is re-running something that cannot work | The **warning** version: it fires only where failures concentrate on one agent-and-tool pair. Add `&order=trajectory` to see the loop in the order it ran |
| `failure_outside_model_calls` | The run died while every model call looks healthy | Its message says which of three cases this is: failing tool calls exist, a recorded loop in which nothing failed (so what is left is the engine), or no trajectory at all |
| `prompt_cache_cold` | The prefix keeps being invalidated | `llm.totals` and `byAgentKind` carry the three input classes (fresh, cache read, cache write) separately |

A tool **execution** failure is a perfectly healthy model call whose result came back bad, so it is
invisible in every LLM number on the overview. That is why the two are separate signals with
different severities.

Three questions the overview answers directly:

- **"What did the agents actually do, and how much of it worked?"** Read `toolCalls`: one aggregate
  at the agent-and-tool grain, re-cut as `byTool` and `byAgentKind`, each row carrying `failures` and
  `failureRate` beside `calls`. Both breakdowns lead with the most-failed row rather than the
  busiest one, because a run's busiest tool is almost never its broken one. A run that called no
  tools reports `failureRate: null` rather than a clean 0%, which would file "nothing happened"
  beside "everything worked".
- **"The agent never used the tool it was given."** Read the step's `toolServers` first. An agent
  that was never handed a tool server and one that had it and ignored it produce the same symptom,
  and the trajectory can only show the second. Each step carries `wired` and `unavailable`, the
  latter with the reason each was dropped. The field is **absent** on a step no container dispatch
  recorded one for, which is different from both lists being empty.
- **"Why did this small task cost so much?"** Read `llm.byPhase`, which re-cuts the spend by which
  slice of the run's work paid for it: the agent's own edit loop, a pre-PR validation repair round, a
  reproduction-proof repair round. `byAgentKind` cannot answer it, because one coder step contains
  every phase. Rows lead with `carryCostTokens` (each call's context counted once for every later
  turn that had to re-send it), so the phase that made everything after it expensive sorts first.

### What a cost figure here is

Every rollup row carries `costEstimate`, denominated in `llm.costCurrency`. Each input class is
priced at its own tier, so a cache read costs about a tenth of fresh input and a cache-dominated run
reports what it actually cost rather than ten times it.

It is a **list-price estimate, not a bill**: a run on a coding subscription pays nothing per token
and this reports what the same tokens would have cost metered. `costEstimate: null` means that slice
could not be priced, `costCurrency: null` means the deployment prices nothing at all, and neither is
ever reported as `0`. A total containing one unpriceable cell is null rather than a smaller number
that still reads as complete.

## 3. Grep for the cause

When the model side looks healthy, the cause is almost always *in the text*. Search server-side
instead of paging bodies:

```
GET /api/v1/debug/runs/:runId/llm-calls?contains=Validation%20failed&order=oldest
```

`contains` matches the prompt delta, response and reasoning case-insensitively in SQL, so one
request finds the needle across thousands of calls. Markers that repeatedly pay off:

- `Validation failed for tool` or `must have required properties`: the model is emitting malformed
  tool arguments. If it keeps repeating after the error is fed back, that is a model-quality problem
  rather than a prompt problem.
- A distinctive fragment of the run's own failure message: finds the call where the terminal symptom
  first appears.
- `<tool_call>` in **responses**: the model emitted a tool call as prose instead of through the
  structured channel.
- A file path, test name or error string from the task: finds where the agent first met it.

Each matched row reports a per-body `matchOffset` (null means the term is in a sibling body, not this
one). Feed it to the point read to see the context around the match, which is the `grep -C` of this
surface:

```
GET /api/v1/debug/llm-calls/:callId?bodyOffset=<matchOffset - 500>&bodyChars=2000
```

`bodyOffset` windows a body from any position, so the middle and the tail of a large one are
reachable: the last tool result in a long delta and the end of a captured build log are exactly where
causes sit. Every slice states the offset it starts at, so neighbouring windows stitch.

## 4. Attribute the spend

Every call row carries `phase` (which slice of the run paid for it) and `turnIndex` (its ordinal
within that job's sequence). Both are stamped by whoever owns the loop boundary, so they are read
rather than inferred.

```
GET /api/v1/debug/runs/:runId/llm-calls?phase=validation-repair
```

Two values behave in ways worth knowing before you read a number off this:

- **`phase=` (empty) is a real query**, selecting the unattributed slice, not "no filter". An inline
  call (a judge, a consensus panel, the requirements writer) always lands there, because phases are
  boundaries the container harness owns and a call made outside a container has none to claim. So a
  run built entirely of inline steps reports its whole spend under the empty phase, which is a
  complete answer rather than a missing one. A run whose calls are *all* unattributed was metered by
  a channel with no phase concept; it did **not** spend nothing outside the agent loop.
- **`turnIndex` is `null`**, not 0, wherever the producing channel has no turn concept. A 0 there
  would read as "the first turn" and sort every proxied call to the front of its phase.

## 5. Read the conversation

```
GET /api/v1/debug/runs/:runId/llm-calls?agentKind=coder&order=oldest&bodyChars=2000
```

Each call's `prompt` is the **delta**, only the messages that call appended, because that is how the
store keeps prompts: a container agent re-sends its whole growing history every turn, so storing the
full array per call is about 21 times redundant. Concatenating the deltas in order reconstructs the
conversation, and `elidedLeadingMessages` says how many earlier messages the delta sits on top of.

For one call, `?view=messages` on the point read parses the delta into per-message rows (role, tool
name, tool calls with their arguments, content), each budgeted **independently** via `bodyChars`. In
the raw view a 100 kB leading tool result must be paid for in full before anything after it is
visible; in the messages view every message shows its head. An unparseable delta degrades to the raw
window with `promptMessages: null`: stated, never guessed at.

## 6. Hand the whole thing to a model

The steps above are a drill-down: cheap map, then targeted reads. When the caller **is** a model and
the question is open, the round trips are the cost.

```
GET /api/v1/debug/runs/:runId/llm-export?limit=40&order=oldest&bodyChars=500
```

One self-describing document, the same one the app's export button produces. Three properties are
the whole design:

- **The rollups cover the run; the call rows are a window.** The `llm` block is the same aggregate
  the overview publishes, computed over every recorded call whatever `limit` says. So a bundle
  budgeted down to 20 rows still states what the run actually cost.
- **`truncated` and `order` are stated, never inferred.** A reader who does not know the cap cannot
  tell a complete bundle from a windowed one, and this is exactly the document where a partial sum
  gets quoted as a whole. `order` says which end was kept: `oldest` reads the run forwards, `newest`
  keeps the tail a run that died late says why in.
- **`available` separates "nothing recorded" from "nothing happened".** With no sink wired the
  rollups fold empty and the call rows are absent, so the bundle is byte-identical to a run that made
  no model calls. Read it first; a model handed the document without it will diagnose the silence.

It is deliberately **not** resumable: a bundle answers a question about one end of a run, and
`/llm-calls` is the resumable walk for a run you need whole.

## Sizing a request

A response's size is computable before you make the request, which is the rule the whole surface is
shaped by.

| Read | Worst case |
| --- | --- |
| LLM-call list | `limit × 3 × bodyChars` characters of body |
| `?view=messages` point read | `(messageCount − elidedLeadingMessages) × bodyChars`, both factors already on the list row |
| Tool-call list | `limit × 2 × the capture-time body cap` |
| Everything else | `limit × row size`; index rows carry no body |

Ceilings: `limit ≤ 100`; `bodyChars ≤ 4000` on a list and `≤ 200000` on a point read;
`bodyOffset ≤ 2000000`, which is above the store's own 512 kB per-body cap, so every stored character
is reachable. A body larger than one window is read in stitched windows, and `truncated`, `offset`
and `totalChars` always say which part is in hand.

Fan-out lists never carry bodies; bodies are a point read. The one opt-in exception is `?bodyChars=`
on the LLM-call list, because "did this call come back empty?" is a triage question a size alone
answers ambiguously.

## Known limitations

- **A conversation is identified by agent kind, not by step.** Call rows carry no step index, so a
  step re-dispatched after an eviction, or repeated fixer attempts, interleaves into one
  conversation. A chain restart is visible as `elidedLeadingMessages` dropping back to 0 partway
  through an `order=oldest` walk, and as `turnIndex` resetting. Neither names which attempt sits on
  either side of the boundary.
- **Two things fall outside the tool-call sink**: an engine-side failure, which no producer records,
  and an older runner image, which reports `bodies: 'withheld'` when it captured no argument text.
  Both are stated as absence rather than as a clean loop.
- **Search is a literal substring, and case folding is ASCII.** Terms are not patterns.
- **Capture gates act upstream.** `LLM_RECORD_PROMPTS` and the per-workspace agent-context setting
  govern what text exists at all. This surface cannot see them, and reports `available: true,
  count: 0` for a workspace that opted out. See
  [Controlling prompt retention](./observability.md#controlling-prompt-retention).

---

Next: [Observe What Your Agents Do](./observability.md) for the same telemetry in the app, or
[Troubleshooting](./troubleshooting.md) for failures that never got as far as a run.
