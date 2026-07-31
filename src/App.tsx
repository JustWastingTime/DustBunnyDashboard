import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from './api'
import { assessMember } from './assess'
import type { Applicant, Assignment, Band, Club, DashboardState, Member, PublicData, Status } from './types'
import './App.css'

const number = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const statusOptions: Status[] = ['pending', 'approved', 'waitlisted', 'rejected']

function Freshness({ date }: { date?: string | null }) {
  if (!date) return <span className="freshness stale">Not synced</span>
  const hours = Math.max(0, (Date.now() - new Date(date).getTime()) / 3_600_000)
  return <span className={`freshness ${hours > 24 ? 'stale' : ''}`}>{hours < 1 ? 'Updated recently' : `Updated ${Math.floor(hours)}h ago`}</span>
}

const bandOptions: Array<{ value: Band | 'all'; label: string }> = [
  { value: 'all', label: 'All assessments' },
  { value: 'promotion', label: 'Promotion candidate' },
  { value: 'meeting', label: 'Meeting target' },
  { value: 'under', label: 'Under target' },
  { value: 'severe', label: 'Severely under' },
  { value: 'inactive', label: 'Inactive' },
]

function BandBadge({ band, reason }: { band?: Band | null; reason?: string | null }) {
  const labels: Record<Band, string> = {
    promotion: 'Promotion candidate', meeting: 'Meeting target', under: 'Under target',
    severe: 'Severely under', inactive: 'Inactive',
  }
  if (!band || !(band in labels)) {
    return <span className="badge band-inactive" title={reason || 'No assessment yet'}>Unassessed<small>{reason || 'Refresh data to classify'}</small></span>
  }
  return <span className={`badge band-${band}`} title={reason || ''}>{labels[band]}<small>{reason}</small></span>
}

function Header({ children, publicMode = false }: { children?: ReactNode; publicMode?: boolean }) {
  return <header className="site-header">
    <div>
      <p className="eyebrow">{publicMode ? 'Public performance report' : 'Local management workspace'}</p>
      <h1>Club operations</h1>
    </div>
    {children}
  </header>
}

function ClubSummary({ clubs }: { clubs: Array<Club & { members?: Member[] }> }) {
  const chart = clubs.map((club) => {
    const members = club.members || []
    return {
      name: club.name,
      average: members.length ? Math.round(members.reduce((sum, member) => sum + member.dailyAverage, 0) / members.length) : 0,
      target: club.dailyTarget,
    }
  })
  return <section className="panel chart-panel">
    <div className="section-heading"><div><p className="eyebrow">Cross-club comparison</p><h2>Average daily fans</h2></div><p>Club average against each configured member requirement.</p></div>
    <div className="chart" role="img" aria-label="Average daily fans by club">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" /><YAxis tickFormatter={(value) => compact.format(value)} />
          <Tooltip formatter={(value) => number.format(Number(value))} /><Legend />
          <Bar dataKey="average" name="Member average (fans/day)" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="target" name="Requirement (fans/day)" fill="var(--muted-chart)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>
}

function TrendChart({
  label,
  dailyGains,
  height = 54,
  className = 'mini-chart',
}: {
  label: string
  dailyGains?: number[] | null
  height?: number
  className?: string
}) {
  const gains = Array.isArray(dailyGains) ? dailyGains : []
  const data = gains.map((fans, index) => ({ day: index + 1, fans }))
  if (!data.length) return <span className="muted">No 30-day history available</span>
  return <div className={className} aria-label={`${label} 30-day fan history`}>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
        <XAxis dataKey="day" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          formatter={(value) => number.format(Number(value))}
          labelFormatter={(day) => `Day ${day}`}
        />
        <Line type="monotone" dataKey="fans" name="Fans gained" stroke="var(--accent)" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  </div>
}

