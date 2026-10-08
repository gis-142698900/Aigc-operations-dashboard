import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);
import { Activity, BarChart3, TriangleAlert, ClipboardCheck, Monitor, ChevronRight, MoreHorizontal, ArrowUpRight, ArrowDownRight, Download, X, Sparkles, SlidersHorizontal, Users, TrendingUp, Share2, CircleCheck, Clock } from 'lucide-react';
import { parse, aggregate, trend, shiftDate, activeAnomalies, download, type Grain, type Row, type Stats } from './data';
import { auditImagePaths, auditPhotoFiles } from './audit-images';

let metrics: Row[] = [];
let devices: Row[] = [];
let anomalies: Row[] = [];
let audits: Row[] = [];
let deviceMetrics: Row[] = [];
let dates: string[] = [];
let minDate = '';
let maxDate = '';
let sites: [string, string][] = [];
let heartbeatTimestamp = 0;

const loadCsv = async (path: string) => {
 const response = await fetch(path);
 if (!response.ok) throw new Error(`无法加载数据文件：${path}`);
 return parse(await response.text());
};

async function loadDashboardData() {
 [metrics, devices, anomalies, deviceMetrics, audits] = await Promise.all([
  loadCsv('/data/daily_metrics_60d_modified_v2.csv'),
  loadCsv('/data/site_devices_modified.csv'),
  loadCsv('/data/anomalies_modified_with_details_severity_fixed.csv'),
  loadCsv('/data/device_daily_metrics_60d.csv'),
  loadCsv('/data/audit_contents_ready_for_images_reject_reason_fixed.csv'),
 ]);
 dates = [...new Set(metrics.map(row => row.date))].sort();
 minDate = dates[0] ?? '';
 maxDate = dates.at(-1) ?? '';
 sites = [...new Map(devices.map(row => [row.site_code, row.site_name])).entries()];
 heartbeatTimestamp = Math.max(...devices.map(row => Date.parse(row.last_heartbeat.replace(' ', 'T'))));
 if (import.meta.env.DEV) {
  const mappedFiles = new Set(Object.values(auditImagePaths).map(path => path.split('/').at(-1)!));
  audits.filter(row => !auditImagePaths[row.image_id]).forEach(row => console.warn(`[内容审核] 缺少图片映射：${row.image_id}`));
  auditPhotoFiles.filter(file => !mappedFiles.has(file)).forEach(file => console.warn(`[内容审核] 图片没有对应记录：${file}`));
 }
}
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const definitions: { key: keyof Stats; label: string; format: (n: number) => string; rate?: boolean; Icon: typeof Users }[] = [
  { key: 'visitors', label: '访问人数', format: fmt, Icon: Users }, { key: 'participation', label: '参与转化率', format: pct, rate: true, Icon: TrendingUp }, { key: 'share', label: '分享转化率', format: pct, rate: true, Icon: Share2 }, { key: 'success', label: '生成成功率', format: pct, rate: true, Icon: CircleCheck }, { key: 'duration', label: '平均生成时长', format: n => n.toFixed(1) + ' s', Icon: Clock },
];
const sections = [
  ['overview', '数据总览', BarChart3],
  ['anomaly-center', '异常中心', TriangleAlert],
  ['content-audit', '内容审核', ClipboardCheck],
  ['device-management', '设备管理', Monitor],
] as const;
function Sidebar({ activeSection, onNavigate }: { activeSection: string; onNavigate: (id: string) => void }) {
  return <aside className="sidebar"><button type="button" className="brand" onClick={() => onNavigate('overview')}><span className="brand-mark"><Sparkles size={21} /></span>活动运营后台</button><nav>{sections.map(([id, label, Icon]) => <button key={id} className={activeSection === id ? 'nav-item selected' : 'nav-item'} onClick={() => onNavigate(id)}><Icon size={18} /><span>{label}</span>{activeSection === id && <span className="nav-dot" />}</button>)}</nav></aside>;
}
function SiteMultiSelect({ selected, onChange }: { selected: string[]; onChange: (codes: string[]) => void }) {
 const [open, setOpen] = useState(false);
 const root = useRef<HTMLDivElement>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const all = selected.length === sites.length;
 const label = all ? '全部点位' : selected.length === 1 ? sites.find(([code]) => code === selected[0])?.[1] : selected.length ? `已选 ${selected.length} 个点位` : '请选择点位';
 useEffect(() => {
  const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
  document.addEventListener('pointerdown', close);
  return () => document.removeEventListener('pointerdown', close);
 }, []);
 return <div className="site-filter multi-select" ref={root} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
  <span className="filter-label" id="site-filter-label">点位</span>
  <button ref={trigger} type="button" className="site-trigger" aria-label={`点位：${label}`} aria-expanded={open} aria-controls="site-options" onClick={() => setOpen(!open)}><span>{label}</span><ChevronRight size={14} className={open ? 'chevron open' : 'chevron'} /></button>
  {open && <div id="site-options" className="site-options" role="group" aria-labelledby="site-filter-label"><div className="site-actions"><span>选择点位</span><button type="button" onClick={() => onChange(sites.map(([code]) => code))}>全选</button><span>/</span><button type="button" onClick={() => onChange([])}>清空</button></div>
   <label className="site-option all-option"><input type="checkbox" checked={all} onChange={e => onChange(e.target.checked ? sites.map(([code]) => code) : [])} />全部点位</label>
   {sites.map(([code, name]) => <label className="site-option" key={code}><input type="checkbox" checked={selected.includes(code)} onChange={e => onChange(e.target.checked ? [...selected, code] : selected.filter(value => value !== code))} />{name}</label>)}
  </div>}
 </div>;
}
function DateRangePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
 const [open, setOpen] = useState(false), [cursor, setCursor] = useState(() => start.slice(0, 7) + '-01');
 const month = (offset: number) => { const date = new Date(cursor + 'T00:00:00'); date.setMonth(date.getMonth() + offset); return date; };
 const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
 const select = (value: string) => { if (!start || (start && end)) onChange(value, ''); else if (value < start) onChange(value, start); else onChange(start, value); };
 const drawMonth = (date: Date) => { const year = date.getFullYear(), monthIndex = date.getMonth(), days = new Date(year, monthIndex + 1, 0).getDate(), leading = new Date(year, monthIndex, 1).getDay(); return <div className="range-month" key={format(date)}><div className="range-month-title">{year}年{monthIndex + 1}月</div><div className="range-week">{['日','一','二','三','四','五','六'].map(day => <span key={day}>{day}</span>)}</div><div className="range-days">{Array.from({ length: leading }, (_, index) => <i key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => { const value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, selected = value === start || value === end, between = Boolean(start && end && value > start && value < end); return <button type="button" key={value} className={selected ? 'selected' : between ? 'between' : ''} onClick={() => select(value)}>{index + 1}</button>; })}</div></div>; };
 return <div className="date-range-picker"><span className="filter-label">时间范围</span><button type="button" className="date-range-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>{start.replaceAll('-', '/')} — {end ? end.replaceAll('-', '/') : '请选择结束日期'}</button>{open && <div className="date-range-popover"><div className="range-nav"><button type="button" aria-label="上个月" onClick={() => { const date = month(-1); setCursor(format(date) + '-01'); }}>‹</button><span>选择日期范围</span><button type="button" aria-label="下个月" onClick={() => { const date = month(1); setCursor(format(date) + '-01'); }}>›</button></div><div className="range-calendars">{drawMonth(month(0))}{drawMonth(month(1))}</div><div className="range-actions"><button type="button" onClick={() => onChange('', '')}>清除</button><button type="button" className="range-confirm" disabled={!start || !end} onClick={() => setOpen(false)}>确认</button></div></div>}</div>;
}
function FilterBar({ start, end, setRange, site, setSite, onExport }: { start: string; end: string; setRange: (s: string, e: string) => void; site: string[]; setSite: (s: string[]) => void; onExport: (type: string) => void }) {
 const [menu, setMenu] = useState(false), [draftStart, setDraftStart] = useState(start), [draftEnd, setDraftEnd] = useState(end);
 useEffect(() => { setDraftStart(start); setDraftEnd(end); }, [start, end]);
 const updateDraftRange = (nextStart: string, nextEnd: string) => { setDraftStart(nextStart); setDraftEnd(nextEnd); if (nextStart && nextEnd) setRange(nextStart, nextEnd); };
 return <div className="filterbar"><DateRangePicker start={draftStart} end={draftEnd} onChange={updateDraftRange} /><SiteMultiSelect selected={site} onChange={setSite} /><div className="update"><span className="filter-label">最后更新</span><small>{devices.map(r => r.last_heartbeat).sort().at(-1)?.slice(0, 16)}</small></div><div className="menu-wrap"><button className="icon-button" aria-label="更多操作" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></button>{menu && <><button className="menu-backdrop" aria-label="关闭菜单" onClick={() => setMenu(false)} /><div className="export-menu">{['趋势', '点位'].map(t => <button key={t} onClick={() => { onExport(t); setMenu(false); }}><Download size={15} />导出{t}数据</button>)}</div></>}</div></div>;
}
function MetricCards({ current, previous }: { current: Stats; previous: Stats | null }) {
 return <div className="metrics">{definitions.map(({ key, label, format, rate, Icon }) => { const change = previous ? rate ? (current[key] - previous[key]) * 100 : previous[key] ? (current[key] / previous[key] - 1) * 100 : null : null; const neutral = change === null || Math.abs(change) < 0.05; const good = !neutral && (key === 'duration' ? change < 0 : change > 0); const direction = neutral ? '—' : change > 0 ? '↑' : '↓'; return <article className={`metric metric-${key}`} key={key}><div className="metric-name">{label}</div><div className="metric-value"><Icon size={19} strokeWidth={1.7} /><strong>{format(current[key])}</strong></div><div className="metric-foot">{change !== null ? <><span className={neutral ? 'neutral' : good ? 'positive' : 'negative'}>{direction} {neutral ? '0.0' : Math.abs(change).toFixed(1)}{rate ? 'pp' : '%'}</span><span>较上一周期</span></> : <span>上一周期数据不足</span>}</div></article>; })}</div>;
}
type Point = Stats & { date: string };
function TrendChart({ title, subtitle, rows, series, percent, main }: { title: string; subtitle?: string; rows: Row[]; series: { key: keyof Stats; name: string; color: string }[]; percent?: boolean; main?: boolean }) {
 const [chartGrain, setChartGrain] = useState<'day' | 'week'>('day');
 const points = trend(rows, chartGrain);
 const ref = useRef<HTMLDivElement>(null);
 useEffect(() => { if (!ref.current) return; const chart = echarts.init(ref.current); const values = points.flatMap(p => series.map(s => p[s.key] * (percent ? 100 : 1))).filter(Number.isFinite); const low = values.length ? Math.min(...values) : 0; const high = values.length ? Math.max(...values) : 1; const padding = Math.max((high - low) * 0.1, percent ? 0.5 : Math.max(high * 0.01, 1)); const stability = series.length === 1 && series[0].key === 'success'; const axisMin = stability ? Math.max(0, Math.min(88, Math.floor(low - padding))) : Math.max(0, Math.floor(low - padding)); const axisMax = stability ? 100 : percent ? Math.min(100, Math.ceil(high + padding)) : Math.ceil(high + padding); const displayValue = (value: number) => percent ? value.toFixed(1) + '%' : fmt(value); const tooltipFormatter = (items: { axisValueLabel?: string; marker: string; seriesName: string; value: number }[]) => `<div style="font-size:14px;margin-bottom:6px">${items[0]?.axisValueLabel ?? ''}</div>${items.map(item => `<div style="display:flex;gap:8px;align-items:center;font-size:15px;line-height:1.7">${item.marker}<span>${item.seriesName}</span><strong style="margin-left:auto;font-size:16px">${displayValue(item.value)}</strong></div>`).join('')}`; chart.setOption({ animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, animationDuration: 400, textStyle: { fontFamily: 'Inter, Microsoft YaHei, sans-serif' }, tooltip: { trigger: 'axis', confine: true, formatter: tooltipFormatter, textStyle: { fontSize: 15 }, padding: [10, 12] }, legend: { show: false }, grid: { top: 32, left: percent ? 58 : 66, right: 18, bottom: 31 }, xAxis: { type: 'category', data: points.map(p => p.date.slice(5)), boundaryGap: false, axisLine: { lineStyle: { color: '#e9edf2' } }, axisTick: { show: false }, axisLabel: { color: '#8691a3', fontSize: 13, hideOverlap: true } }, yAxis: { type: 'value', min: axisMin, max: axisMax, scale: true, splitNumber: 4, axisLabel: { color: '#8691a3', fontSize: 13, formatter: percent ? '{value}%' : (v: number) => v >= 1000 ? v / 1000 + 'k' : String(v) }, splitLine: { lineStyle: { color: '#eef1f5', type: 'dashed' } } }, series: series.map(s => ({ name: s.name, type: 'line', data: points.map(p => +(p[s.key] * (percent ? 100 : 1)).toFixed(2)), smooth: 0.22, showSymbol: points.length < 10, symbolSize: 7, lineStyle: { width: 2.6 }, itemStyle: { color: s.color }, markLine: stability ? { silent: true, symbol: 'none', lineStyle: { color: '#cc7546', type: 'dashed', width: 1.2 }, label: { formatter: '90% 异常阈值', position: 'insideEndTop', color: '#b66b40', fontSize: 13 }, data: [{ yAxis: 90 }] } : undefined, areaStyle: main && s.key === 'visitors' ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#3767e51a' }, { offset: 1, color: '#3767e500' }]) } : undefined })) }); const observer = new ResizeObserver(() => chart.resize()); observer.observe(ref.current); return () => { observer.disconnect(); chart.dispose(); }; }, [points, percent, main, series]);
 return <section className={'panel chart-panel ' + (main ? 'main-chart' : '')}><div className="panel-heading"><h2>{title}</h2>{subtitle && <span className="muted">{subtitle}</span>}<div className="chart-header-actions"><div className="chart-inline-legend">{series.map(item => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.name}</span>)}</div><select className="chart-grain" value={chartGrain} onChange={event => setChartGrain(event.target.value as 'day' | 'week')} aria-label={`${title}时间粒度`}><option value="day">日</option><option value="week">周</option></select></div></div><div role="img" aria-label={title + '，共 ' + points.length + ' 个时间区间'} ref={ref} className="chart" /></section>;
}
function CurrentAnomalies({ rows, onNavigate }: { rows: Row[]; onNavigate: (id: string) => void }) {
 const ranked = [...rows].sort((a, b) => ({ 高: 0, 中: 1, 低: 2 }[a.severity] ?? 3) - ({ 高: 0, 中: 1, 低: 2 }[b.severity] ?? 3) || b.started_at.localeCompare(a.started_at));
 return <div className="anomalies"><div className="anomaly-heading"><h3>当前异常 <span className="count">{rows.length}</span></h3></div><div className="anomaly-list">{ranked.slice(0, 4).map(r => <article className="anomaly" key={r.anomaly_id}><div className="anomaly-title"><span className={`anomaly-severity ${r.severity}`}>{r.severity}</span><strong>{r.anomaly_type}</strong><span className={`anomaly-status ${r.status}`}>{r.status}</span></div><div className="anomaly-site"><span>{r.site_name}{r.device_id ? ` / ${r.device_id}` : ''}</span><time>{r.started_at.slice(5, 16)}</time></div></article>)}{!rows.length && <div className="empty">当前点位暂无待处理异常</div>}</div><button className="all-anomalies" onClick={() => onNavigate('anomaly-center')}>查看更多异常<ChevronRight size={15} /></button></div>;
}
function OperationStatus({ deviceRows, auditRows, anomalyRows, onNavigate }: { deviceRows: Row[]; auditRows: Row[]; anomalyRows: Row[]; onNavigate: (id: string) => void }) {
 const online = deviceRows.filter(r => Number(r.is_online) === 1).length, pending = auditRows.filter(r => r.review_status === '待审核').length;
 return <section className="panel operations"><div className="panel-heading"><h2>运营状态</h2><span className="snapshot">当前快照</span></div><div className="status-cards"><div><span className="state-label"><ClipboardCheck size={15} />当前待审核</span><strong>{pending}</strong></div><div><span className="state-label"><Monitor size={15} />设备在线率</span><strong>{pct(deviceRows.length ? online / deviceRows.length : 0)}</strong></div></div><CurrentAnomalies rows={anomalyRows} onNavigate={onNavigate} /></section>;
}
type SiteStats = Stats & { code: string; name: string; pending: number; anomalies: number };
const sortOptions: [keyof SiteStats, string][] = [['visitors', '访问人数'], ['participation', '参与转化率'], ['share', '分享转化率'], ['success', '生成成功率']];
function SiteComparisonTable({ rows, sort, setSort }: { rows: SiteStats[]; sort: keyof SiteStats; setSort: (s: keyof SiteStats) => void }) {
 return <section className="panel comparison"><div className="panel-heading"><div className="table-title"><h2>点位数据对比</h2><span className="muted">{rows.length} 个点位</span></div><label className="sort-label"><SlidersHorizontal size={14} />排序方式<select value={sort} onChange={e => setSort(e.target.value as keyof SiteStats)}>{sortOptions.map(([k, label]) => <option key={k} value={k}>按{label} ↓</option>)}</select></label></div><div className="table-scroll"><table><thead><tr><th>点位</th><th className={sort === 'visitors' ? 'sorted' : ''}>访问人数{sort === 'visitors' && ' ↓'}</th><th>参与人数</th><th className={sort === 'participation' ? 'sorted' : ''}>参与转化率{sort === 'participation' && ' ↓'}</th><th className={sort === 'share' ? 'sorted' : ''}>分享转化率{sort === 'share' && ' ↓'}</th><th className={sort === 'success' ? 'sorted' : ''}>生成成功率{sort === 'success' && ' ↓'}</th><th>平均生成时长</th></tr></thead><tbody>{rows.map(r => <tr key={r.code}><td><span className="site-name">{r.name}</span><small>{r.code}</small></td><td className="number-strong">{fmt(r.visitors)}</td><td>{fmt(r.participants)}</td><td>{pct(r.participation)}</td><td>{pct(r.share)}</td><td>{pct(r.success)}</td><td>{r.duration.toFixed(1)} <span className="muted">s</span></td></tr>)}</tbody></table></div><div className="table-footer">共 {rows.length} 个点位</div></section>;
}
const pageSizeOptions = [5, 10, 20];
function PageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
 return <select className="page-size" value={value} onChange={event => onChange(Number(event.target.value))} aria-label="每页条数">{pageSizeOptions.map(size => <option key={size} value={size}>{size} 条/页</option>)}</select>;
}
function AnomalyCenter({ rows }: { rows: Row[] }) {
 const [severity, setSeverity] = useState('全部'), [status, setStatus] = useState('全部'), [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(5), [selectedId, setSelectedId] = useState<string | null>(null), [updates, setUpdates] = useState<Record<string, string>>({});
 const enriched: Row[] = rows.map(row => ({ ...row, status: updates[row.anomaly_id] ?? row.status }));
 const filtered = enriched.filter(row => (severity === '全部' || row.severity === severity) && (status === '全部' || row.status === status) && `${row.site_name} ${row.device_id} ${row.anomaly_type} ${row.description}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.started_at.localeCompare(a.started_at));
 const totalCount = filtered.length, totalPages = Math.max(1, Math.ceil(totalCount / pageSize)), currentPage = Math.min(page, totalPages), pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), selected = enriched.find(row => row.anomaly_id === selectedId) ?? filtered.find(row => row.status === '待处理') ?? filtered[0] ?? null;
 const counts = (value: string) => filtered.filter(row => value === '全部' || row.status === value).length;
 const updateStatus = (next: string) => { if (selected) setUpdates(previous => ({ ...previous, [selected.anomaly_id]: next })); };
 useEffect(() => { setPage(1); }, [severity, status, query, rows, pageSize]);
 useEffect(() => { if (!selectedId || !filtered.some(row => row.anomaly_id === selectedId)) setSelectedId(filtered.find(row => row.status === '待处理')?.anomaly_id ?? filtered[0]?.anomaly_id ?? null); }, [filtered, selectedId]);
 const split = (value: string) => value.split(/[；;。]/).map(item => item.replace(/^\s*\d+[\.、]?\s*/, '').trim()).filter(Boolean);
 return <div className="anomaly-workspace"><div className={`panel anomaly-list-card anomaly-page-size-${pageSize}`}><div className="anomaly-toolbar"><label><span className="anomaly-filter-label">严重程度</span><select value={severity} onChange={event => setSeverity(event.target.value)}><option>全部</option><option>高</option><option>中</option><option>低</option></select></label><label><span className="anomaly-filter-label">状态</span><select value={status} onChange={event => setStatus(event.target.value)}><option>全部</option><option>待处理</option><option>处理中</option><option>已解决</option></select></label><label className="anomaly-search"><span className="anomaly-filter-label">关键词搜索</span><span className="anomaly-search-control"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索点位、设备 ID 或关键词" /></span></label></div><div className="anomaly-summary">{[['异常总数', counts('全部'), 'all'], ['待处理', counts('待处理'), 'pending'], ['处理中', counts('处理中'), 'processing'], ['已解决', counts('已解决'), 'resolved']].map(([label, value, kind]) => <div key={String(kind)} className={String(kind)}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="table-scroll anomaly-table-scroll"><table className="anomaly-table"><thead><tr><th>发生时间</th><th>严重程度</th><th>异常类型</th><th>点位</th><th>设备 ID</th><th>当前值</th><th>状态</th><th>操作</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.anomaly_id} className={selected?.anomaly_id === row.anomaly_id ? 'selected' : ''} onClick={() => setSelectedId(row.anomaly_id)}><td>{row.started_at.slice(0, 16)}</td><td><span className={`anomaly-severity ${row.status === '已解决' ? 'muted-severity' : row.severity}`}>{row.severity}</span></td><td className="number-strong">{row.anomaly_type}</td><td>{row.site_name}</td><td>{row.device_id || '—'}</td><td>{row.current_value || '—'}</td><td><span className={`anomaly-status ${row.status}`}>{row.status}</span></td><td><button type="button" className="detail-link" onClick={event => { event.stopPropagation(); setSelectedId(row.anomaly_id); }}>查看</button></td></tr>)}{!pageRows.length && <tr><td colSpan={8} className="audit-empty">没有符合条件的异常</td></tr>}</tbody></table></div><div className="module-pagination"><span>共 {totalCount} 条</span><div><PageSizeSelect value={pageSize} onChange={setPageSize} /><button type="button" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button type="button" key={index + 1} className={currentPage === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" aria-label="下一页" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button></div></div></div><aside className="panel anomaly-detail-card">{selected ? <><div className="anomaly-detail-scroll"><div className="anomaly-detail-head"><span className={`anomaly-severity ${selected.status === '已解决' ? 'muted-severity' : selected.severity}`}>{selected.severity}</span><h2>{selected.anomaly_type}</h2><span className={`anomaly-status ${selected.status}`}>{selected.status}</span></div><dl className="anomaly-detail-id"><dt>设备 ID</dt><dd>{selected.device_id || '—'}</dd></dl><section><h3>异常说明</h3><p>{selected.description}</p></section><section><h3>触发规则</h3><p>{selected.trigger_threshold || '—'}</p></section>{selected.status === '已解决' ? <section><h3>处理报告</h3><p>{selected.resolution_report || '—'}</p></section> : <><section><h3>可能原因</h3><ul>{split(selected.likely_cause).map(item => <li key={item}>{item}</li>)}</ul></section><section><h3>建议处理</h3><ol>{split(selected.suggested_action).map(item => <li key={item}>{item}</li>)}</ol></section><section><h3>处理记录</h3><p>{selected.handling_record || '暂无人工处理记录。'}</p></section></>}</div>{selected.status !== '已解决' && <div className="anomaly-actions">{selected.status === '待处理' && <button type="button" onClick={() => updateStatus('处理中')}>标记为处理中</button>}<button type="button" className="resolve" onClick={() => updateStatus('已解决')}>标记为已解决</button></div>}</> : <div className="audit-detail-empty">请选择一条异常记录查看详情</div>}</aside></div>;
}
const riskDescriptions: Record<string, string> = {
 '品牌风险': '画面中出现与知名品牌高度相似的标识、包装或配色，存在品牌混淆风险。',
 '敏感内容': '画面包含警戒线、冲突人群或公共事件相关元素，可能涉及敏感内容。',
 '人物风险': '画面主体包含逼真的人物形象，可能存在肖像误认或人物内容风险。',
 '低质量生成': '画面可能存在结构异常、文字乱码或细节崩坏，影响正常展示效果。',
};
type AuditRecord = Row & { image: string };
function AuditStatus({ value }: { value: string }) { return <span className={'audit-status ' + (value === '待审核' ? 'pending' : value === '已通过' ? 'approved' : 'rejected')}>{value}</span>; }
function RiskTag({ value }: { value: string }) { return <span className={'risk-tag ' + ({ '品牌风险': 'brand', '敏感内容': 'sensitive', '人物风险': 'portrait', '低质量生成': 'quality' }[value] ?? '')}>{value}</span>; }
function ContentAudit({ rows }: { rows: Row[] }) {
 const [status, setStatus] = useState('全部状态'), [risk, setRisk] = useState('全部风险'), [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(5), [selectedId, setSelectedId] = useState<string | null>(null), [updates, setUpdates] = useState<Record<string, Partial<Row>>>({}), [rejecting, setRejecting] = useState(false), [rejectReason, setRejectReason] = useState('');
 const enriched = rows.map(row => ({ ...row, ...updates[row.image_id], image: auditImagePaths[row.image_id] ?? '' } as AuditRecord));
 const priority = (value: string) => ({ '待审核': 0, '已通过': 1, '已拒绝': 2 }[value] ?? 3);
 const filtered = enriched.filter(row => (status === '全部状态' || row.review_status === status) && (risk === '全部风险' || row.risk_reason === risk) && `${row.image_id} ${row.device_id} ${row.site_name}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => priority(a.review_status) - priority(b.review_status) || b.generated_at.localeCompare(a.generated_at));
 const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)), safePage = Math.min(page, pageCount), pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize), selected = enriched.find(row => row.image_id === selectedId) ?? pageRows[0] ?? null;
 useEffect(() => { setPage(1); }, [status, risk, query, rows, pageSize]);
 useEffect(() => { if (!selectedId || !filtered.some(row => row.image_id === selectedId)) setSelectedId(filtered[0]?.image_id ?? null); }, [filtered, selectedId]);
 const review = (reviewStatus: '已通过' | '已拒绝', reason = '') => { if (!selected) return; const reviewedAt = new Date().toLocaleString('sv-SE').replace('T', ' '); setUpdates(previous => ({ ...previous, [selected.image_id]: { review_status: reviewStatus, reviewed_at: reviewedAt, reject_reason: reason } })); setRejecting(false); setRejectReason(''); };
 return <div className="audit-workspace"><div className="panel audit-list-card"><div className="audit-toolbar"><label><span className="audit-filter-label">人工审核状态</span><select value={status} onChange={event => setStatus(event.target.value)}><option>全部状态</option><option>待审核</option><option>已通过</option><option>已拒绝</option></select></label><label><span className="audit-filter-label">AI检测风险</span><select value={risk} onChange={event => setRisk(event.target.value)}><option>全部风险</option><option>品牌风险</option><option>敏感内容</option><option>人物风险</option><option>低质量生成</option></select></label><label className="audit-search"><span className="audit-filter-label">关键词搜索</span><span className="audit-search-control"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="请输入图片ID、设备ID或点位关键词" aria-label="请输入图片ID、设备ID或点位关键词" /></span></label></div><div className="table-scroll audit-table-scroll"><table className="audit-table"><thead><tr><th>图片ID</th><th>生成时间</th><th>图片</th><th>点位</th><th>设备ID</th><th>AI检测风险</th><th>人工审核状态</th><th>详情</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.image_id} className={selected?.image_id === row.image_id ? 'selected' : ''} onClick={() => setSelectedId(row.image_id)}><td className="number-strong">{row.image_id}</td><td>{row.generated_at.slice(5, 16)}</td><td><img src={row.image} alt="审核图片缩略图" className="audit-thumb" /></td><td>{row.site_name}</td><td>{row.device_id}</td><td><RiskTag value={row.risk_reason} /></td><td><AuditStatus value={row.review_status} /></td><td><button type="button" className="detail-link" onClick={event => { event.stopPropagation(); setSelectedId(row.image_id); }}>查看详情</button></td></tr>)}{!pageRows.length && <tr><td colSpan={8} className="audit-empty">没有符合条件的审核记录</td></tr>}</tbody></table></div><div className="audit-pagination"><span>共 {filtered.length} 条</span><div><PageSizeSelect value={pageSize} onChange={setPageSize} /><button type="button" aria-label="上一页" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index + 1} className={safePage === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" aria-label="下一页" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>›</button></div></div></div><aside className="panel audit-detail-card">{selected ? <div className="audit-detail-scroll"><h2>图片详情</h2><img src={selected.image} alt={`${selected.image_id} 生成图片`} className="audit-preview" /><dl className="audit-id"><dt>图片ID</dt><dd>{selected.image_id}</dd></dl><div className="audit-detail-section"><h3>Prompt</h3><p>{selected.prompt}</p></div><div className="audit-detail-section"><h3>AI检测风险</h3><RiskTag value={selected.risk_reason} /><p>{riskDescriptions[selected.risk_reason]}</p></div><div className="audit-detail-section"><h3>人工审核状态</h3><AuditStatus value={selected.review_status} />{selected.review_status !== '待审核' && <p>审核时间：{selected.reviewed_at || '—'}</p>}{selected.review_status === '已拒绝' && <p>拒绝原因：{selected.reject_reason || '—'}</p>}</div>{selected.review_status === '待审核' && <div className="audit-actions">{rejecting ? <div className="reject-form"><textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="请输入拒绝原因" /><div><button type="button" onClick={() => setRejecting(false)}>取消</button><button type="button" className="reject-button" disabled={!rejectReason.trim()} onClick={() => review('已拒绝', rejectReason.trim())}>确认拒绝</button></div></div> : <><button type="button" className="approve-button" onClick={() => review('已通过')}>通过</button><button type="button" className="reject-button" onClick={() => setRejecting(true)}>拒绝</button></>}</div>}</div> : <div className="audit-detail-empty">请选择一条图片记录查看详情</div>}</aside></div>;
}
type DeviceRow = { device_id: string; device_name: string; site_name: string; is_online: string; last_heartbeat: string; requests: number; successfulRequests: number; successRate: number; duration: number; recentAnomaly?: Row };
function formatHeartbeat(value: string) {
 const timestamp = Date.parse(value.replace(' ', 'T')), minutes = Math.round((heartbeatTimestamp - timestamp) / 60000);
 if (minutes <= 1) return '刚刚';
 if (minutes < 30) return `${minutes} 分钟前`;
 return `${value.slice(5, 10).replace('-', '/')} ${value.slice(11, 16)}`;
}
function DeviceManagement({ devices: deviceRows, metricRows, anomalyRows }: { devices: Row[]; metricRows: Row[]; anomalyRows: Row[] }) {
 const [status, setStatus] = useState<'all' | 'online' | 'offline'>('all');
 const [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(5);
 const rows = useMemo<DeviceRow[]>(() => {
  const totals = new Map<string, { requests: number; successfulRequests: number; durationTotal: number }>();
  metricRows.forEach(row => { const current = totals.get(row.device_id) ?? { requests: 0, successfulRequests: 0, durationTotal: 0 }; const requests = Number(row.generation_requests), successfulRequests = Number(row.successful_generation_requests); current.requests += requests; current.successfulRequests += successfulRequests; current.durationTotal += Number(row.avg_generation_seconds) * successfulRequests; totals.set(row.device_id, current); });
  const latestAnomaly = new Map<string, Row>();
  anomalyRows.filter(row => row.device_id).sort((a, b) => b.started_at.localeCompare(a.started_at)).forEach(row => { if (!latestAnomaly.has(row.device_id)) latestAnomaly.set(row.device_id, row); });
  return deviceRows.map(row => { const total = totals.get(row.device_id) ?? { requests: 0, successfulRequests: 0, durationTotal: 0 }; return { device_id: row.device_id, device_name: row.device_name, site_name: row.site_name, is_online: row.is_online, last_heartbeat: row.last_heartbeat, requests: total.requests, successfulRequests: total.successfulRequests, successRate: total.requests ? total.successfulRequests / total.requests : 0, duration: total.successfulRequests ? total.durationTotal / total.successfulRequests : 0, recentAnomaly: latestAnomaly.get(row.device_id) }; });
 }, [deviceRows, metricRows, anomalyRows]);
 const filtered = rows.filter(row => (status === 'all' || (status === 'online' ? Number(row.is_online) === 1 : Number(row.is_online) === 0)) && `${row.device_id} ${row.site_name}`.toLowerCase().includes(query.trim().toLowerCase()));
 const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)), safePage = Math.min(page, pageCount), pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
 useEffect(() => { setPage(1); }, [status, query, deviceRows, metricRows, pageSize]);
 const anomalySummary = (row?: Row) => !row ? '—' : row.anomaly_type === '设备离线' ? `设备离线 ${row.current_value.replace(/^离线\s*/, '')}` : row.anomaly_type;
 return <div className="panel device-management-card"><div className="device-toolbar"><div className="device-status-filter"><span>设备状态</span>{([['all', '全部'], ['online', '在线'], ['offline', '离线']] as const).map(([value, label]) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}</div><label className="device-search"><span className="search-icon">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索设备 ID / 点位" aria-label="搜索设备 ID / 点位" /></label></div><div className="table-scroll"><table className="device-table"><thead><tr><th>设备 ID</th><th>点位</th><th>当前状态</th><th>生成次数</th><th>生成成功率</th><th>平均生成时长</th><th>最后心跳时间</th><th>最近异常</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.device_id}><td className="number-strong">{row.device_id}</td><td>{row.site_name}</td><td><span className={Number(row.is_online) ? 'device-status online' : 'device-status offline'}><i />{Number(row.is_online) ? '在线' : '离线'}</span></td><td>{fmt(row.requests)}</td><td>{pct(row.successRate)}</td><td>{row.duration.toFixed(1)}s</td><td>{formatHeartbeat(row.last_heartbeat)}</td><td className={row.recentAnomaly ? 'device-anomaly' : ''}>{anomalySummary(row.recentAnomaly)}</td></tr>)}{!pageRows.length && <tr><td className="device-empty" colSpan={8}>没有符合条件的设备</td></tr>}</tbody></table></div><div className="device-pagination"><span>共 {filtered.length} 条</span><div><PageSizeSelect value={pageSize} onChange={setPageSize} /><button type="button" aria-label="上一页" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index + 1} className={safePage === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" aria-label="下一页" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>›</button></div></div></div>;
}
function Dashboard() {
 const [activeSection, setActiveSection] = useState('overview'), [grain, setGrain] = useState<Grain>('day'), [start, setStart] = useState(shiftDate(maxDate, -13)), [end, setEnd] = useState(maxDate), [site, setSite] = useState<string[]>(() => sites.map(([code]) => code)), [sort, setSort] = useState<keyof SiteStats>('visitors'), [notice, setNotice] = useState('');
 const programmaticScrolling = useRef(false), navigationTimer = useRef<number | null>(null);
 const navigate = (id: string) => {
  const target = document.getElementById(id);
  if (!target) return;
  if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
  programmaticScrolling.current = true;
  setActiveSection(id);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  navigationTimer.current = window.setTimeout(() => { programmaticScrolling.current = false; navigationTimer.current = null; setActiveSection(id); }, 700);
 };
 useEffect(() => {
  const nodes = sections.map(([id]) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
  let frame = 0;
  const syncActiveSection = () => {
   if (programmaticScrolling.current) return;
   const stickyOffset = 132;
   const current = nodes.filter(node => node.getBoundingClientRect().bottom > stickyOffset).sort((a, b) => Math.abs(a.getBoundingClientRect().top - stickyOffset) - Math.abs(b.getBoundingClientRect().top - stickyOffset))[0];
   if (current) setActiveSection(current.id);
  };
  const scheduleSync = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(syncActiveSection); };
  const observer = new IntersectionObserver(scheduleSync, { rootMargin: '-132px 0px -45% 0px', threshold: [0, 0.15, 0.5, 0.85] });
  nodes.forEach(node => observer.observe(node));
  window.addEventListener('scroll', scheduleSync, { passive: true });
  scheduleSync();
  return () => { observer.disconnect(); window.removeEventListener('scroll', scheduleSync); window.cancelAnimationFrame(frame); if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current); };
 }, []);
 const matches = (r: Row) => site.includes(r.site_code);
 const selected = metrics.filter(r => matches(r) && r.date >= start && r.date <= end);
 const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
 const previousStart = shiftDate(start, -days), previousEnd = shiftDate(start, -1);
 const previous = previousStart >= minDate ? aggregate(metrics.filter(r => matches(r) && r.date >= previousStart && r.date <= previousEnd)) : null;
 const points = trend(selected, grain), active = activeAnomalies(anomalies);
 const siteRows = sites.filter(([code]) => site.includes(code)).map(([code, name]) => ({ code, name, ...aggregate(selected.filter(r => r.site_code === code)), pending: audits.filter(r => r.site_code === code && r.review_status === '待审核').length, anomalies: active.filter(r => r.site_code === code).length })).sort((a, b) => Number(b[sort]) - Number(a[sort]));
 const exportData = (type: string) => { if (!site.length) { setNotice('请先选择至少一个点位'); return; } const context = { 时间粒度: { day: '日', week: '周', month: '月' }[grain], 开始日期: start, 结束日期: end, 点位筛选: site.length === sites.length ? '全部点位' : sites.filter(([code]) => site.includes(code)).map(([, name]) => name).join('、') }; const values = (r: Stats) => ({ 访问人数: r.visitors, 参与人数: r.participants, 分享人数: r.shares, 参与转化率: pct(r.participation), 分享转化率: pct(r.share), 生成成功率: pct(r.success), 平均生成时长秒: r.duration.toFixed(2) }); download(`${type}数据_${start}_${end}_${grain}.csv`, type === '趋势' ? points.map(r => ({ ...context, 周期起始: r.date, ...values(r) })) : siteRows.map(r => ({ ...context, 点位: r.name, ...values(r), 当前待审核: r.pending, 当前异常数: r.anomalies }))); setNotice(`${type}数据已导出，已应用当前筛选条件`); };
 const selectedDeviceRows = devices.filter(matches), selectedAnomalyRows = anomalies.filter(row => matches(row) && row.started_at.slice(0, 10) >= start && row.started_at.slice(0, 10) <= end), selectedCurrentAnomalyRows = active.filter(matches);
 const selectedDeviceMetricRows = deviceMetrics.filter(row => matches(row) && row.date >= start && row.date <= end);
 const selectedSiteNames = new Set(selectedDeviceRows.map(row => row.site_name));
 const globalFilters = <FilterBar start={start} end={end} setRange={(s, e) => { if (s <= e && s >= minDate && e <= maxDate) { setStart(s); setEnd(e); } }} site={site} setSite={setSite} onExport={exportData} />;
 return <><Sidebar activeSection={activeSection} onNavigate={navigate} /><main>{globalFilters}<section id="overview" className="dashboard-section"><header className="page-header"><h1>数据总览</h1></header>{!site.length && <div className="selection-empty" role="status">尚未选择点位，请在上方勾选点位以查看数据。</div>}<MetricCards current={aggregate(selected)} previous={previous} /><div className="analysis-grid"><div className="trends trend-grid"><TrendChart title="访问人数趋势" subtitle="人数" rows={selected} series={[{ key: 'visitors', name: '访问人数', color: '#4268db' }]} /><TrendChart title="参与转化率趋势" rows={selected} percent series={[{ key: 'participation', name: '参与转化率', color: '#259d91' }]} /><TrendChart title="分享转化率趋势" rows={selected} percent series={[{ key: 'share', name: '分享转化率', color: '#d6a04b' }]} /><TrendChart title="生成成功率趋势" rows={selected} percent series={[{ key: 'success', name: '生成成功率', color: '#8270bd' }]} /></div><OperationStatus deviceRows={selectedDeviceRows} auditRows={audits.filter(row => selectedSiteNames.has(row.site_name))} anomalyRows={selectedCurrentAnomalyRows} onNavigate={navigate} /></div><SiteComparisonTable rows={siteRows} sort={sort} setSort={setSort} /></section><section id="anomaly-center" className="dashboard-section"><header className="section-header"><h1>异常中心</h1></header><AnomalyCenter rows={selectedAnomalyRows} /></section><section id="content-audit" className="dashboard-section"><header className="section-header"><h1>内容审核</h1></header><ContentAudit rows={audits.filter(row => selectedSiteNames.has(row.site_name) && row.generated_at.slice(0, 10) >= start && row.generated_at.slice(0, 10) <= end)} /></section><section id="device-management" className="dashboard-section"><header className="section-header"><h1>设备管理</h1></header><DeviceManagement devices={selectedDeviceRows} metricRows={selectedDeviceMetricRows} anomalyRows={anomalies} /></section></main>{notice && <div className="toast" role="status"><Download size={16} />{notice}<button aria-label="关闭通知" onClick={() => setNotice('')}><X size={16} /></button></div>}</>;
}

export default function App() {
 const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; message?: string }>({ status: 'loading' });
 useEffect(() => {
  let cancelled = false;
  loadDashboardData().then(() => { if (!cancelled) setState({ status: 'ready' }); }).catch(error => { if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : '数据加载失败' }); });
  return () => { cancelled = true; };
 }, []);
 if (state.status === 'loading') return <main className="dashboard-loading" role="status">正在加载运营数据…</main>;
 if (state.status === 'error') return <main className="dashboard-loading" role="alert">{state.message}</main>;
 return <Dashboard />;
}





