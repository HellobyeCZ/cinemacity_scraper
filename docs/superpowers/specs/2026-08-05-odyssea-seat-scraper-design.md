# Odyssea Seat Scraper — Design

## Goal

A single Node.js script (`check-seats.js`) that checks seat availability for all upcoming Odyssea 70mm IMAX screenings at Cinema City Flora and prints results to stdout. Run manually on demand.

## APIs

### Showtimes
```
GET https://www.cinemacity.cz/cz/data-api-service/v1/quickbook/10101/film-events/in-cinema/{cinemaId}/at-date/{date}?attr=&lang=cs_CZ
```
Returns `{ body: { events: [...], films: [...] } }`. Each event has `id` (presentationId), `eventDateTime`, `attributeIds`, `soldOut`, `availabilityRatio`, `auditorium`.

Filter: keep events where `attributeIds` includes `"70-mm"`.

### Seat Status
```
GET https://tickets.cinemacity.cz/api/seats/seats-statusV2?presentationId={id}&venueTypeId=1&isReserved=1
Headers: uuid: <fixed-random-uuid>
```
Returns `{ seats: { "tg_x_y": 0, ... } }` — only available seats. Each key encodes `ticketGroup_x_gridY`.

## Architecture

Single file, three sequential steps:

1. **Discover** — loop `today` through `today + DAYS_AHEAD`, fetch showtimes per date, filter 70mm, collect unique presentations.
2. **Check** — for each presentation, fetch seat status, count available seats, parse row/seat from key.
3. **Print** — one line per screening:
   ```
   2026-08-24 20:30  IMAX VOLVO   7 free  [R1:S7, R12:V1 V2 V3 V4 V5 V6]
   2026-08-25 09:00  IMAX VOLVO   0 free
   ```

## Config (top of file)

| Constant | Default | Notes |
|---|---|---|
| `CINEMA_ID` | `"1052"` | Flora |
| `FILM_CODE` | `"7268s2r"` | Odyssea distributor code |
| `ATTR_FILTER` | `"70-mm"` | IMAX 70mm attribute |
| `DAYS_AHEAD` | `30` | How many days to scan |
| `UUID` | generated once | Fixed random UUID for seat API header |

## Error handling

- Non-200 from showtimes API for a date: print warning, skip date.
- Non-200 from seat status API for a presentation: print warning, skip that screening.
- No crash on partial failure — always print results for successful responses.

## Dependencies

None. Uses built-in `fetch` (Node 18+) only.

## Run

```
node check-seats.js
```