function planStatusLabel(
  member: Member,
  assignments: Assignment[],
  clubById: Map<string, Club>,
) {
  const assignment = assignments.find((item) => item.entityType === 'member' && item.entityId === member.umaId)
  if (!assignment) return null
  const home = member.circleId || ''
  const destination = assignment.destination === 'unassigned' ? 'applicants' : assignment.destination
  if (!destination || destination === home) return null
  if (destination === 'kick') return { kind: 'kick' as const, label: 'Kick / remove' }
  if (destination === 'waitlist') return { kind: 'waitlist' as const, label: 'Waitlist' }
  if (destination === 'applicants') return { kind: 'applicant' as const, label: 'To applicants' }
  const clubName = clubById.get(destination)?.name || destination
  return { kind: 'move' as const, label: `Moving to ${clubName}` }
}

function MemberTable({
  clubs,
  members: supplied,
  assignments = [],
}: {
  clubs: Club[]
  members?: Member[]
  assignments?: Assignment[]
}) {
  const [query, setQuery] = useState('')
  const [clubFilter, setClubFilter] = useState('all')
  const [bandFilter, setBandFilter] = useState<Band | 'all'>('all')
  const [sort, setSort] = useState<'dailyAverage' | 'monthlyGain' | 'todayGain'>('dailyAverage')
  const clubById = new Map(clubs.map((club) => [club.circleId, club]))
  const members = (supplied || clubs.flatMap((club) => (club.members || []).map((member) => ({ ...member, circleId: club.circleId }))))
    .map((member) => {
      const club = clubById.get(member.circleId || '')
      if (!club) return member
      const assessed = assessMember({
        dailyAverage: member.dailyAverage,
        dailyTarget: club.dailyTarget,
        lastUpdatedAt: member.lastUpdatedAt,
        promotionRatio: club.promotionRatio,
        severeRatio: club.severeRatio,
        inactiveDays: club.inactiveDays,
        promotionEnabled: club.promotionEnabled !== false,
      })
      return { ...member, band: assessed.band, reason: assessed.reason }
    })
  const promotionAvailable = clubFilter === 'all'
    ? clubs.some((club) => club.promotionEnabled !== false)
    : clubById.get(clubFilter)?.promotionEnabled !== false
  const visibleBandOptions = bandOptions.filter((option) => option.value !== 'promotion' || promotionAvailable)
  const filtered = [...members]
    .filter((member) => clubFilter === 'all' || member.circleId === clubFilter)
    .filter((member) => bandFilter === 'all' || member.band === bandFilter)
    .filter((member) => member.ign.toLowerCase().includes(query.toLowerCase()) || member.umaId.includes(query))
    .sort((a, b) => b[sort] - a[sort])
  const bandCounts = members.reduce<Record<string, number>>((counts, member) => {
    if (clubFilter !== 'all' && member.circleId !== clubFilter) return counts
    counts[member.band] = (counts[member.band] || 0) + 1
    return counts
  }, {})
  return <section className="panel">
    <div className="section-heading">
      <div>
        <p className="eyebrow">Decision support</p>
        <h2>Member comparison</h2>
        <p>{filtered.length} of {members.length} members shown{!promotionAvailable && clubFilter !== 'all' ? ' · promotion assessments disabled for this club' : ''}</p>
      </div>
      <div className="filters">
        <input aria-label="Search members" placeholder="Search IGN or Uma ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter by club" value={clubFilter} onChange={(event) => {
          const nextClub = event.target.value
          setClubFilter(nextClub)
          const nextAllowsPromotion = nextClub === 'all'
            ? clubs.some((club) => club.promotionEnabled !== false)
            : clubById.get(nextClub)?.promotionEnabled !== false
          if (!nextAllowsPromotion && bandFilter === 'promotion') setBandFilter('all')
        }}>
          <option value="all">All clubs</option>
          {clubs.map((club) => <option key={club.circleId} value={club.circleId}>{club.name}</option>)}
        </select>
        <select aria-label="Filter by assessment" value={bandFilter} onChange={(event) => setBandFilter(event.target.value as Band | 'all')}>
          {visibleBandOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === 'all' ? option.label : `${option.label} (${bandCounts[option.value] || 0})`}
            </option>
          ))}
        </select>
        <select aria-label="Sort members" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="dailyAverage">Daily average</option><option value="monthlyGain">Monthly gain</option><option value="todayGain">Today</option>
        </select>
      </div>
    </div>
    <div className="band-filter-row" role="group" aria-label="Quick assessment filters">
      {visibleBandOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`band-chip ${bandFilter === option.value ? 'active' : ''} ${option.value !== 'all' ? `chip-${option.value}` : ''}`}
          onClick={() => setBandFilter(option.value)}
        >
          {option.label}
          <span>{option.value === 'all' ? (clubFilter === 'all' ? members.length : members.filter((member) => member.circleId === clubFilter).length) : (bandCounts[option.value] || 0)}</span>
        </button>
      ))}
    </div>
    <div className="table-scroll"><table>
      <thead><tr><th>Trainer</th><th>Club</th><th>Monthly</th><th>Daily avg</th><th>Today</th><th>Trend</th><th>Assessment</th><th>Plan</th></tr></thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr><td colSpan={8} className="empty-row">No members match these filters.</td></tr>
        ) : filtered.map((member) => {
          const plan = planStatusLabel(member, assignments, clubById)
          return <tr key={`${member.circleId}:${member.umaId}`}>
            <td><strong>{member.ign}</strong><small className="id">{member.umaId}</small></td>
            <td>{clubById.get(member.circleId || '')?.name || '—'}</td>
            <td>{number.format(member.monthlyGain)}</td><td>{number.format(member.dailyAverage)}</td><td>+{number.format(member.todayGain)}</td>
            <td><TrendChart label={member.ign} dailyGains={member.dailyGains} /></td>
            <td><BandBadge band={member.band} reason={member.reason} /></td>
            <td>{plan ? <span className={`plan-status plan-${plan.kind}`}>{plan.label}</span> : <span className="muted">—</span>}</td>
          </tr>
        })}
      </tbody>
    </table></div>
  </section>
}

