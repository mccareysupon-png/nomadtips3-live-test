# NOMADTIPS3 Local Live AI Bot

Local bridge for using an LM Studio model with **CAR 3.1 confirmed live signals**.

This folder is isolated from the CAR 3.1 Worker. It does **not** change CAR 3.1 gates, confirmation logic, odds parsing, settlement, Monitor, LINE, Stripe, or Durable Object state.

## Data flow

```text
CAR 3.1 /history (confirmed record)
          |
          +---- CAR 3.1 /live (current context, when available)
          |
          v
LM Studio on localhost
          |
          v
PAPER_ACCEPT / PASS / REVIEW
          |
          +---- manual-outbox.jsonl
          +---- paper-ledger.jsonl
          +---- XXX reserved integration hook
```

CAR 3.1 is authoritative. The local model is a second-pass observer and is explicitly told not to recompute or alter the frozen upstream rules.

## What is implemented

- Poll CAR 3.1 confirmed History.
- Detect only new confirmed records after startup.
- Pull matching live context when it is still available.
- Send a compact structured payload to LM Studio on `localhost`.
- Auto-detect a visible LM Studio chat model when `model` is `auto`.
- Require a structured local-AI decision: `PAPER_ACCEPT`, `PASS`, or `REVIEW`.
- Write every decision to a local JSONL audit log.
- Optional manual-review outbox.
- PAPER open ledger.
- PAPER settlement copied from CAR 3.1 History without recalculating results locally.
- Persistent de-duplication state so the same confirmed record is not processed repeatedly.
- Windows launcher and one-cycle test launcher.
- Reserved `XXX` integration hook kept isolated for future extension.

## Intentionally not implemented

`src/executors/xxx.mjs` is a deliberate placeholder. It contains no betting-site automation, credentials, transaction submission, or real-money execution code.

The extension point remains present so the rest of the data/AI pipeline does not need to be redesigned later. The current repository simply returns `XXX_NOT_IMPLEMENTED` from that hook.

## Requirements

- Windows PC with internet access for the CAR 3.1 live feed.
- LM Studio installed locally.
- A chat/instruct model downloaded and visible to the LM Studio server.
- LM Studio local server running, default `http://127.0.0.1:1234`.
- Node.js 18 or newer.

The model inference stays on the PC. Internet is still required for CAR 3.1 live data.

## Start on Windows

1. Open LM Studio.
2. Load a chat model.
3. Open **Developer** and start the local server.
4. Double-click `start.bat`.

On first run `start.bat` creates `config.json` from `config.example.json`.

The doctor checks:

- Node.js version.
- CAR 3.1 `/health`.
- CAR 3.1 `/history`.
- LM Studio local address.
- LM Studio `/v1/models` and a visible chat model.

If all checks pass, the bot starts polling.

## First-run behavior

Default:

```json
"bootstrapMode": "tail"
```

This marks existing CAR 3.1 History as already seen and waits for the **next** confirmed signal. It prevents the bot from replaying old signals when it is first installed.

For a one-time test with the latest existing History record, temporarily change:

```json
"bootstrapMode": "replay-latest"
```

Then run `run-once.bat`. After the test, change it back to `tail`.

`replay-all` is also supported for offline testing, but it can send many old records to the local model.

## Execution modes

### `paper` — default

```json
"execution": {
  "mode": "paper"
}
```

A local PAPER entry is opened only when the local AI returns `PAPER_ACCEPT`. When CAR 3.1 later settles that History record, the upstream result is copied into the PAPER ledger. The local bot does not recalculate settlement.

### `manual`

```json
"execution": {
  "mode": "manual"
}
```

No PAPER entry is opened. The decision is written to `runtime/manual-outbox.jsonl` for human review.

### `xxx`

```json
"execution": {
  "mode": "xxx"
}
```

Calls the reserved `src/executors/xxx.mjs` hook. The supplied repository implementation only logs `XXX_NOT_IMPLEMENTED`.

## Runtime files

Generated locally and ignored by Git:

```text
runtime/state.json
runtime/decisions.jsonl
runtime/manual-outbox.jsonl
runtime/paper-ledger.jsonl
runtime/xxx-ledger.jsonl
```

No LM Studio conversation data or local runtime state is committed to the repository.

## Important architecture rule

Do not move CAR 3.1 rule logic into this folder. Keep the boundary:

```text
CAR 3.1 = detect + qualify + confirm + settle
Local AI = observe + analyze + PAPER/manual routing
XXX      = reserved external integration boundary
```

That keeps a Goaloo/parser/Engine change separate from a local-AI change and avoids formula drift.
