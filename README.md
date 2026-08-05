# Odyssea Seat Checker

Checks available seats for upcoming **Odyssea 70mm IMAX** screenings at **Cinema City Flora** (Prague) and prints them to the terminal.

## Requirements

- Node.js 18+
- Corporate proxy access (the script routes through `s163m02i:3128` by default)

## Setup

```
npm install
```

## Usage

```
node check-seats.js [--rows <rows>] [--seats <seats>]
```

### Show all screenings

```
node check-seats.js
```

### Filter by row range

```
node check-seats.js --rows 4-8
```

### Filter by specific rows

```
node check-seats.js --rows 5,6,7
```

### Filter by rows and seat numbers

```
node check-seats.js --rows 5,6,7 --seats 12,13,14,15,16
```

`--rows` and `--seats` are AND-ed: both conditions must match.  
Screenings with no matching free seats are hidden when a filter is active.

## Example output

```
Odyssea 70mm IMAX · Flora · next 30 days

2026-08-23 09:00  IMAX VOLVO    36 seats free
  row  1:  8  9  10  11  12  13  14  15  16  17  18  19  20  21  22  23
  row  2:  8  9  10  11  27  28  29  30
  row 12:  7  8  9  31  32  33
  ↳ https://tickets.cinemacity.cz/order/224519?lang=cs

2026-08-24 20:30  IMAX VOLVO    10 seats free
  row  1:  13
  row  2:  8  30
  row 12:  7  8  9  31  32  33
  ↳ https://tickets.cinemacity.cz/order/224526?lang=cs
```

## Proxy

The script uses `HTTPS_PROXY` / `HTTP_PROXY` env vars if set, otherwise falls back to `http://s163m02i:3128`. To override:

```
$env:HTTPS_PROXY="http://your-proxy:3128"; node check-seats.js
```

## Configuration

Edit the `CONFIG` block at the top of `check-seats.js`:

| Key | Default | Description |
|---|---|---|
| `CINEMA_ID` | `1052` | Flora |
| `FILM_CODE` | `7268s2r` | Odyssea distributor code |
| `ATTR_FILTER` | `70-mm` | Attribute to filter screenings |
| `DAYS_AHEAD` | `30` | How many days ahead to scan |
| `VENUE_ID` | `80` | IMAX VOLVO hall ID |
| `SEATPLAN_ID` | `1` | Seat plan ID for the hall |