function PublicApplicants({ applicants, clubs }: { applicants: Applicant[]; clubs: Club[] }) {
  const names = new Map(clubs.map((club) => [club.circleId, club.name]))
  return <section className="panel">
    <div className="section-heading"><div><p className="eyebrow">Recruitment</p><h2>Applicants</h2></div><p>Application status and public uma.moe performance.</p></div>
    <div className="table-scroll"><table>
      <thead><tr><th>Trainer</th><th>Applying to</th><th>Status</th><th>Current club</th><th>Monthly</th><th>Daily avg</th></tr></thead>
      <tbody>{applicants.map((applicant) => <tr key={applicant.umaId}>
        <td><a href={`https://uma.moe/profile/${applicant.umaId}`} target="_blank" rel="noreferrer"><strong>{applicant.ign}</strong></a><small className="id">{applicant.umaId}</small></td>
        <td>{names.get(applicant.targetClubId) || applicant.targetClubId}</td><td><span className={`status status-${applicant.status}`}>{applicant.status}</span></td>
        <td>{applicant.currentClubName || 'Unattached'}</td><td>{number.format(applicant.monthlyGain)}</td><td>{number.format(applicant.dailyAverage)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

function PublicDashboard() {
  const [data, setData] = useState<PublicData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/dashboard.json`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Dashboard data has not been published yet.')))
      .then(setData).catch((reason) => setError(reason.message))
  }, [])
  if (error) return <main className="center-message"><h1>Club dashboard</h1><p>{error}</p></main>
  if (!data) return <main className="center-message"><h1>Club dashboard</h1><p>Loading latest report…</p></main>
  const members = data.clubs.flatMap((club) => club.members)
  const counts = members.reduce<Record<Band, number>>((result, member) => {
    result[member.band] += 1
    return result
  }, { promotion: 0, meeting: 0, under: 0, severe: 0, inactive: 0 })
  return <main className="shell">
    <Header publicMode><Freshness date={data.generatedAt} /></Header>
    <section className="summary-grid">
      <article><span>Active clubs</span><strong>{data.clubs.length}</strong></article>
      <article><span>Tracked members</span><strong>{members.length}</strong></article>
      <article><span>Promotion candidates</span><strong>{counts.promotion}</strong></article>
      <article><span>Needs attention</span><strong>{counts.severe + counts.inactive}</strong></article>
    </section>
    <section className="club-grid">{data.clubs.map((club) => <article className="club-card" key={club.circleId}>
      <div><p className="eyebrow">Rank {club.rank ? `#${club.rank}` : 'unavailable'}</p><h2>{club.name}</h2></div>
      <strong>{compact.format(club.dailyTarget)}<small> fans / member / day</small></strong>
      <div className="club-band"><span>{club.members.length}/30 members</span><Freshness date={club.sourceUpdatedAt} /></div>
    </article>)}</section>
    <ClubSummary clubs={data.clubs} />
    <MemberTable clubs={data.clubs} />
    <PublicApplicants applicants={data.applicants} clubs={data.clubs} />
    <footer>Source: uma.moe · Generated {new Date(data.generatedAt).toLocaleString()}</footer>
  </main>
}

function ClubSettings({ state, reload }: { state: DashboardState; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Club | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const club = {
      circleId: String(form.get('circleId')), name: String(form.get('name')),
      dailyTarget: Number(form.get('dailyTarget')), promotionRatio: Number(form.get('promotionRatio')),
      severeRatio: Number(form.get('severeRatio')), inactiveDays: Number(form.get('inactiveDays')),
      promotionEnabled: form.get('promotionEnabled') === 'on',
    }
    await (editing ? api.updateClub(editing.circleId, club) : api.addClub(club))
    setEditing(null); event.currentTarget.reset(); await reload()
  }
  return <section className="split-layout">
    <form className="panel form-stack" onSubmit={submit} key={editing?.circleId || 'new-club'}>
      <div><p className="eyebrow">Configuration</p><h2>{editing ? 'Edit club' : 'Add club'}</h2></div>
      <label>Circle ID<input name="circleId" required defaultValue={editing?.circleId} readOnly={Boolean(editing)} /></label>
      <label>Display name<input name="name" required defaultValue={editing?.name} /></label>
      <label>Daily requirement<input name="dailyTarget" type="number" min="0" required defaultValue={editing?.dailyTarget || ''} /></label>
      <div className="field-row">
        <label>Promotion ratio<input name="promotionRatio" type="number" min="1" step=".05" defaultValue={editing?.promotionRatio || 1.25} /></label>
        <label>Severe ratio<input name="severeRatio" type="number" min="0" max="1" step=".05" defaultValue={editing?.severeRatio || .5} /></label>
      </div>
      <label>Inactive after days<input name="inactiveDays" type="number" min="1" defaultValue={editing?.inactiveDays || 3} /></label>
      <label className="check"><input name="promotionEnabled" type="checkbox" defaultChecked={editing?.promotionEnabled ?? true} /> Enable promotion-candidate assessments for this club</label>
      <p className="muted">Turn this off for your main club (for example Dust Bunny) where members cannot be promoted further.</p>
      <div className="button-row"><button className="primary">{editing ? 'Save club' : 'Add club'}</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}</div>
    </form>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Requirements</p><h2>Registered clubs</h2></div></div>
      <div className="stack-list">{state.clubs.map((club) => <article key={club.circleId}>
        <div><strong>{club.name}</strong><small className="id">{club.circleId}</small><small className="id">{club.promotionEnabled === false ? 'Promotion disabled' : 'Promotion enabled'}</small></div>
        <span>{number.format(club.dailyTarget)} / day</span>
        <button onClick={() => setEditing(club)}>Edit</button>
        <button className="danger-link" onClick={async () => { if (confirm(`Remove ${club.name}?`)) { await api.deleteClub(club.circleId); await reload() } }}>Remove</button>
      </article>)}</div>
    </section>
  </section>
}

function ApplicantManager({ state, reload }: { state: DashboardState; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Applicant | null>(null)
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('pending')
  const clubNames = new Map(state.clubs.map((club) => [club.circleId, club.name]))
  const statusCounts = state.applicants.reduce<Record<string, number>>((counts, applicant) => {
    counts[applicant.status] = (counts[applicant.status] || 0) + 1
    return counts
  }, {})
  const filtered = state.applicants.filter((applicant) => statusFilter === 'all' || applicant.status === statusFilter)
  const setStatus = async (applicant: Applicant, status: Status) => {
    await api.updateApplicant(applicant.umaId, {
      umaId: applicant.umaId,
      ign: applicant.ign,
      targetClubId: applicant.targetClubId,
      status,
      privateNotes: applicant.privateNotes || '',
      publishPublicly: applicant.publishPublicly ?? true,
    })
    await reload()
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {
      umaId: String(form.get('umaId')), ign: editing?.ign || 'Resolving…',
      targetClubId: String(form.get('targetClubId')), status: String(form.get('status')),
      privateNotes: String(form.get('privateNotes') || ''), publishPublicly: form.get('publishPublicly') === 'on',
    }
    await (editing ? api.updateApplicant(editing.umaId, body) : api.addApplicant(body))
    setEditing(null); event.currentTarget.reset(); await reload()
  }
  return <section className="split-layout applicants-layout">
    <form className="panel form-stack" onSubmit={submit} key={editing?.umaId || 'new-applicant'}>
      <div><p className="eyebrow">Manual intake</p><h2>{editing ? 'Edit applicant' : 'Add applicant'}</h2></div>
      <label>Uma ID<input name="umaId" inputMode="numeric" pattern="\d+" required readOnly={Boolean(editing)} defaultValue={editing?.umaId} /></label>
      <label>Applying to<select name="targetClubId" required defaultValue={editing?.targetClubId}><option value="">Select a club</option>{state.clubs.map((club) => <option key={club.circleId} value={club.circleId}>{club.name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={editing?.status || 'pending'}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Private notes<textarea name="privateNotes" rows={4} defaultValue={editing?.privateNotes} /></label>
      <label className="check"><input name="publishPublicly" type="checkbox" defaultChecked={editing?.publishPublicly ?? true} /> Publish Uma ID, IGN, performance, target club, and status</label>
      <div className="button-row"><button className="primary">{editing ? 'Save applicant' : 'Resolve and add'}</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}</div>
    </form>
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recruitment</p>
          <h2>{filtered.length} applicants</h2>
          <p>{statusFilter === 'all' ? `${state.applicants.length} total` : `${statusCounts[statusFilter] || 0} ${statusFilter}`}</p>
        </div>
      </div>
      <div className="band-filter-row" role="group" aria-label="Filter applicants by status">
        <button type="button" className={`band-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          All<span>{state.applicants.length}</span>
        </button>
        {statusOptions.map((status) => (
          <button
            key={status}
            type="button"
            className={`band-chip status-chip status-${status} ${statusFilter === status ? 'active' : ''}`}
            onClick={() => setStatusFilter(status)}
          >
            {status}<span>{statusCounts[status] || 0}</span>
          </button>
        ))}
      </div>
      <div className="applicant-cards">{filtered.length === 0 ? (
        <p className="muted empty-applicants">No applicants in this status.</p>
      ) : filtered.map((applicant) => <article key={applicant.umaId}>
        <div><strong>{applicant.ign}</strong><small className="id">{applicant.umaId}</small></div>
        <span className={`status status-${applicant.status}`}>{applicant.status}</span>
        <dl>
          <div><dt>Daily average</dt><dd>{number.format(applicant.dailyAverage)}</dd></div>
          <div><dt>Applying to</dt><dd>{clubNames.get(applicant.targetClubId) || applicant.targetClubId}</dd></div>
          <div><dt>Current club</dt><dd>{applicant.currentClubName || '—'}</dd></div>
          <div><dt>Monthly</dt><dd>{number.format(applicant.monthlyGain)}</dd></div>
        </dl>
        <div className="applicant-trend">
          <p className="trend-label">30-day fans</p>
          <TrendChart label={applicant.ign} dailyGains={applicant.dailyGains} height={96} className="applicant-chart" />
        </div>
        <p>{applicant.privateNotes || 'No private notes'}</p>
        <div className="button-row">
          {applicant.status !== 'approved' && (
            <button className="primary" onClick={async () => { await setStatus(applicant, 'approved') }}>Approve</button>
          )}
          {applicant.status !== 'waitlisted' && (
            <button onClick={async () => { await setStatus(applicant, 'waitlisted') }}>Waitlist</button>
          )}
          <button onClick={() => setEditing(applicant)}>Edit</button>
          <button className="danger-link" onClick={async () => { if (confirm(`Delete ${applicant.ign}?`)) { await api.deleteApplicant(applicant.umaId); await reload() } }}>Delete</button>
        </div>
      </article>)}</div>
    </section>
  </section>
}

function originTone(sourceId: string, clubName?: string | null) {
  if (sourceId === 'applicants' || sourceId === 'unassigned') return 'origin-applicant'
  const name = (clubName || '').toLowerCase()
  if (name.includes('dust')) return 'origin-dust'
  if (name.includes('dirt')) return 'origin-dirt'
  if (name.includes('damp')) return 'origin-damp'
  return 'origin-other'
}

function DraggableCard({
  id,
  name,
  meta,
  umaId,
  moved,
  fromLabel,
  originClass,
  kind,
}: {
  id: string
  name: string
  meta: string
  umaId: string
  moved: boolean
  fromLabel?: string | null
  originClass?: string
  kind: 'member' | 'applicant'
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const copyId = async (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    try {
      await navigator.clipboard.writeText(umaId)
    } catch {
      // Clipboard may be unavailable in some environments; selection still helps.
    }
  }
  return <article
    ref={setNodeRef}
    className={`drag-card ${kind} ${moved ? 'moved' : ''} ${originClass || ''} ${isDragging ? 'dragging' : ''}`}
    style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined }}
    {...listeners}
    {...attributes}
  >
    <div className="drag-main">
      <strong>{name}</strong>
      <span>{meta}</span>
      {moved ? (
        <button type="button" className="id-copy" title="Copy Uma ID" onPointerDown={(event) => event.stopPropagation()} onClick={copyId}>
          {umaId}
        </button>
      ) : null}
    </div>
    {moved && fromLabel ? <em className={`move-tag ${originClass || ''}`}>from {fromLabel}</em> : null}
    {kind === 'applicant' && !moved ? <em className="move-tag origin-applicant">applicant</em> : null}
  </article>
}

function Lane({ id, title, count, movedCount, children }: { id: string; title: string; count: number; movedCount: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const capped = !['waitlist', 'kick', 'applicants', 'unassigned'].includes(id)
  return <section ref={setNodeRef} className={`lane ${isOver ? 'over' : ''}`}>
    <header>
      <div>
        <h3>{title}</h3>
        {movedCount > 0 ? <small className="lane-moves">{movedCount} move{movedCount === 1 ? '' : 's'}</small> : null}
      </div>
      <span className={capped && count > 30 ? 'capacity-error' : ''}>{count}{capped && '/30'}</span>
    </header>
    <div className="lane-cards">{children}</div>
  </section>
}

function Planner({ state, reload }: { state: DashboardState; reload: () => Promise<void> }) {
  const clubNames = useMemo(() => new Map(state.clubs.map((club) => [club.circleId, club.name])), [state.clubs])
  const entities = useMemo(() => [
    ...state.members.map((member) => ({
      key: `member:${member.umaId}` as const,
      kind: 'member' as const,
      umaId: member.umaId,
      name: member.ign,
      meta: `${number.format(member.dailyAverage)} / day`,
      fallback: member.circleId || 'applicants',
      sortValue: member.dailyAverage,
    })),
    ...state.applicants
      .filter((applicant) => applicant.status !== 'rejected')
      .map((applicant) => ({
      key: `applicant:${applicant.umaId}` as const,
      kind: 'applicant' as const,
      umaId: applicant.umaId,
      name: applicant.ign,
      meta: `${number.format(applicant.dailyAverage)} / day · ${applicant.status}`,
      fallback: 'applicants',
      sortValue: applicant.dailyAverage,
    })),
  ], [state])
  const [assignments, setAssignments] = useState<Assignment[]>(state.assignments)
  useEffect(() => {
    setAssignments(state.assignments.map((item) => (
      item.destination === 'unassigned' ? { ...item, destination: 'applicants' } : item
    )))
  }, [state.assignments])
  const destination = (entity: typeof entities[number]) => {
    const assigned = assignments.find((item) => `${item.entityType}:${item.entityId}` === entity.key)?.destination
    if (!assigned) return entity.fallback
    return assigned === 'unassigned' ? 'applicants' : assigned
  }
  const lanes = [
    ...state.clubs.map((club) => ({ id: club.circleId, title: club.name })),
    { id: 'waitlist', title: 'Waitlist' },
    { id: 'kick', title: 'Kick / remove' },
    { id: 'applicants', title: 'Applicants' },
  ]
  const movedEntities = entities.filter((entity) => destination(entity) !== entity.fallback)
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const [entityType, entityId] = String(active.id).split(':') as ['member' | 'applicant', string]
    const next = assignments.filter((item) => !(item.entityType === entityType && item.entityId === entityId))
    next.push({ entityType, entityId, destination: String(over.id), position: next.filter((item) => item.destination === over.id).length })
    setAssignments(next)
    try { await api.savePlan(next) } catch (error) { alert((error as Error).message); setAssignments(assignments) }
  }
  const originLabel = (fallback: string) => {
    if (fallback === 'applicants' || fallback === 'unassigned') return 'Applicants'
    return clubNames.get(fallback) || fallback
  }
  return <section className="planner">
    <div className="planner-heading">
      <div>
        <p className="eyebrow">Draft assignments</p>
        <h2>Transfer planner</h2>
        <p>Moves are planning records only and do not change the game. Highlighted cards have been reassigned.</p>
      </div>
      <div className="planner-actions">
        <span className="move-summary">{movedEntities.length} planned move{movedEntities.length === 1 ? '' : 's'}</span>
        <button className="primary" onClick={async () => { await api.confirmPlan(); await reload() }}>Confirm plan</button>
      </div>
    </div>
    <DndContext onDragEnd={onDragEnd}>
      <div className="lanes">{lanes.map((lane) => {
        const cards = entities
          .filter((entity) => destination(entity) === lane.id)
          .sort((a, b) => {
            const aMoved = destination(a) !== a.fallback ? 1 : 0
            const bMoved = destination(b) !== b.fallback ? 1 : 0
            if (aMoved !== bMoved) return bMoved - aMoved
            return b.sortValue - a.sortValue
          })
        const movedCount = cards.filter((entity) => destination(entity) !== entity.fallback).length
        return <Lane key={lane.id} id={lane.id} title={lane.title} count={cards.length} movedCount={movedCount}>
          {cards.map((entity) => {
            const moved = destination(entity) !== entity.fallback
            const originClass = originTone(entity.fallback, clubNames.get(entity.fallback))
            return <DraggableCard
              key={entity.key}
              id={entity.key}
              name={entity.name}
              meta={entity.meta}
              umaId={entity.umaId}
              kind={entity.kind}
              moved={moved}
              fromLabel={moved ? originLabel(entity.fallback) : null}
              originClass={originClass}
            />
          })}
        </Lane>
      })}</div>
    </DndContext>
  </section>
}

function Publisher() {
  const [preview, setPreview] = useState<{ previous: unknown; next: unknown } | null>(null)
  const [message, setMessage] = useState('')
  const load = () => api.preview().then(setPreview).catch((error) => setMessage(error.message))
  useEffect(() => { void load() }, [])
  return <section className="panel publish-panel">
    <div className="section-heading"><div><p className="eyebrow">Sanitized publication</p><h2>Exact public input</h2></div>
      <div className="button-row"><button onClick={load}>Refresh preview</button><button className="primary" onClick={async () => {
        if (!confirm('Publish this sanitized data?')) return
        try { const result = await api.publish(); setMessage(`Published to ${result.destination}`); await load() } catch (error) { setMessage((error as Error).message) }
      }}>Publish</button></div>
    </div>
    <p>Only the next JSON object is published. Private notes, Discord data, credentials, plans, and local paths are rejected server-side.</p>
    {message && <p className="notice">{message}</p>}
    <div className="json-grid"><div><h3>Previously published</h3><pre>{JSON.stringify(preview?.previous, null, 2)}</pre></div><div><h3>Next publication</h3><pre>{JSON.stringify(preview?.next, null, 2)}</pre></div></div>
  </section>
}

function LocalWorkspace() {
  const [tab, setTab] = useState<'overview' | 'applicants' | 'planner' | 'settings' | 'publish'>('overview')
  const [state, setState] = useState<DashboardState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = async () => { try { setState(await api.state()); setError('') } catch (reason) { setError((reason as Error).message) } }
  useEffect(() => { void reload() }, [])
  if (!state) return <main className="center-message"><h1>Local workspace</h1><p>{error || 'Starting local database…'}</p></main>
  return <main className="shell local-shell">
    <Header><div className="button-row"><Freshness date={state.clubs.map((club) => club.syncedAt).filter(Boolean).sort().at(-1)} /><button className="primary" disabled={busy} onClick={async () => {
      setBusy(true); try {
        const next = await api.sync()
        setState(next)
        setError(next.syncErrors?.length
          ? next.syncErrors.map((item) => `${item.id}: ${item.error}`).join(' · ')
          : '')
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>{busy ? 'Refreshing…' : 'Refresh data'}</button></div></Header>
    {error && <p className="notice error">{error}</p>}
    <nav className="tabs" aria-label="Workspace sections">{(['overview', 'applicants', 'planner', 'settings', 'publish'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {tab === 'overview' && <><section className="summary-grid"><article><span>Clubs</span><strong>{state.clubs.length}</strong></article><article><span>Members</span><strong>{state.members.length}</strong></article><article><span>Applicants</span><strong>{state.applicants.length}</strong></article><article><span>Plan status</span><strong className="text-value">{state.board?.status || 'draft'}</strong></article></section><ClubSummary clubs={state.clubs.map((club) => ({ ...club, members: state.members.filter((member) => member.circleId === club.circleId) }))} /><MemberTable clubs={state.clubs} members={state.members} assignments={state.assignments} /></>}
    {tab === 'applicants' && <ApplicantManager state={state} reload={reload} />}
    {tab === 'planner' && <Planner state={state} reload={reload} />}
    {tab === 'settings' && <ClubSettings state={state} reload={reload} />}
    {tab === 'publish' && <Publisher />}
  </main>
}

export default function App() {
  return import.meta.env.VITE_PUBLIC_ONLY === 'true' ? <PublicDashboard /> : <LocalWorkspace />
}
