import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse, aggregate, trend, bucket, activeAnomalies } from '../src/data.ts';
import { auditImagePaths } from '../src/audit-images.ts';
const read = (name: string) => parse(readFileSync(new URL('../public/data/' + name + '.csv', import.meta.url), 'utf8'));
const metrics = read('daily_metrics_60d_modified_v2'), devices = read('site_devices_modified'), audits = read('audit_contents_ready_for_images_reject_reason_fixed'), anomalies = read('anomalies_modified_with_details_severity_fixed');
test('four CSVs have valid joins and 60 complete daily groups', () => {
 assert.equal(new Set(metrics.map(r => r.date)).size, 60);
 assert.equal(metrics.length, 60 * new Set(metrics.map(r => r.site_code)).size);
 const sites = new Set(devices.map(r => r.site_code));
 const siteNames = new Set(devices.map(r => r.site_name));
 for (const row of [...metrics, ...anomalies]) assert.ok(sites.has(row.site_code));
 for (const row of audits) assert.ok(siteNames.has(row.site_name));
});
test('weekly/monthly aggregation preserves totals and uses weighted ratios', () => {
 const total = aggregate(metrics);
 for (const grain of ['week','month'] as const) {
  const grouped = trend(metrics, grain);
  assert.equal(grouped.reduce((n,r) => n+r.visitors,0), total.visitors);
  for (const point of grouped) {
   const rows = metrics.filter(r => bucket(r.date, grain) === point.date);
   const sum = (key: string) => rows.reduce((n,r) => n+Number(r[key]),0);
   assert.equal(point.participation, sum('participants_uv')/sum('visitors_uv'));
   assert.equal(point.share, sum('share_users_uv')/sum('successful_generation_users_uv'));
   assert.equal(point.success, sum('successful_generation_requests')/sum('generation_requests'));
   assert.equal(point.duration, rows.reduce((n,r) => n+Number(r.avg_generation_seconds)*Number(r.generation_requests),0)/sum('generation_requests'));
  }
 }
 assert.equal(bucket('2026-10-04','week'),'2026-09-28');
 assert.equal(bucket('2026-10-05','week'),'2026-10-05');
});
test('current snapshot counts and site/date filtering remain consistent', () => {
 const active = activeAnomalies(anomalies);
 assert.ok(active.every(r => ['待处理','处理中'].includes(r.status)));
 const sites = [...new Set(devices.map(r => r.site_code))];
 assert.equal(sites.reduce((n,s) => n+active.filter(r => r.site_code === s).length,0),active.length);
 const selected = metrics.filter(r => r.site_code === sites[0] && r.date >= '2026-10-01');
 assert.equal(selected.length,8);
 assert.ok(aggregate(selected).visitors < aggregate(metrics).visitors);
 console.log(JSON.stringify({pending:audits.filter(r=>r.review_status==='待审核').length,online:devices.filter(r=>r.is_online==='1').length,devices:devices.length,activeAnomalies:active.length}));
});
test('audit CSV records map one-to-one to deployed audit images', () => {
 assert.equal(audits.length, 20);
 assert.deepEqual(new Set(audits.map(row => row.image_id)).size, audits.length);
 for (const row of audits) {
  const imagePath = auditImagePaths[row.image_id];
  assert.ok(imagePath, `missing image mapping for ${row.image_id}`);
  assert.ok(existsSync(new URL('../public' + imagePath, import.meta.url)), `missing deployed image ${imagePath}`);
 }
 assert.equal(Object.keys(auditImagePaths).length, audits.length);
});
