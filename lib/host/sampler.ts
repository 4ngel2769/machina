/**
 * Host interface counters.
 *
 * Counters live in /sys/class/net/<iface>/statistics as monotonic totals, so a
 * rate needs two reads. Sampling lives in the process (a 5s timer, 120 points =
 * 10 minutes) rather than in SQLite: this is a UI history for one admin, and a
 * row per interface per 5s forever is a lot of churn for a sparkline. A restart
 * loses the series, which is honest — the first poll after boot has no rate yet.
 */

import fs from 'fs';
import path from 'path';

export type IfaceSample = { t: number; rx: number; tx: number };
export type IfaceTraffic = { rxBps: number; txBps: number; series: { t: number; rx: number; tx: number }[] };

const MAX = 120;
const INTERVAL_MS = 5_000;
const hist = new Map<string, IfaceSample[]>();
let timer: ReturnType<typeof setInterval> | null = null;

function readCounters(): Record<string, { rx: number; tx: number }> {
  const out: Record<string, { rx: number; tx: number }> = {};
  let names: string[] = [];
  try {
    names = fs.readdirSync('/sys/class/net');
  } catch {
    return out;
  }
  for (const ifaceName of names) {
    try {
      out[ifaceName] = {
        rx: Number(fs.readFileSync(path.join('/sys/class/net', ifaceName, 'statistics/rx_bytes'), 'utf8')) || 0,
        tx: Number(fs.readFileSync(path.join('/sys/class/net', ifaceName, 'statistics/tx_bytes'), 'utf8')) || 0,
      };
    } catch { /* interface vanished mid-read */ }
  }
  return out;
}

function sampleOnce(): void {
  const sampledAt = Date.now();
  for (const [ifaceName, counters] of Object.entries(readCounters())) {
    const series = hist.get(ifaceName) ?? [];
    series.push({ t: sampledAt, rx: counters.rx, tx: counters.tx });
    if (series.length > MAX) series.splice(0, series.length - MAX);
    hist.set(ifaceName, series);
  }
}

export function startHostSampler(): void {
  if (timer) return;
  sampleOnce();
  timer = setInterval(sampleOnce, INTERVAL_MS);
  console.log('[host] interface sampler 5s');
}

export function stopHostSampler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** Rates are computed from the last two samples of THIS process, never from
 *  wall-clock assumptions about the timer, so a stalled event loop shows a
 *  lower rate instead of a fake spike. */
export function ifaceTraffic(): Record<string, IfaceTraffic> {
  const out: Record<string, IfaceTraffic> = {};
  for (const [ifaceName, samples] of hist) {
    const last = samples[samples.length - 1];
    const prev = samples[samples.length - 2];
    const dt = last && prev ? (last.t - prev.t) / 1000 : 0;
    out[ifaceName] = {
      rxBps: dt > 0 ? Math.max(0, (last.rx - prev.rx) / dt) : 0,
      txBps: dt > 0 ? Math.max(0, (last.tx - prev.tx) / dt) : 0,
      series: samples.slice(-60).map((sample) => ({ t: sample.t, rx: sample.rx, tx: sample.tx })),
    };
  }
  return out;
}
