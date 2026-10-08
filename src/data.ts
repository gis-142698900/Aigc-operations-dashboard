import Papa from 'papaparse';
export type Row = Record<string, string>;
export type Grain = 'day' | 'week' | 'month';
export type Stats = ReturnType<typeof aggregate>;
export const parse = (raw: string): Row[] => Papa.parse<Row>(raw, { header: true, skipEmptyLines: true }).data;
export function aggregate(rows: Row[]) {
  const sum = (key: string) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
  const visitors = sum('visitors_uv'), participants = sum('participants_uv'), shares = sum('share_users_uv'), requests = sum('generation_requests');
  const ratio = (a: number, b: number) => b ? a / b : 0;
  return { visitors, participants, shares, participation: ratio(participants, visitors), share: ratio(shares, sum('successful_generation_users_uv')), success: ratio(sum('successful_generation_requests'), requests), duration: ratio(rows.reduce((n, r) => n + Number(r.avg_generation_seconds) * Number(r.generation_requests), 0), requests) };
}
export const shiftDate = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function bucket(date: string, grain: Grain) {
  if (grain === 'month') return date.slice(0, 7);
  if (grain === 'week') return shiftDate(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
  return date;
}
export function trend(rows: Row[], grain: Grain) {
  const groups = new Map<string, Row[]>();
  rows.forEach(r => { const key = bucket(r.date, grain); groups.set(key, [...(groups.get(key) || []), r]); });
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...aggregate(values) }));
}
export const activeAnomalies = (rows: Row[]) => rows.filter(r => ['待处理', '处理中'].includes(r.status));
export function download(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(new Blob(['\ufeff' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
