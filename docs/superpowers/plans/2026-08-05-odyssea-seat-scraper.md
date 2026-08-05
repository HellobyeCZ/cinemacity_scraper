# Odyssea Seat Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `check-seats.js` — a zero-dependency Node.js script that prints available seats for all upcoming Odyssea 70mm IMAX screenings at Cinema City Flora.

**Architecture:** Single file. Step 1 fetches showtimes for each date from today through today+30 days, filtering to 70mm events. Step 2 fetches seat-status for each presentation ID. Step 3 prints a formatted summary line per screening.

**Tech Stack:** Node.js 18+ (built-in `fetch` only), no npm install required.

## Global Constraints

- No external dependencies — built-in `fetch` only (Node 18+)
- Single file: `check-seats.js` in project root
- Run with: `node check-seats.js`
- Config constants at top of file (not hardcoded in logic)
- Partial failures print a warning and continue — script never throws

---

### Task 1: Scaffold file with config and date utilities

**Files:**
- Create: `check-seats.js`

**Interfaces:**
- Produces:
  - `CONFIG` object with keys `CINEMA_ID`, `FILM_CODE`, `ATTR_FILTER`, `DAYS_AHEAD`, `UUID`
  - `dateRange(start, days)` → `string[]` array of `"YYYY-MM-DD"` strings

- [ ] **Step 1: Create `check-seats.js` with config block and dateRange function**

```js
// check-seats.js
import { randomUUID } from 'crypto';

const CONFIG = {
  CINEMA_ID: '1052',
  FILM_CODE: '7268s2r',
  ATTR_FILTER: '70-mm',
  DAYS_AHEAD: 30,
  UUID: randomUUID(),
};

function dateRange(start, days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
```

- [ ] **Step 2: Verify date range works**

Run:
```
node -e "
import('./check-seats.js').then(() => {});
" 
```
Actually test by temporarily adding at the bottom of the file:
```js
console.log(dateRange(new Date(), 3));
```
Expected output: `[ '2026-08-05', '2026-08-06', '2026-08-07' ]` (today + 2 more dates)

Remove the temporary console.log after verifying.

- [ ] **Step 3: Commit**

```bash
git add check-seats.js
git commit -m "feat: scaffold check-seats.js with config and dateRange"
```

---

### Task 2: Fetch 70mm screenings from Showtimes API

**Files:**
- Modify: `check-seats.js`

**Interfaces:**
- Consumes: `CONFIG.CINEMA_ID`, `CONFIG.ATTR_FILTER`, `CONFIG.DAYS_AHEAD`, `CONFIG.FILM_CODE`, `dateRange()`
- Produces: `fetchScreenings()` → `Promise<Array<{presentationId: string, dateTime: string, auditorium: string}>>`

- [ ] **Step 1: Add `fetchScreenings` function**

