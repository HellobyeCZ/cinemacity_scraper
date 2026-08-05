# Biweekly Presenter Tracker — Design Spec

**Date:** 2026-07-23
**Status:** Approved

---

## Overview

An n8n workflow that fires every other Thursday at 8:30 AM, determines the next presenter from each of two subteams using a fixed rotation, posts a single message to a MS Teams group chat announcing both presenters, and logs the event to an Excel workbook in OneDrive.

---

## Excel Workbook

**File:** `presenter-tracker.xlsx` (stored in OneDrive)

### Sheet: `Roster_TeamA`

| Column | Type | Notes |
|--------|------|-------|
| `Order` | Number | 1-based rotation sequence |
| `Name` | String | Display name |
| `Email` | String | For future OoO/mention use |

### Sheet: `Roster_TeamB`

Same columns as `Roster_TeamA`.

### Sheet: `History`

| Column | Type | Notes |
|--------|------|-------|
| `Date` | Date string (YYYY-MM-DD) | Meeting date |
| `PresenterA` | String | Name of Team A presenter |
| `PresenterB` | String | Name of Team B presenter |
| `Notes` | String | Optional — manual notes, skips, etc. |

The `History` sheet is the source of truth for rotation state. The workflow reads the last row to determine who presented last, then advances to the next person in each roster.

---

## Rotation Logic

For each subteam independently:

1. Read the full roster (sorted by `Order` ascending).
2. Read the last row of `History` to find the previous presenter's name.
3. Find that name's `Order` in the roster.
4. Next presenter = `Order + 1`; if at end of list, wrap to `Order = 1` (circular rotation).
5. If `History` is empty (first run), start at `Order = 1` for both subteams.

---

## n8n Workflow

### Trigger

- **Type:** Cron
- **Schedule:** Every other Thursday at 08:30 (local timezone)
- n8n does not natively support "every other week" — implement via a Code node that checks if the current week number is odd or even, and exits early if it's the off week.

### Nodes

```
[Cron Trigger]
     |
[Code: Week parity check] — exit if off-week
     |
[OneDrive: Read Roster_TeamA]
     |
[OneDrive: Read Roster_TeamB]
     |
[OneDrive: Read History]
     |
[Code: Calculate next presenters]
     |
[MS Teams: Post message to group chat]
     |
[OneDrive: Append row to History]
```

### Teams Message Format

```
📅 Office Meeting — Thursday [DATE]

This week's presenters:
• [PresenterA] (Team A)
• [PresenterB] (Team B)
```

---

## Authentication Requirements

| Service | Auth Method |
|---------|-------------|
| OneDrive / Excel | n8n Microsoft credential (OAuth2 — Microsoft account or Azure AD app) |
| MS Teams | Same Microsoft credential (requires `ChannelMessage.Send` permission scope) |

Both services share the same credential in n8n under **Credentials → Microsoft**.

---

## Edge Cases & Manual Overrides

- **First run:** History sheet is empty → both rosters start at `Order = 1`.
- **Manual skip:** Add a row to `History` manually with the skipped person's name and a note — the workflow will advance past them on the next run.
- **Roster change:** Add/remove/reorder rows in `Roster_TeamA` or `Roster_TeamB` directly; the workflow re-reads on every run.

---

## Out of Scope (v1)

- OoO/calendar checking
- Thumbs up/down reaction handling
- Volunteer fallback flow
- Notifications to organizer on skip
