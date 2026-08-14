import { randomUUID } from 'crypto';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const CONFIG = {
  CINEMA_ID: '1052',
  FILM_CODE: '7268s2r',
  ATTR_FILTER: '70-mm',
  DAYS_AHEAD: 30,
  VENUE_ID: 80,
  SEATPLAN_ID: 1,
  UUID: randomUUID(),
};

// ── CLI args ──────────────────────────────────────────────────────────────────
// --rows 4,5,6   or  --rows 4-8   (comma list or inclusive range)
// --seats 10,11,12               (seat numbers; AND-ed with --rows if both given)
function parseArgs() {
  const args = process.argv.slice(2);
  const get = flag => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const parseList = val => {
    if (!val) return null;
    if (val.includes('-') && !val.includes(',')) {
      const [a, b] = val.split('-').map(Number);
      return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    }
    return val.split(',').map(s => s.trim());
  };

  return {
    rows:  parseList(get('--rows')),
    seats: parseList(get('--seats')),
  };
}

const FILTER = parseArgs();

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
};
const link = (text, url) => `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
const bookingUrl = id => `https://tickets.cinemacity.cz/order/${id}?lang=cs`;

function dateRange(start, days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function fetchScreenings() {
  const today = new Date();
  const dates = dateRange(today, CONFIG.DAYS_AHEAD);
  const screenings = [];

  for (const date of dates) {
    const url = `https://www.cinemacity.cz/cz/data-api-service/v1/quickbook/10101/film-events/in-cinema/${CONFIG.CINEMA_ID}/at-date/${date}?attr=&lang=cs_CZ&movieCode=${CONFIG.FILM_CODE}`;
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
    const [, x, gridY] = key.split('_');
    return { x, gridY };
  });
}

function formatDateTime(isoString) {
  // "2026-08-24T20:30:00" → "2026-08-24 20:30"
  return isoString.replace('T', ' ').slice(0, 16);
}

async function buildSeatMap(presentationId) {
  const url = `https://tickets.cinemacity.cz/api/presentations/${presentationId}?referralMiniSiteId=0`;
  try {
    const res = await fetch(url, {
      headers: { uuid: CONFIG.UUID, accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[WARN] Presentation API ${res.status} — seat labels unavailable`);
      return new Map();
    }
    const data = await res.json();
    const map = new Map();
    for (const s of data?.presentation?.seats ?? []) {
      map.set(`${s.x}_${s.y}`, { row: String(s.r), seat: String(s.n) });
    }
    return map;
  } catch (e) {
    console.warn(`[WARN] Seat label fetch failed: ${e.message}`);
    return new Map();
  }
}

async function main() {
  const filterDesc = [
    FILTER.rows  ? `rows ${FILTER.rows.join(',')}` : null,
    FILTER.seats ? `seats ${FILTER.seats.join(',')}` : null,
  ].filter(Boolean).join(' + ');

  const header = `Odyssea 70mm IMAX · Flora · next ${CONFIG.DAYS_AHEAD} days`
    + (filterDesc ? `  ${c.dim}[filter: ${filterDesc}]${c.reset}` : '');
  console.log(`\n${c.bold}${c.cyan}${header}${c.reset}`);
  console.log(c.dim + '─'.repeat(60) + c.reset + '\n');

  const screenings = await fetchScreenings();

  if (screenings.length === 0) {
    console.log(`${c.dim}No upcoming 70mm screenings found.${c.reset}`);
    return;
  }

  // Use the first screening's id to build the seat map (layout is the same for all)
  const seatMap = await buildSeatMap(screenings[0].presentationId);
  let anyPrinted = false;

  for (const s of screenings) {
    const seats = await fetchAvailableSeats(s.presentationId);
    const dt = formatDateTime(s.dateTime);
    const url = bookingUrl(s.presentationId);

    if (seats === null) {
      console.log(`${c.dim}${dt}${c.reset}  ${c.red}[error fetching seats]${c.reset}`);
      anyPrinted = true;
      continue;
    }

    // Resolve grid coords → row/seat labels (fallback to raw coords if map empty)
    const resolved = seats.map(({ x, gridY }) => {
      const label = seatMap.get(`${x}_${gridY}`);
      return label ?? { row: gridY, seat: `c${x}` };
    });

    // Apply filter if active
    const filtered = (FILTER.rows || FILTER.seats)
      ? resolved.filter(({ row, seat }) => {
          const rowOk  = !FILTER.rows  || FILTER.rows.includes(String(row));
          const seatOk = !FILTER.seats || FILTER.seats.includes(String(seat));
          return rowOk && seatOk;
        })
      : resolved;

    // With a filter active, skip screenings with nothing matching
    if ((FILTER.rows || FILTER.seats) && filtered.length === 0) continue;

    anyPrinted = true;
    const dateStr = dt.slice(0, 10);
    const timeStr = dt.slice(11);
    const venue   = (s.auditorium || '').padEnd(12);

    if (filtered.length === 0) {
      console.log(`${c.dim}${dateStr} ${timeStr}  ${venue}  sold out${c.reset}`);
      continue;
    }

    // Group seats by row, sort numerically within each row
    const byRow = {};
    for (const { row, seat } of filtered) {
      (byRow[row] ??= []).push(seat);
    }
    const rowEntries = Object.entries(byRow)
      .sort(([a], [b]) => Number(a) - Number(b));

    const countStr = `${c.bold}${c.green}${filtered.length} seat${filtered.length !== 1 ? 's' : ''} free${c.reset}`;
    const linkLabel = link(`${c.bold}${dateStr} ${timeStr}${c.reset}`, url);
    console.log(`${linkLabel}  ${c.dim}${venue}${c.reset}  ${countStr}`);
    for (const [row, seatNums] of rowEntries) {
      const sorted = seatNums.slice().sort((a, b) => Number(a) - Number(b));
      console.log(`  ${c.dim}row ${String(row).padStart(2)}:${c.reset}  ${c.green}${sorted.join('  ')}${c.reset}`);
    }
    console.log(`  ${c.dim}↳ ${url}${c.reset}`);
    console.log();
  }

  if (!anyPrinted) {
    console.log(`${c.dim}No screenings match the current filter.${c.reset}`);
  }
  console.log();
}

main();

