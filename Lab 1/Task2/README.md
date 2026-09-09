# Task2 — NJU smail mail assistant

## 0. Model & token usage

| Stage | Model | Tokens (measured) | Cost |
|---|---|---|---|
| Plan, implementation & review (this Claude Code session) | Claude Fable 5 | ~312M total — ~1.16M output, ~3.0M new input, ~307.7M cache reads (861 assistant turns) | — |
| Automated draft generation (headless, cumulative so far) | Claude Sonnet 5 | ~10.6K in / 68 out | ~$0.46 |

- **Claude Fable 5**: planning, full implementation, code review, security review and on-device verification were all done in this chat session — where almost all tokens were spent. Figures are measured from the session transcript; the total is dominated by cache reads (context re-read every turn across an agentic session), while the actual new work is ~1.16M output + ~3.0M new input.
- **Claude Sonnet 5**: called only to generate reply drafts, via an isolated `claude -p`. It grows a little per processed mail; each call is logged to `state/usage.jsonl` and summed by `npm run mail:db status`.

---

## 1. Overview

- A personal assistant that fetches NJU smail every hour and, **for mail sent by a human, auto-writes an English reply draft** in advance. Drafts cite the personal database (Task1 ehall data) as evidence, and **nothing is sent unless I review and approve it myself** (no auto-send). Drafts can be edited and sent from a desktop file or from the iPhone Mail Drafts mailbox.
