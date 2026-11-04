import { describe, it, expect } from 'vitest';
import { parseHealthPayload, parseNumber, parseDate, unionMinutes, sleepStage } from '../supabase/functions/_shared/health';

describe('parseNumber', () => {
  it('liest deutsche und englische Zahlen', () => {
    expect(parseNumber('82,4')).toBe(82.4);
    expect(parseNumber('82.4 kg')).toBe(82.4);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('12.345')).toBe(12345);
    expect(parseNumber('0,18')).toBe(0.18);
    expect(parseNumber('abc')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it('liest ISO mit Offset und behält den lokalen Tag', () => {
    const d = parseDate('2026-11-01T00:30:00+01:00')!;
    expect(d.day).toBe('2026-11-01');
    expect(new Date(d.ms).toISOString()).toBe('2026-10-31T23:30:00.000Z');
  });
  it('akzeptiert Offset ohne Doppelpunkt und fehlende Sekunden', () => {
    expect(parseDate('2026-11-01T07:12+0100')?.iso).toBe('2026-11-01T07:12:00+01:00');
  });
  it('liest das deutsche Format von Kurzbefehle in Berliner Zeit', () => {
    expect(parseDate('01.11.2026, 07:12')?.iso).toBe('2026-11-01T07:12:00+01:00'); // Winterzeit
    expect(parseDate('15.07.2026, 07:12:34')?.iso).toBe('2026-07-15T07:12:34+02:00'); // Sommerzeit
    expect(parseDate('01.11.26, 00:30')?.day).toBe('2026-11-01');
    expect(parseDate('1. Nov. 2026 um 07:12')?.iso).toBe('2026-11-01T07:12:00+01:00');
    expect(parseDate('3. November 2026 um 23:05')?.day).toBe('2026-11-03');
  });
  it('liest englische Formate mit AM/PM', () => {
    expect(parseDate('Nov 1, 2026 at 7:12 AM')?.iso).toBe('2026-11-01T07:12:00+01:00');
    expect(parseDate('11/1/26, 12:30 PM')?.iso).toBe('2026-11-01T12:30:00+01:00');
    expect(parseDate('11/1/26, 12:30 AM')?.iso).toBe('2026-11-01T00:30:00+01:00');
  });
  it('nimmt eine andere Zeitzone, wenn angegeben', () => {
    expect(parseDate('01.11.2026, 07:12', 'America/New_York')?.iso).toBe('2026-11-01T07:12:00-05:00'); // Sommerzeit dort seit 2 Uhr vorbei
  });
  it('lehnt Unsinn ab', () => {
    expect(parseDate('gestern')).toBeUndefined();
    expect(parseDate('32.13.2026, 07:12')).toBeUndefined();
  });
});

describe('Schlaf', () => {
  it('zählt überlappende Quellen nur einmal', () => {
    const h = 3600_000;
    expect(unionMinutes([[0, 2 * h], [h, 3 * h]])).toBe(180);
    expect(unionMinutes([[0, h], [2 * h, 3 * h]])).toBe(120);
  });
  it('erkennt deutsche und englische Phasen', () => {
    expect(sleepStage('Kern')).toBe('core');
    expect(sleepStage('Tief')).toBe('deep');
    expect(sleepStage('REM')).toBe('rem');
    expect(sleepStage('Wach')).toBe('awake');
    expect(sleepStage('Im Bett')).toBe('in_bed');
    expect(sleepStage('Asleep')).toBe('asleep');
  });
});

describe('parseHealthPayload', () => {
  it('bildet Tageswerte und eindeutige IDs', () => {
    const r = parseHealthPayload({
      metrics: {
        weight: {
          values: '82,4\n82,9\n82,1',
          dates: '2026-11-01T07:10:00+01:00\n2026-11-01T21:00:00+01:00\n2026-11-02T07:05:00+01:00',
        },
        body_fat: { values: ['0,18'], dates: ['2026-11-01T07:10:00+01:00'] },
        hrv: { values: '40\n60', dates: '2026-11-02T02:00:00+01:00\n2026-11-02T04:00:00+01:00' },
        sleep: {
          values: 'Kern\nTief\nREM\nWach\nKern',
          starts: [
            '2026-11-01T23:00:00+01:00',
            '2026-11-02T01:00:00+01:00',
            '2026-11-02T02:00:00+01:00',
            '2026-11-02T03:00:00+01:00',
            '2026-11-01T23:30:00+01:00', // zweite Quelle, überlappt
          ].join('\n'),
          ends: [
            '2026-11-02T01:00:00+01:00',
            '2026-11-02T02:00:00+01:00',
            '2026-11-02T03:00:00+01:00',
            '2026-11-02T03:10:00+01:00',
            '2026-11-02T00:30:00+01:00',
          ].join('\n'),
        },
      },
    });
    expect(r.warnings).toEqual([]);
    const byId = Object.fromEntries(r.rows.map((x) => [x.external_id, x]));
    expect(byId['weight:2026-11-01'].data.value).toBe(82.4); // erste Messung des Tages
    expect(byId['weight:2026-11-02'].data.value).toBe(82.1);
    expect(byId['body_fat:2026-11-01'].data.value).toBe(18);
    expect(byId['hrv:2026-11-02'].data.value).toBe(50);
    expect(byId['sleep:2026-11-02'].data.value).toBe(240); // 23:00 bis 03:00, Wachphase zählt nicht
    expect(byId['sleep:2026-11-02'].data.stages?.awake).toBe(10);
    expect(byId['sleep:2026-11-02'].occurred_at).toBe('2026-11-02T03:10:00+01:00');
  });

  it('meldet Fehler statt abzustürzen', () => {
    const r = parseHealthPayload({ metrics: { weight: { values: '82\n83', dates: '2026-11-01T07:00:00+01:00' }, quatsch: {} } });
    expect(r.rows).toEqual([]);
    expect(r.warnings.length).toBe(2);
    expect(parseHealthPayload({}).warnings[0]).toMatch(/metrics/);
  });

  it('verwirft unplausible Werte', () => {
    const r = parseHealthPayload({ metrics: { weight: { values: '8240', dates: '2026-11-01T07:00:00+01:00' } } });
    expect(r.rows).toEqual([]);
    expect(r.warnings[0]).toMatch(/plausibl/);
  });
});

describe('Schritte und Blutsauerstoff', () => {
  it('nimmt pro Tag die Quelle mit den meisten Schritten', () => {
    const r = parseHealthPayload({
      metrics: {
        steps: {
          values: '1.200\n3000\n1000\n2500\n500',
          dates: ['2026-11-01T08:00:00+01:00', '2026-11-01T12:00:00+01:00', '2026-11-01T08:05:00+01:00', '2026-11-01T12:10:00+01:00', '2026-11-02T09:00:00+01:00'].join('\n'),
          sources: 'Watch\nWatch\niPhone\niPhone\niPhone',
        },
      },
    });
    expect(r.warnings).toEqual([]);
    const byId = Object.fromEntries(r.rows.map((x) => [x.external_id, x]));
    expect(byId['steps:2026-11-01'].data.value).toBe(4200);
    expect(byId['steps:2026-11-02'].data.value).toBe(500);
  });
  it('warnt ohne Quellen und summiert alles', () => {
    const r = parseHealthPayload({ metrics: { steps: { values: '100\n200', dates: '2026-11-01T08:00:00+01:00\n2026-11-01T09:00:00+01:00' } } });
    expect(r.rows[0].data.value).toBe(300);
    expect(r.warnings[0]).toMatch(/Quellen/);
  });
  it('rechnet Blutsauerstoff in Prozent und mittelt', () => {
    const r = parseHealthPayload({ metrics: { spo2: { values: '0,97\n0,95', dates: '2026-11-02T02:00:00+01:00\n2026-11-02T04:00:00+01:00' } } });
    expect(r.rows[0].data).toEqual({ metric: 'spo2', value: 96, unit: '%' });
  });
});

describe('Aktivitätsringe', () => {
  it('aktive Kalorien und Trainingsminuten je größter Quelle', () => {
    const r = parseHealthPayload({
      metrics: {
        active_kcal: { values: '200\n150\n300', dates: '2026-11-01T08:00:00+01:00\n2026-11-01T12:00:00+01:00\n2026-11-01T09:00:00+01:00', sources: 'Watch\nWatch\niPhone' },
        exercise_min: { values: '30\n45', dates: '2026-11-01T18:00:00+01:00\n2026-11-02T18:00:00+01:00', sources: 'Watch\nWatch' },
      },
    });
    expect(r.warnings).toEqual([]);
    const byId = Object.fromEntries(r.rows.map((x) => [x.external_id, x.data]));
    expect(byId['active_kcal:2026-11-01']).toEqual({ metric: 'active_kcal', value: 350, unit: 'kcal' });
    expect(byId['exercise_min:2026-11-02']).toEqual({ metric: 'exercise_min', value: 45, unit: 'min' });
  });
});

describe('Cardio-Erholung', () => {
  it('letzter Wert des Tages in bpm', () => {
    const r = parseHealthPayload({ metrics: { hr_recovery: { values: '22\n27', dates: '2026-11-02T18:10:00+01:00\n2026-11-02T20:00:00+01:00' } } });
    expect(r.rows[0].data).toEqual({ metric: 'hr_recovery', value: 27, unit: 'bpm' });
  });
});

describe('weitere Kennzahlen aus dem Kurzbefehl', () => {
  it('Strecken, Schwimmzüge, Blutzucker in mmol, Atemfrequenz, magere Masse', () => {
    const r = parseHealthPayload({
      metrics: {
        distance_walk_run: { values: '1,2\n0,8\n2,5', dates: '03.11.2026, 08:00\n03.11.2026, 09:00\n03.11.2026, 09:00', sources: 'iPhone\niPhone\nApple Watch' },
        distance_cycling: { values: '4,35', dates: '03.11.2026, 08:00', sources: 'Apple Watch' },
        swim_strokes: { values: '120\n80', dates: '03.11.2026, 07:00\n03.11.2026, 07:10', sources: 'Apple Watch\nApple Watch' },
        glucose: { values: '5,5\n6,5', dates: '03.11.2026, 08:00\n03.11.2026, 12:00' },
        resp_rate: { values: '14\n16', dates: '03.11.2026, 03:00\n03.11.2026, 04:00' },
        lean_mass: { values: '66,2', dates: '03.11.2026, 07:00' },
      },
    });
    const v = (m: string) => r.rows.find((x) => x.metric === m)?.data.value;
    expect(v('distance_walk_run')).toBe(2.5);
    expect(v('distance_cycling')).toBe(4.35);
    expect(v('swim_strokes')).toBe(200);
    expect(v('glucose')).toBe(108);
    expect(v('resp_rate')).toBe(15);
    expect(v('lean_mass')).toBe(66.2);
    expect(r.warnings).toEqual([]);
  });
});

describe('Zahlen von Kurzbefehle', () => {
  it('Gewicht mit drei Nachkommastellen wird gespeichert', () => {
    const r = parseHealthPayload({ metrics: { weight: { values: '86.154', dates: '04.11.2026, 07:10' } } });
    expect(r.rows[0].data.value).toBe(86.2);
    expect(r.warnings).toEqual([]);
  });
  it('Punkt mit drei Nachkommastellen ist ein Dezimaltrenner', () => {
    expect(parseNumber('86.154', true)).toBe(86.154);
    expect(parseNumber('64.624', true)).toBe(64.624);
    expect(parseNumber('1.234.567', true)).toBe(1234567);
    expect(parseNumber('12.345')).toBe(12345); // Schritte
    expect(parseNumber('1.234,5')).toBe(1234.5);
  });
});