```js
async function fetchScreenings() {
  const today = new Date();
  const dates = dateRange(today, CONFIG.DAYS_AHEAD);
  const screenings = [];

  for (const date of dates) {
    const url = `https://www.cinemacity.cz/cz/data-api-service/v1/quickbook/10101/film-events/in-cinema/${CONFIG.CINEMA_ID}/at-date/${date}?attr=&lang=cs_CZ`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[WARN] Showtimes API ${res.status} for ${date}`);
        continue;
      }
      data = await res.json();
    } catch (e) {
      console.warn(`[WARN] Showtimes fetch failed for ${date}: ${e.message}`);
      continue;
    }

    const events = data?.body?.events ?? [];
    for (const ev of events) {
      if (!ev.attributeIds.includes(CONFIG.ATTR_FILTER)) continue;
      screenings.push({
        presentationId: ev.id,
        dateTime: ev.eventDateTime,
        auditorium: ev.auditorium ?? '',
      });
    }
  }

  // Deduplicate by presentationId (same event can appear on multiple date pages)
  const seen = new Set();
  return screenings.filter(s => {
    if (seen.has(s.presentationId)) return false;
    seen.add(s.presentationId);
    return true;
  });
}
```

- [ ] **Step 2: Add temporary main call to verify**

Append temporarily:
```js
fetchScreenings().then(s => console.log(JSON.stringify(s, null, 2)));
```

Run:
```
node check-seats.js
```
Expected: JSON array with objects like `{ presentationId: "224523", dateTime: "2026-08-24T09:00:00", auditorium: "IMAX VOLVO" }`. If Odyssea has no upcoming 70mm screenings, you'll see `[]` — that's correct behavior.

Remove the temporary call after verifying.

- [ ] **Step 3: Commit**

```bash
git add check-seats.js
git commit -m "feat: fetch and filter 70mm Odyssea screenings"
```

---

### Task 3: Fetch seat availability per screening

**Files:**
- Modify: `check-seats.js`

**Interfaces:**
- Consumes: `CONFIG.UUID`, `presentationId: string`
- Produces: `fetchAvailableSeats(presentationId)` → `Promise<Array<{row: string, seat: string}>>`

The seat status API returns keys like `"1_24_1"` meaning `ticketGroup=1, x=24, gridY=1`. The `x` value maps to the seat number column and `gridY` to the row number. Since the site's `aria-description` format is `"Řada: {r} sedadlo: {n}"` and from our exploration the available seat `R1:S7` had `x=24, y=1` — the raw grid coords are sufficient to identify seats uniquely for display. We'll display them as `x={x},y={gridY}` unless we can correlate back to row/seat labels (which requires loading the full seat plan). For the purposes of this one-shot check, count + grid coords is enough; if you want human-readable row/seat labels, see note below.

> **Note on row/seat labels:** The mapping from `(x, gridY)` to `(row, seatNumber)` lives in the full seatplan API (`POST /api/seats/seatplanV2?venueId=80&seatplanId=1`). Task 4 optionally adds this enrichment. For now, display grid coords.

- [ ] **Step 1: Add `fetchAvailableSeats` function**

```js
async function fetchAvailableSeats(presentationId) {
  const url = `https://tickets.cinemacity.cz/api/seats/seats-statusV2?presentationId=${presentationId}&venueTypeId=1&isReserved=1`;
  let data;
  try {
    const res = await fetch(url, {
      headers: { uuid: CONFIG.UUID, accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[WARN] Seat status API ${res.status} for presentation ${presentationId}`);
      return null;
    }
    data = await res.json();
  } catch (e) {
    console.warn(`[WARN] Seat status fetch failed for ${presentationId}: ${e.message}`);
    return null;
  }

  const seats = data?.seats ?? {};
  return Object.keys(seats).map(key => {
    const [tg, x, gridY] = key.split('_');
    return { tg, x, gridY };
  });
}
```

- [ ] **Step 2: Test manually with the known presentation ID**

Append temporarily:
```js
fetchAvailableSeats('224526').then(s => console.log(s));
```

Run:
```
node check-seats.js
```
Expected: array like `[ { tg: '1', x: '24', gridY: '1' }, { tg: '1', x: '7', gridY: '12' }, ... ]` (7 entries for the Flora IMAX screening we explored).

Remove the temporary call after verifying.

- [ ] **Step 3: Commit**

```bash
git add check-seats.js
git commit -m "feat: fetch available seats from seat-status API"
```

---

### Task 4: Wire together and print formatted output

**Files:**
- Modify: `check-seats.js`

**Interfaces:**
- Consumes: `fetchScreenings()`, `fetchAvailableSeats(presentationId)`
- Produces: formatted stdout output, `main()` entry point

- [ ] **Step 1: Add `formatDateTime` helper**

```js
function formatDateTime(isoString) {
  // "2026-08-24T20:30:00" → "2026-08-24 20:30"
  return isoString.replace('T', ' ').slice(0, 16);
}
```

- [ ] **Step 2: Add `main` function and call it**

```js
async function main() {
  console.log(`Checking Odyssea 70mm IMAX screenings at Flora (next ${CONFIG.DAYS_AHEAD} days)...\n`);

  const screenings = await fetchScreenings();

  if (screenings.length === 0) {
    console.log('No upcoming 70mm screenings found.');
    return;
  }

  for (const s of screenings) {
    const seats = await fetchAvailableSeats(s.presentationId);
    const dt = formatDateTime(s.dateTime);
    const venue = s.auditorium.padEnd(12);

    if (seats === null) {
      console.log(`${dt}  ${venue}  [error fetching seats]`);
      continue;
    }

    if (seats.length === 0) {
      console.log(`${dt}  ${venue}  0 free`);
      continue;
    }

    const seatList = seats.map(s => `x${s.x}y${s.gridY}`).join(' ');
    console.log(`${dt}  ${venue}  ${seats.length} free  [${seatList}]`);
  }
}

main();
```

- [ ] **Step 3: Run the full script end to end**

```
node check-seats.js
```

Expected output format:
```
Checking Odyssea 70mm IMAX screenings at Flora (next 30 days)...

2026-08-24 09:00  IMAX VOLVO    0 free
2026-08-24 20:30  IMAX VOLVO    7 free  [x24y1 x7y12 x8y12 x9y12 x31y12 x32y12 x33y12]
```

If you see `[WARN]` lines: check your internet connection and that the Cinema City APIs are reachable. The script will still print results for any screenings that succeeded.

- [ ] **Step 4: Commit**

```bash
git add check-seats.js
git commit -m "feat: wire main loop and print seat availability per screening"
```

---

### Task 5: Enrich seat display with human-readable row/seat labels (optional)

Skip this task if the grid-coord output from Task 4 is sufficient. Do this task if you want output like `R1:S7` instead of `x24y1`.

**Files:**
- Modify: `check-seats.js`

**Interfaces:**
- Consumes: `venueId: number` (80 for Flora IMAX), `seatplanId: number` (1)
- Produces: `buildSeatMap(venueId, seatplanId)` → `Promise<Map<string, {row: string, seat: string}>>` keyed by `"x_gridY"`

- [ ] **Step 1: Add `buildSeatMap` function**

```js
async function buildSeatMap(venueId, seatplanId) {
  const url = `https://tickets.cinemacity.cz/api/seats/seatplanV2?venueId=${venueId}&seatplanId=${seatplanId}`;
  let data;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { uuid: CONFIG.UUID, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return new Map();
    data = await res.json();
  } catch {
    return new Map();
  }

  const map = new Map();
  const seats = data?.seats ?? [];
  for (const s of seats) {
    // s.x and s.y are grid coords; s.r is row label, s.n is seat label
    map.set(`${s.x}_${s.y}`, { row: String(s.r), seat: String(s.n) });
  }
  return map;
}
```

- [ ] **Step 2: Update `main` to load the seat map and enrich output**

Replace the seat display block inside `main`'s for-loop:

```js
  // At top of main, before the screenings loop — load once:
  const seatMap = await buildSeatMap(80, 1);

  // Inside the loop, replace the seatList line:
  const seatList = seats.map(({ x, gridY }) => {
    const label = seatMap.get(`${x}_${gridY}`);
    return label ? `R${label.row}:S${label.seat}` : `x${x}y${gridY}`;
  }).join(' ');
```

- [ ] **Step 3: Run and verify**

```
node check-seats.js
```

Expected output now shows human-readable labels:
```
2026-08-24 20:30  IMAX VOLVO    7 free  [R1:S7 R12:V1 R12:V2 R12:V3 R12:V4 R12:V5 R12:V6]
```

- [ ] **Step 4: Commit**

```bash
git add check-seats.js
git commit -m "feat: enrich seat display with human-readable row/seat labels"
```
