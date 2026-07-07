# SlopShield AI — Product Vision & Architectural Direction

## Thesis

AI made code cheap and review expensive. Every team now merges more code than
it can carefully read, and the tools that promise to help — text-based "AI
detectors" — are trivially evaded because they inspect the artifact. SlopShield
inspects the **behavior**: how the change came into being. Velocity, churn
shape, test movement, and timing form a signature that is expensive to fake
because faking it requires actually doing the work.

The long-term identity is not "a scanner you paste URLs into." It is the
**trust layer for the merge decision** — a longitudinal, evidence-based read
on how code enters a codebase.

## Who it serves, in order

1. **The reviewer** deciding how much scrutiny a PR deserves before opening
   the diff — today's user.
2. **The team lead / EM** who needs the fleet view: which repos are
   accumulating risk, which contributors' changes consistently need rework.
3. **The organization**, for whom "how code gets written here" becomes a
   measurable property rather than folklore.

## Architecture: what it is, and what it must become

Today SlopShield is a request-response app: a user submits a PR, a pipeline
(GitHub REST → metrics → Gemini verdict → Postgres) runs once, a verdict
renders. Three architectural shifts define the future:

### Shift 1 — From user-initiated to event-driven

The scanner-page model caps the product at curiosity. The destination is a
**GitHub App**: installation-scoped tokens, webhook ingestion, and audits
that happen *because a PR was opened*, with the verdict delivered where the
decision happens — a PR comment and a commit status. The existing pipeline
already has the right shape for this (pure functions from PR ref → verdict);
what changes is the trigger topology and the credential model. The manual
"Copy as PR comment" feature is the prototype of this future: it proved the
verdict belongs in the thread, not in a dashboard.

### Shift 2 — From verdict to reputation (the data platform)

A single scan is a snapshot; the durable value is longitudinal. The nightly
rollup already aggregates per-repo health — the architecture should treat
that warehouse as a first-class product surface, not a byproduct: repo risk
trendlines, contributor-level patterns, org baselines ("your median PR
velocity is X; this one is 40X"). Reputation over time is also the moat: any
competitor can call a model; nobody can backfill a year of your merge
history. This demands discipline the current schema mostly has — append-only
scans, stable metrics definitions, versioned scoring — and a growing
commitment to **never breaking historical comparability** when metrics evolve.

### Shift 3 — From oracle to instrument (calibration as core competency)

Today the verdict is plausible but unmeasured. The defining improvement is an
**evaluation discipline**: a labeled corpus of known-human and known-AI-slop
PRs, precision/recall published openly, and every scoring change gated on the
eval. Architecturally this means the scoring layer must be swappable and
comparable: the LLM judgment, a deterministic heuristic baseline, and future
learned models all run against the same telemetry contract, so the system can
answer "is the model actually adding signal over the heuristics?" — and keep
badges alive when the model API is down. New signals (commit-message
uniformity, force-push patterns, bot detection, CI failure-fix cycles) enter
through the same gate: kept only if the eval says they help.

The prompt-injection posture established in the current code (telemetry as
fenced data, manipulation attempts treated as signal) graduates from a
defensive patch to a stated design principle: **everything an author can
type is adversarial input to the judge.**

## Product surface evolution

The badge → the comment → the status check → the org dashboard, in that
order of intimacy. Each surface earns the next: a README badge invites
curiosity, the PR comment enters the workflow, the status check enters
policy ("scans above threshold require a second reviewer"), and the fleet
dashboard justifies a team plan. Monetization, when it matters, follows the
same line: individuals free, private repos and org analytics paid.

## Horizons

**H1 — Credible.** Deployed, public, self-dogfooding (the repo wears its own
badge), tested at the trust boundaries, and honest about known blind spots
(PRs beyond the first hundred commits/files are currently under-measured —
exactly the PRs most likely to matter; closing that is table stakes, not a
feature).

**H2 — Embedded.** The GitHub App exists; verdicts arrive unbidden on new
PRs in installed repos; the fleet view reads the warehouse that has been
quietly filling since day one. Rate limiting and caching move from
per-instance memory to shared infrastructure, because event-driven load
arrives in bursts the current design assumes away.

**H3 — Authoritative.** Published calibration numbers strong enough to cite;
an API other tools consume; policy integration (merge gates). Success at H3
is when "what's its SlopShield score?" is a sentence someone says in a code
review we've never heard of.

## What SlopShield deliberately is not

- **Not a text detector.** The model never sees the diff — this is identity,
  not limitation. It keeps audits cheap, privacy-friendly, and orthogonal to
  the detectors slop authors already know how to beat.
- **Not a gatekeeper by default.** The verdict informs scrutiny; it does not
  block merges unless a team explicitly wires it into policy. A measurement
  instrument that overclaims becomes ignored.
- **Not an AI-shaming tool.** High velocity + healthy tests + real deletions
  scores fine regardless of authorship. The target is *unreviewed* slop, not
  AI assistance.

## Risks and how the architecture answers them

- **False positives on legitimate speed** (hotfixes, generated code,
  vendored deps) → calibration corpus must include them; repo-level
  baselines normalize per-project culture.
- **Signature drift** (slop authors adapt: splitting commits, spacing
  pushes) → longitudinal, multi-signal scoring raises the cost of faking;
  the eval loop detects when a signal decays.
- **GitHub API dependency** (rate limits, schema change) → the telemetry
  contract isolates scoring from fetching; caching and the deterministic
  fallback keep surfaces alive through outages.
- **LLM cost/latency at webhook scale** → the heuristic-first architecture
  allows tiering: cheap score always, model judgment where it changes the
  outcome.

## What success looks like in one sentence

A reviewer opens a PR and already knows how it was made — because a system
that has watched every merge for a year told them, with numbers it can
defend.
