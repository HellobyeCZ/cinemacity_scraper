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

