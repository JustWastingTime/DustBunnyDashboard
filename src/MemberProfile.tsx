import { useEffect, useState } from 'react'
import { api } from './api'
import { site } from './site'
import type { TrainerMiniProfile } from './types'

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

function formatYm(value: string | null | undefined) {
  if (!value) return '—'
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return monthLabel(year, month)
}

export function MemberProfileModal({
  umaId,
  onClose,
}: {
  umaId: string
  onClose: () => void
}) {
  const [profile, setProfile] = useState<TrainerMiniProfile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError('')
    api.staffMemberProfile(umaId)
      .then((payload) => { if (!cancelled) setProfile(payload) })
      .catch((reason) => { if (!cancelled) setError((reason as Error).message) })
    return () => { cancelled = true }
  }, [umaId])

  const stints = profile?.stints || []
  const months = profile?.networkMonths
  const tenure = months == null
    ? '—'
    : `${months} month${months === 1 ? '' : 's'}${profile?.historyIncomplete ? '+' : ''}`

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="panel mini-profile" role="dialog" aria-modal="true" aria-labelledby="mini-profile-title" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Trainer profile</p>
          <h2 id="mini-profile-title">{profile?.ign || 'Loading…'}</h2>
          <p className="muted">{umaId}</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {error && <p className="notice error">{error}</p>}
      {!profile && !error ? <p className="muted">Loading uma.moe club history…</p> : null}
      {profile ? (
        <>
          <p className={`plan-status ${profile.status === 'current' ? 'plan-move' : 'plan-kick'}`}>
            {profile.status === 'current'
              ? `Current · ${profile.currentClubName || `${site.networkName} network`}`
              : profile.status === 'former'
                ? `Former · last ${profile.lastClubName || `${site.networkName} club`}`
                : 'No months in a registered club'}
          </p>
          <dl className="apply-club-meta mini-profile-meta">
            <div><dt>Network tenure</dt><dd>{tenure}</dd></div>
            <div><dt>Since</dt><dd>{formatYm(profile.firstNetworkMonth)}</dd></div>
            <div><dt>Discord</dt><dd className="id" style={{ margin: 0 }}>{profile.discordId || '—'}</dd></div>
          </dl>
          <p className="muted">{profile.historyNote || site.tenureNote}</p>
          {stints.length ? (
            <div>
              <h3 className="mini-profile-sub">Club history</h3>
              <ul className="mini-profile-stints">
                {stints.map((stint, index) => (
                  <li key={`${stint.circleId}-${index}`}>
                    <strong>{stint.circleName}</strong>
                    <span>
                      {monthLabel(stint.startYear, stint.startMonth)}
                      {' – '}
                      {profile.status === 'current' && index === stints.length - 1
                        ? 'present'
                        : monthLabel(stint.endYear, stint.endMonth)}
                      {` · ${stint.monthCount} mo`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="button-row">
            <a className="button-link" href={profile.umaMoeUrl} target="_blank" rel="noreferrer">uma.moe profile</a>
          </div>
        </>
      ) : null}
    </section>
  </div>
}
