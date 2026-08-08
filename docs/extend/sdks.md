# Official SDKs

Cat Factory publishes clients for the [public API](./public-api.md) in four languages. They cover
the same operations, decode the same wire shapes, and are generated from the same OpenAPI spec the
deployment validates against, so a client cannot describe a request the server would reject.

| Language | Package | Registry |
| --- | --- | --- |
| TypeScript | `@cat-factory/sdk` | npm |
| Python | `cat-factory-sdk` | PyPI |
| Go | `github.com/kibertoad/cat-factory/sdk/go` | the Go module proxy |
| Java and Kotlin | `ai.catfactory:cat-factory-sdk` | Maven Central |

Two projections sit beside them rather than being a fifth client: the
[MCP server](./mcp-server.md), which exposes the same operations as tools to an MCP host, and the
Gatekeeper bindings, a policy-annotated operation table for credential-holding front-ends.

## Getting a key

Every client authenticates with a public-API key minted from the deployment, and the key is what
decides what the caller can do. Scopes are a ladder: `read` ⊂ `write` ⊂ `decide` ⊂ `admin`. Mint the
narrowest one that does the job, and remember that every key is scoped to one workspace. See
[Public API → Setup](./public-api.md).

```ts
import { CatFactoryClient } from '@cat-factory/sdk'

const client = new CatFactoryClient({
  baseUrl: 'https://cat-factory.example.com',
  apiKey: process.env.CAT_FACTORY_API_KEY,
})

const { services } = await client.services.list()
const task = await client.tasks.create(services[0].serviceId, {
  title: 'Add a health check',
  description: 'Expose /health returning build metadata.',
})
const run = await client.tasks.start(task.taskId)
```

## What every client guarantees

These are invariants each SDK implements in its own idiom. All of them are about being honest with
the caller rather than convenient:

- **Absent is not null.** A field that may not be sent and a field that is sent holding null are
  kept apart everywhere. Collapsing them turns "leave this alone" into "clear it" on a request, and
  "the server had no value" into "the server said nothing" on a response.
- **An unknown value never raises.** The API is additive forever, so a deployment will send enum
  values and object fields an older client has never heard of. Every client decodes them anyway;
  otherwise each additive server release would be an outage for anyone who has not upgraded.
- **The error class comes from the HTTP status; the cause comes from `code`.** The status picks the
  exception type, and `code` is exposed verbatim as a plain string rather than narrowed to a closed
  enum, because new codes appear without a major version.
- **Only idempotent requests are retried.** Starting a run costs real model work, and a transport
  failure with no response says nothing about whether the server acted.
- **Streams are never auto-reconnected.** A reconnect replays the event stream from its start, and
  only you know which events you have already acted on.
- **The client deadline bounds the response, not a stream.** On an ordinary request it covers the
  whole exchange. On an event stream it stops once the headers arrive, because a run parked on a
  human decision waits indefinitely by design: a quiet stream is the normal state of a healthy one.
- **Pagination ends on the cursor, not on an empty page.** A keyset page may legitimately arrive
  empty with a cursor still set, so every client follows the cursor and raises if the server hands
  back the one it was just given.
- **No dependencies you did not ask for.** Python and Go have none, TypeScript uses `fetch`, and
  Java has exactly one (Jackson) plus compile-time annotations.

## Kotlin

There is no separate Kotlin SDK, and that is a decision rather than an omission. One artifact serves
both languages: the Java client is annotated so Kotlin reads real nullability off it rather than
falling back to platform types, keywords that collide (`public`) are escaped while keeping the wire
name, models are built with builders rather than telescoping constructors, the error hierarchy is
sealed so a Kotlin `when` is exhaustive with no `else`, and enums tolerate values a newer deployment
sends.

```kotlin
val client = CatFactoryClient.builder()
    .baseUrl("https://cat-factory.example.com")
    .apiKey(System.getenv("CAT_FACTORY_API_KEY"))
    .build()

val service = client.services().list().services.first()
val pr: String? = client.tasks().get(taskId).pullRequestUrl  // nullable, and the compiler knows
```

What a Kotlin caller does not get, stated plainly: the models are Java records, so there is no
`copy()` and no destructuring, and named arguments do not work on Java methods. Both are cosmetic
beside null-safety.

## Pointing a client at localhost or a mock

`baseUrl` takes any origin and no client validates the scheme, so a local deployment, a recorded
fixture server, or a WireMock/MSW double all work.

| Language | Base URL | Injecting your own transport |
| --- | --- | --- |
| TypeScript | `new CatFactoryClient({ baseUrl, apiKey })` | `fetch:` |
| Python | `CatFactoryClient(base_url=…, api_key=…)` | `opener=` |
| Go | `catfactory.New(Options{BaseURL: …})` | `HTTPClient:` |
| Java | `CatFactoryClient.builder().baseUrl(…)` | `.httpClient(…)` |

Two things to know when the target is a local mock:

- **The Java client drops to HTTP/1.1 for cleartext origins on purpose.** Its default is HTTP/2,
  which over plain HTTP sends an upgrade header on every request, and a mock that does not speak it
  is entitled to reject the request. Over HTTPS the negotiation is ALPN, so HTTP/2 is kept.
- **The key is never inspected client-side**, so a mock needs no real key: any non-empty string
  works. Only that `baseUrl` and `apiKey` are non-empty is validated, and only to fail early rather
  than send an unauthenticated request.

## How they stay correct

Models and operation methods are generated from the OpenAPI spec, which is itself generated from the
route contracts the deployment validates against. Each client's transport, error hierarchy, retry
policy, pagination helper, and event-stream reader are hand-written and live beside the generated
files, which is what keeps a contract change from rewriting behaviour.

A cross-client smoketest drives the same scenario through all four against one real backend and
compares their reports field by field, so one language decoding a field differently, mapping a
refusal to the wrong class, or paginating one page short fails a test rather than shipping.

The contributor-facing account of that chain (regenerating, adding an endpoint, the release
mechanics) lives in the code repository:
[`sdk/README.md`](https://github.com/kibertoad/cat-factory/blob/main/sdk/README.md).

---

Next: the [Public API](./public-api.md) reference for the operations themselves, or the
[MCP Server](./mcp-server.md) to give an MCP host the same surface.
