# Task1 — NJU ehall Personal Data Collector + Local Viewer

## 0. Model & token usage

| Stage | Model | Tokens (approx.) | Cost |
|---|---|---|---|
| Prompt writing & plan design | GPT-6 Astra Medium | ~1.2M | Free (within quota) |
| Implementation | DeepSeek-V4-Flash (high reasoning) | ~7.8M | ≈ ¥12 (CNY) |

- **GPT-6 Astra Medium** was used for drafting prompts and designing the plans (`plan.md`, `plan-web.md`) — about **1.2M tokens, free within quota**.
- **DeepSeek-V4-Flash (high)** was used for implementation — about **7.8M tokens, ≈ ¥12 CNY**.

---

A personal, Mac-only assistant for NJU ehall academic data. Two parts:

## 1. Data collection (scheduled)
- Authenticates to ehall (NJU CAS + slider captcha once, credentials in **macOS Keychain**).
- Collects the **current-term profile, courses and weekly timetable** on a schedule (launchd, daily 08:00 / 20:00, local time).
- Stores raw data in **private snapshots** outside Git: `~/Library/Application Support/NJUEhall/` (0700 / 0600).
- Publishes **masked** summaries (name `朴**`, student id `2152*****`, no precise rooms) to `public-data/` in this repository — never raw data.

## 2. Web visualization (read-only)
- `npm run web` → open `http://127.0.0.1:4317` and enter the one-time access key shown in the terminal.
- Views: **Overview · Profile · Courses · Schedule (weekly grid / day list / week filter) · Search**, with per-record source references.
- **LOCAL TRUSTED / READ ONLY**: opening or searching only reads saved snapshots — it never runs sync, Git or launchd.
- UI languages: 한국어 / 中文 / English (toggle next to the theme control). Light / Dark / System themes.
- No data fabrication: times, term-start dates, make-up/cancelled classes are not collected yet and are shown as *not collected*.

## Quick start
```bash
cd "…/Lab 1/Task1"
npm install
npm run cred:setup   # once: save ehall id/password to Keychain (hidden prompt)
npm run auth:login   # once: browser login + slider captcha
npm run sync         # collect → private snapshot (only when changed)
npm run web          # local dashboard at http://127.0.0.1:4317
```

See **[USAGE.md](./USAGE.md)** (Korean) for the full essential guide, and `plan.md` / `plan-web.md` for design and security boundaries.
