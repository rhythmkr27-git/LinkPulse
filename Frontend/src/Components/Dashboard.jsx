import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const fmt = (n) => new Intl.NumberFormat().format(Number(n || 0));
const dateText = (value) => value ? new Date(value).toLocaleDateString() : 'Never';

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    throw new Error(body.error || body.msg || body.message || `Request failed (${response.status})`);
  }
  if (contentType.includes('application/json')) return response.json();
  return response;
}

function Metric({ label, value, note }) {
  return <div className="metric-card"><span>{label}</span><strong>{fmt(value)}</strong>{note && <small>{note}</small>}</div>;
}

function Empty({ children }) { return <div className="empty-state">{children}</div>; }

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('linkpulse-user') || '{}'); } catch { return {}; } });
  const [tab, setTab] = useState('overview');
  const [links, setLinks] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [days, setDays] = useState(7);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [linkData, campaignData, stats, me] = await Promise.all([
        api('/links?limit=100'), api('/campaigns'), api(`/analytics/overview?days=${days}`), api('/auth/me'),
      ]);
      setLinks(linkData.items || []); setCampaigns(campaignData.items || []); setAnalytics(stats); setUser(me.user);
      localStorage.setItem('linkpulse-user', JSON.stringify(me.user));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* local navigation still clears the session UI */ }
    localStorage.removeItem('linkpulse-user'); navigate('/login', { replace: true });
  }

  async function createLink(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const payload = {
      destination: form.get('destination').trim(),
      alias: form.get('alias').trim() || null,
      expiresAt: form.get('expiresAt') ? new Date(form.get('expiresAt')).toISOString() : null,
      clickLimit: form.get('clickLimit') ? Number(form.get('clickLimit')) : null,
      password: form.get('password') || null,
      campaignId: form.get('campaignId') || null,
      tags: String(form.get('tags') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
    try {
      const result = await api('/links', { method: 'POST', body: JSON.stringify(payload) });
      setNotice(`Short link created: ${result.link.shortUrl}`); setShowCreate(false); setTab('links'); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function createCampaign(event) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/campaigns', { method: 'POST', body: JSON.stringify({ name: form.get('name').trim(), description: form.get('description').trim() }) });
      setShowCampaign(false); setNotice('Campaign created successfully.'); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function changeStatus(link, status) {
    setError(''); setNotice('');
    try { await api(`/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice(`Link ${status === 'disabled' ? 'disabled' : 'enabled'}.`); await load(); }
    catch (err) { setError(err.message); }
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); setNotice('Short URL copied to clipboard.'); }
    catch { setNotice(`Copy this URL: ${url}`); }
  }

  const filteredLinks = useMemo(() => links.filter((link) => `${link.code} ${link.destination} ${(link.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [links, query]);
  const seriesMax = Math.max(1, ...(analytics?.timeseries || []).map((d) => d.clicks));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">↗</span><span>LinkPulse<small>LINK MANAGEMENT</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      {[["overview", "▦", "Overview"], ["links", "↗", "My links"], ["campaigns", "◉", "Campaigns"], ["analytics", "▥", "Analytics"]].map(([id, icon, label]) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}
      {user.role === 'admin' && <div className="admin-note">Administrator account</div>}
      <div className="sidebar-bottom"><div className="avatar">{(user.username || 'U').slice(0, 1).toUpperCase()}</div><div className="user-meta"><strong>{user.username || 'LinkPulse user'}</strong><small>{user.email || ''}</small></div><button className="icon-button" title="Log out" onClick={logout}>⇥</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">LINK MANAGEMENT PLATFORM</span><h1>{({ overview: 'Overview', links: 'My links', campaigns: 'Campaigns', analytics: 'Analytics' })[tab]}</h1></div><div className="top-actions"><select aria-label="Analytics period" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button className="primary-button" onClick={() => { setError(''); setShowCreate(true); }}>＋ Create link</button></div></header>
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="loading-panel">Loading your workspace…</div> : <>
        {(tab === 'overview' || tab === 'analytics') && <>
          <section className="metrics-grid">
            <Metric label="Total links" value={analytics?.links?.total} note={`${analytics?.links?.active || 0} currently active`} />
            <Metric label="Human clicks" value={analytics?.clicks} note={`Last ${days} days`} />
            <Metric label="Unique visitors" value={analytics?.uniqueVisitors} note="Estimated from browser/IP hash" />
            <Metric label="Bot clicks" value={analytics?.botClicks} note="Excluded from human click totals" />
          </section>
          <section className="content-grid">
            <div className="panel chart-panel"><div className="panel-heading"><div><h2>Click activity</h2><p>Human visits over the selected period</p></div><span className="live-dot">Live data</span></div>
              {(analytics?.timeseries || []).length ? <div className="chart-area">{analytics.timeseries.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.clicks} clicks`}><span className="bar-value">{point.clicks || ''}</span><div className="bar-track"><div className="bar" style={{ height: `${Math.max(point.clicks ? 5 : 1, point.clicks / seriesMax * 100)}%` }} /></div><small>{new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>)}</div> : <Empty>No click data for this period yet.</Empty>}
            </div>
            <div className="panel"><div className="panel-heading"><div><h2>Top links</h2><p>Most human clicks</p></div><button className="text-button" onClick={() => setTab('links')}>View all →</button></div>
              {(analytics?.topLinks || []).length ? <div className="top-link-list">{analytics.topLinks.map((link) => <div className="top-link" key={link.id}><div className="link-icon">↗</div><div className="top-link-name"><strong>/{link.code}</strong><small>{link.destination}</small></div><b>{fmt(link.clicks)}</b></div>)}</div> : <Empty>Share a link to see performance here.</Empty>}
            </div>
          </section>
          <section className="content-grid lower-grid"><div className="panel"><div className="panel-heading"><div><h2>Traffic sources</h2><p>Where visitors came from</p></div></div><Breakdown items={analytics?.referrers || []} /></div><div className="panel"><div className="panel-heading"><div><h2>Devices</h2><p>Visitor device breakdown</p></div></div><Breakdown items={analytics?.devices || []} /></div></section>
        </>}
        {tab === 'links' && <section className="panel table-panel"><div className="panel-heading"><div><h2>All links</h2><p>Manage destinations, rules and short URLs</p></div><div className="table-actions"><input className="search-input" placeholder="Search links or tags…" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="primary-button" onClick={() => setShowCreate(true)}>＋ New link</button></div></div>
          {filteredLinks.length ? <div className="table-scroll"><table><thead><tr><th>SHORT LINK</th><th>DESTINATION</th><th>STATUS</th><th>CLICKS</th><th>EXPIRES</th><th>ACTIONS</th></tr></thead><tbody>{filteredLinks.map((link) => <tr key={link.id}><td><strong className="short-code">/{link.code}</strong><small className="tag-line">{(link.tags || []).map((t) => `#${t}`).join(' ') || 'No tags'}</small></td><td><span className="destination-text" title={link.destination}>{link.destination}</span>{link.hasPassword && <small className="tag-line">Password protected</small>}</td><td><span className={`status-pill ${link.effectiveStatus === 'active' ? 'status-active' : 'status-inactive'}`}>{link.effectiveStatus?.replace('_', ' ') || link.status}</span></td><td>{fmt(link.clickCount)}</td><td>{dateText(link.expiresAt)}</td><td><div className="row-actions"><button title="Copy short URL" onClick={() => copyLink(link.shortUrl)}>Copy</button><a title="Open QR code" href={`${API}/links/${link.id}/qr?format=png`} target="_blank" rel="noreferrer">QR</a>{link.status === 'disabled' ? <button onClick={() => changeStatus(link, 'active')}>Enable</button> : <button onClick={() => changeStatus(link, 'disabled')}>Disable</button>}</div></td></tr>)}</tbody></table></div> : <Empty>No links found. Create your first short link to get started.</Empty>}
        </section>}
        {tab === 'campaigns' && <section className="panel"><div className="panel-heading"><div><h2>Your campaigns</h2><p>Organize links and compare performance by campaign</p></div><button className="primary-button" onClick={() => { setError(''); setShowCampaign(true); }}>＋ New campaign</button></div>{campaigns.length ? <div className="campaign-grid">{campaigns.map((campaign) => <article className="campaign-card" key={campaign._id}><div className="campaign-symbol">◉</div><h3>{campaign.name}</h3><p>{campaign.description || 'No description added.'}</p><div className="campaign-foot"><span>{campaign.linkCount || 0} links</span><span>Created {dateText(campaign.createdAt)}</span></div><button className="text-button" onClick={() => { setTab('links'); setQuery(''); }}>View links →</button></article>)}</div> : <Empty>No campaigns yet. Create one to organize your links.</Empty>}</section>}
      </>}
    </main>

    {showCreate && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}><section className="modal"><div className="modal-heading"><div><span className="eyebrow">NEW SHORT URL</span><h2>Create a link</h2><p>Configure your destination and redirect rules.</p></div><button className="icon-button" onClick={() => setShowCreate(false)}>×</button></div><form onSubmit={createLink} className="modal-form"><label>Destination URL *<input name="destination" type="url" placeholder="https://example.com/page" required maxLength={2048} /></label><div className="form-two"><label>Custom alias <input name="alias" placeholder="my-campaign (optional)" maxLength={32} pattern="[A-Za-z0-9_-]{3,32}" title="3–32 letters, numbers, hyphens or underscores" /></label><label>Campaign<select name="campaignId"><option value="">No campaign</option>{campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label></div><div className="form-two"><label>Expiry date<input name="expiresAt" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} /></label><label>Click limit<input name="clickLimit" type="number" min="1" max="1000000" placeholder="Unlimited" /></label></div><div className="form-two"><label>Password <input name="password" type="password" minLength="4" maxLength="72" placeholder="Optional (4+ characters)" /></label><label>Tags <input name="tags" placeholder="marketing, social" /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create short link'}</button></div></form></section></div>}
    {showCampaign && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCampaign(false); }}><section className="modal small-modal"><div className="modal-heading"><div><span className="eyebrow">ORGANIZATION</span><h2>Create campaign</h2></div><button className="icon-button" onClick={() => setShowCampaign(false)}>×</button></div><form onSubmit={createCampaign} className="modal-form"><label>Campaign name *<input name="name" required maxLength="80" placeholder="e.g. Summer launch" /></label><label>Description<textarea name="description" rows="3" maxLength="300" placeholder="What is this campaign for?" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCampaign(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Create campaign'}</button></div></form></section></div>}
  </div>;
}

function Breakdown({ items }) {
  const max = Math.max(1, ...items.map((item) => item.clicks));
  if (!items.length) return <Empty>Traffic breakdown will appear after visits are recorded.</Empty>;
  return <div className="breakdown-list">{items.slice(0, 6).map((item) => <div className="breakdown-row" key={item.name}><div><span>{item.name || 'Unknown'}</span><strong>{fmt(item.clicks)}</strong></div><div className="breakdown-track"><div style={{ width: `${item.clicks / max * 100}%` }} /></div></div>)}</div>;
}
