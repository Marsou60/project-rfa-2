import { useEffect, useState, useRef } from 'react'
import { genieQuery, exportSmartPlansExcel, getEntities } from '../api/client'
import uiLogo from '../assets/ui-logo.png'

const QUERIES = [
  { id: 'dashboard', icon: '📊', label: 'Vue d\'ensemble', q: 'dashboard', desc: 'Balance + alertes + opportunités' },
  { id: 'balance', icon: '💰', label: 'Balance E/S', q: 'balance', desc: 'Entrant vs Sortant par ligne' },
  { id: 'top_gains', icon: '🏆', label: 'Top gains', q: 'top_gains', desc: 'Meilleurs gains adhérents' },
  { id: 'near', icon: '🎯', label: 'Objectifs proches', q: 'near_by_objective', desc: 'Par plateforme / tri-partite' },
  { id: 'levers', icon: '🤝', label: 'Leviers Union', q: 'union_opportunities', desc: 'Croisements E/S' },
  { id: 'detail', icon: '🔥', label: 'Levier détaillé', q: 'double_lever', desc: 'Marge nette par ligne' },
  { id: 'plan', icon: '💎', label: 'Plans d\'achat', q: 'smart_plan', desc: 'Multi-paliers, mêmes €' },
  { id: 'cascade', icon: '🌊', label: 'Cascade', q: 'cascade', desc: 'Impact multi-niveaux' },
]

// ─── Mindmap Node ────────────────────────────────────────────
function MindmapNode({ node, depth = 0, isLast = false }) {
  // Ouvert par défaut si profondeur faible ET pas trop d'enfants (sinon on replie pour la lisibilité)
  const [open, setOpen] = useState(depth < 2 && (!node.children || node.children.length <= 8))
  const colors = [
    'from-violet-500 to-indigo-500', 'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500', 'from-purple-500 to-fuchsia-500',
  ]
  const color = colors[depth % colors.length]
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className={`relative ${depth > 0 ? 'ml-6' : ''}`}>
      {/* Connector line */}
      {depth > 0 && (
        <div className="absolute -left-4 top-0 bottom-0 w-px bg-white/10" />
      )}
      {depth > 0 && (
        <div className="absolute -left-4 top-4 w-4 h-px bg-white/10" />
      )}

      <div
        onClick={() => hasChildren && setOpen(!open)}
        className={`group flex items-start gap-2 py-1.5 ${hasChildren ? 'cursor-pointer' : ''}`}
      >
        {/* Dot / expand */}
        <div className={`flex-shrink-0 mt-1 w-5 h-5 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-md transition-transform duration-200 ${open && hasChildren ? 'rotate-0' : hasChildren ? '-rotate-90' : ''}`}>
          {hasChildren ? (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {node.icon && <span className="text-sm">{node.icon}</span>}
            <span className={`font-semibold ${depth === 0 ? 'text-white text-sm' : 'text-blue-100/90 text-xs'}`}>{node.label}</span>
            {node.badge && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                node.badgeColor === 'red' ? 'bg-red-500/20 text-red-300' :
                node.badgeColor === 'amber' ? 'bg-amber-500/20 text-amber-300' :
                node.badgeColor === 'green' ? 'bg-emerald-500/20 text-emerald-300' :
                'bg-white/10 text-blue-300'
              }`}>{node.badge}</span>
            )}
          </div>
          {node.detail && (
            <div className="text-[11px] text-blue-300/50 mt-0.5 leading-relaxed">{node.detail}</div>
          )}
          {node.value && (
            <div className={`text-xs font-bold mt-0.5 ${node.valueColor === 'green' ? 'text-emerald-400' : node.valueColor === 'red' ? 'text-red-400' : 'text-white/80'}`}>{node.value}</div>
          )}
        </div>
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div className="animate-genie-expand">
          {node.children.map((child, i) => (
            <MindmapNode key={i} node={child} depth={depth + 1} isLast={i === node.children.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExpandableSection({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-2 hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className={`w-4 h-4 rounded flex items-center justify-center bg-white/5 transition-transform ${open ? 'rotate-90' : ''}`}>
          <svg className="w-2.5 h-2.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {title}
      </button>
      {open && <div className="p-2 border-t border-white/[0.06] animate-genie-expand">{children}</div>}
    </div>
  )
}

// ─── Build mindmap from alerts/data ─────────────────────────
function buildMindmap(msg) {
  const nodes = []
  const t = msg.resultType
  const data = msg.data

  // ── Alertes (dashboard) ──
  if (msg.alerts && msg.alerts.length > 0) {
    nodes.push({
      icon: '🚨', label: `Alertes (${msg.alerts.length})`,
      badge: msg.alerts.filter(a => a.priority === 'critical').length > 0 ? 'CRITIQUE' : `${msg.alerts.length}`,
      badgeColor: msg.alerts.some(a => a.priority === 'critical') ? 'red' : 'amber',
      children: msg.alerts.map(a => ({
        icon: a.priority === 'critical' ? '⚠️' : a.priority === 'high' ? '🔥' : '💡',
        label: a.title,
        detail: a.message,
        badge: a.priority === 'critical' ? 'Perte' : a.priority === 'high' ? 'Urgent' : 'Info',
        badgeColor: a.priority === 'critical' ? 'red' : a.priority === 'high' ? 'amber' : 'green',
      }))
    })
  }

  // ── Dashboard summary ──
  if (t === 'dashboard' && data && !Array.isArray(data)) {
    const s = data
    nodes.push({
      icon: '📊', label: 'Synthèse', children: [
        { icon: '👥', label: `${s.total_clients || 0} adhérents analysés` },
        { icon: '🎯', label: `${s.total_near || 0} objectifs proches`, badge: `${s.total_near || 0}`, badgeColor: 'amber' },
        { icon: '✅', label: `${s.total_achieved || 0} objectifs atteints`, badge: `${s.total_achieved || 0}`, badgeColor: 'green' },
        { icon: '💰', label: 'Gain potentiel adhérents', value: fmt(s.total_gain_potential), valueColor: 'green' },
      ]
    })
    nodes.push({
      icon: '🏢', label: 'Union (fournisseurs)', children: [
        { icon: '📥', label: 'Total entrant', value: fmt(s.total_entrant), valueColor: 'green' },
        { icon: '📤', label: 'Total sortant', value: fmt(s.total_sortant), valueColor: 'red' },
        { icon: s.total_margin >= 0 ? '✅' : '⚠️', label: 'Marge nette', value: fmt(s.total_margin), valueColor: s.total_margin >= 0 ? 'green' : 'red' },
        { icon: '🔥', label: `${s.union_near_count || 0} palier(s) fournisseur proches`, badge: `${s.union_near_count || 0}`, badgeColor: 'amber' },
      ]
    })
  }

  // ── Balance ──
  if (t === 'balance' && Array.isArray(data)) {
    const active = data.filter(b => b.entrant > 0 || b.sortant > 0)
    const losses = active.filter(b => b.margin < 0)
    const gains = active.filter(b => b.margin >= 0)
    if (losses.length > 0) {
      nodes.push({
        icon: '📉', label: `Pertes (${losses.length})`, badge: fmt(losses.reduce((s, b) => s + b.margin, 0)), badgeColor: 'red',
        children: losses.map(b => ({
          icon: '⚠️', label: b.label,
          detail: `📥 ${fmt(b.entrant)} | 📤 ${fmt(b.sortant)}${b.union_progress ? ` | Union ${(b.union_progress).toFixed(0)}%` : ''}`,
          value: fmt(b.margin), valueColor: 'red',
          badge: b.nb_adherents_paid ? `${b.nb_adherents_paid} adh.` : null,
        }))
      })
    }
    if (gains.length > 0) {
      nodes.push({
        icon: '✅', label: `Marges (${gains.length})`, badge: `+${fmt(gains.reduce((s, b) => s + b.margin, 0))}`, badgeColor: 'green',
        children: gains.map(b => ({
          icon: '💰', label: b.label,
          detail: `📥 ${fmt(b.entrant)} | 📤 ${fmt(b.sortant)}`,
          value: `+${fmt(b.margin)}`, valueColor: 'green',
        }))
      })
    }
  }

  // ── Top gains / search ──
  if ((t === 'top_gains' || t === 'search_result') && Array.isArray(data)) {
    nodes.push({
      icon: '🏆', label: `Résultats (${data.length})`,
      children: data.slice(0, 15).map(r => ({
        icon: r.achieved ? '✅' : r.near ? '🔥' : '📌',
        label: `${r.entity_label || r.entity_id || '?'}`,
        detail: `${r.label} | CA: ${fmt(r.ca)} | Manque: ${fmt(r.missing_ca)}`,
        value: r.projected_gain > 0 ? `+${fmt(r.projected_gain)}` : null, valueColor: 'green',
        badge: `${(r.progress || 0).toFixed(0)}%`,
        badgeColor: (r.progress || 0) >= 90 ? 'green' : (r.progress || 0) >= 80 ? 'amber' : null,
      }))
    })
  }

  // ── Near by objective ──
  if (t === 'near_by_objective' && Array.isArray(data)) {
    data.slice(0, 10).forEach(obj => {
      const entries = (obj.entries || []).slice(0, 100)
      nodes.push({
        icon: '🎯', label: obj.label || obj.key, badge: `${obj.count} adh.`, badgeColor: 'amber',
        value: `Gain total: ${fmt(obj.total_gain)}`, valueColor: 'green',
        children: entries.map(e => ({
          icon: '👤', label: e.entity_label || e.entity_id,
          detail: `CA: ${fmt(e.ca)} | ${(e.progress || 0).toFixed(0)}% | Manque: ${fmt(e.missing_ca)}`,
          value: e.projected_gain > 0 ? `+${fmt(e.projected_gain)}` : null, valueColor: 'green',
        }))
      })
    })
  }

  // ── Union opportunities ──
  if (t === 'union_opportunities' && Array.isArray(data)) {
    data.slice(0, 5).forEach(opp => {
      const u = opp.union_objective || {}
      const adhs = (opp.matching_adherents || []).slice(0, 100)
      const contribs = (opp.top_contributors || []).slice(0, 10)
      nodes.push({
        icon: '🤝', label: u.label || '?',
        badge: `Marge: ${fmt(opp.net_margin)}`, badgeColor: (opp.net_margin || 0) >= 0 ? 'green' : 'red',
        children: [
          { icon: '📥', label: `Entrant Union`, detail: `${(u.progress || 0).toFixed(0)}% | Manque: ${fmt(u.missing_ca)}`, value: `+${fmt(opp.union_gain)}`, valueColor: 'green' },
          { icon: '📤', label: `Sortant (${opp.count_near || 0} adh.)`, value: `-${fmt(opp.total_gain_adherents)}`, valueColor: 'red',
            children: adhs.map(a => ({
              icon: '👤', label: a.entity_label || a.entity_id,
              detail: `CA: ${fmt(a.ca)} | ${(a.progress || 0).toFixed(0)}%`,
              value: a.adherent_gain > 0 ? `-${fmt(a.adherent_gain)}` : null, valueColor: 'red',
            }))
          },
          contribs.length > 0 ? {
            icon: '📊', label: 'Top contributeurs',
            children: contribs.map(c => ({ icon: '🏪', label: c.entity_label, value: fmt(c.ca_on_key) }))
          } : null,
        ].filter(Boolean)
      })
    })
  }

  // ── Double lever ──
  if (t === 'double_lever' && Array.isArray(data)) {
    data.slice(0, 3).forEach(opp => {
      const u = opp.union_objective || {}
      nodes.push({
        icon: '🔥', label: u.label || '?',
        children: [
          { icon: '📥', label: 'Gain entrant', value: `+${fmt(opp.union_gain)}`, valueColor: 'green' },
          { icon: '📤', label: 'Coût sortant', value: `-${fmt(opp.total_gain_adherents)}`, valueColor: 'red' },
          { icon: '💰', label: 'Marge nette', value: fmt(opp.net_margin), valueColor: (opp.net_margin || 0) >= 0 ? 'green' : 'red',
            badge: (opp.net_margin || 0) >= 0 ? 'Rentable' : 'Déficit', badgeColor: (opp.net_margin || 0) >= 0 ? 'green' : 'red' },
          { icon: '👥', label: `${opp.count_near || 0} adhérents proches`,
            children: (opp.matching_adherents || []).slice(0, 100).map(a => ({
              icon: '👤', label: a.entity_label || a.entity_id,
              detail: `CA: ${fmt(a.ca)} | ${(a.progress || 0).toFixed(0)}% | Manque: ${fmt(a.missing_ca)}`,
            }))
          },
        ]
      })
    })
  }

  // ── Smart plans ──
  if (t === 'smart_plan' && Array.isArray(data)) {
    data.slice(0, 10).forEach(plan => {
      const items = plan.plan_items || []
      const bonusOk = plan.bonus_reasonable && plan.bonus_effort > 0
      nodes.push({
        icon: plan.tiers_unlocked >= 3 ? '🏆' : '💎',
        label: plan.entity_label || plan.entity_id,
        badge: `${bonusOk ? plan.tiers_with_bonus : plan.tiers_unlocked} paliers`,
        badgeColor: 'green',
        children: [
          { icon: '📦', label: plan.global_label,
            detail: `CA: ${fmt(plan.global_ca)} → Palier: ${fmt(plan.global_ca + plan.global_missing)} (manque ${fmt(plan.global_missing)})`,
            badge: plan.global_unlocked ? '✅ Débloqué' : bonusOk ? `+${fmt(plan.bonus_effort)}` : null,
            badgeColor: plan.global_unlocked ? 'green' : 'amber',
          },
          ...items.map(it => ({
            icon: '🎯', label: it.label,
            detail: `CA: ${fmt(it.ca)} (${(it.progress || 0).toFixed(0)}%) → Pousser ${fmt(it.ca_to_push)}`,
            value: `+${fmt(it.projected_gain)} RFA`, valueColor: 'green',
          })),
          { icon: '💰', label: 'Option A', value: `${fmt(plan.total_ca_needed)} → +${fmt(plan.gain_option_a)} RFA`, valueColor: 'green' },
          ...(bonusOk ? [{
            icon: '🔥', label: 'Option B (bonus)',
            value: `${fmt(plan.total_with_bonus)} → +${fmt(plan.gain_option_b)} RFA`,
            valueColor: 'green',
            badge: `+${fmt(plan.bonus_effort)} pour le global`, badgeColor: 'amber',
          }] : []),
        ]
      })
    })
  }

  // ── Cascade ──
  if (t === 'cascade' && Array.isArray(data)) {
    // Group by entity
    const byEntity = {}
    data.slice(0, 30).forEach(c => {
      if (!byEntity[c.entity_id]) byEntity[c.entity_id] = { label: c.entity_label, items: [] }
      byEntity[c.entity_id].items.push(c)
    })
    Object.values(byEntity).slice(0, 8).forEach(group => {
      nodes.push({
        icon: '🌊', label: group.label,
        children: group.items.slice(0, 3).map(c => ({
          icon: '🎯', label: c.tri_label, badge: `${c.nb_impacts} impacts`, badgeColor: c.nb_impacts >= 3 ? 'green' : 'amber',
          children: [
            { icon: (c.tri_progress || 0) >= 80 ? '✅' : '⬜', label: `Tri sortant (${(c.tri_progress || 0).toFixed(0)}%)`, detail: `Manque: ${fmt(c.tri_missing)}` },
            { icon: (c.global_progress || 0) >= 80 ? '✅' : '⬜', label: `Global sortant ${c.global_label} (${(c.global_progress || 0).toFixed(0)}%)` },
            { icon: (c.union_tri_progress || 0) >= 80 ? '✅' : '⬜', label: `Tri entrant Union (${(c.union_tri_progress || 0).toFixed(0)}%)` },
            { icon: (c.union_global_progress || 0) >= 80 ? '✅' : '⬜', label: `Global entrant Union (${(c.union_global_progress || 0).toFixed(0)}%)` },
          ]
        }))
      })
    })
  }

  // ── Fiche adhérent (Parle-moi de...) ──
  if (t === 'entity_profile' && data && !Array.isArray(data)) {
    const p = data
    const identityChildren = [
      { icon: '📋', label: 'Identité', detail: `Code: ${p.entity_id} | Contrat: ${p.contract_name || '—'}` },
      { icon: '💰', label: 'RFA totale', value: fmt(p.total_rfa), valueColor: 'green' },
      { icon: '📊', label: 'Objectifs', detail: `${p.achieved_count || 0} atteint(s) | ${p.near_count || 0} proche(s) | Gain potentiel: ${fmt(p.gain_potential)}`, valueColor: 'green' },
    ]
    if (p.entity_type === 'group' && p.group_codes_union && p.group_codes_union.length > 0) {
      identityChildren.push({
        icon: '👥', label: 'Clients du groupe',
        detail: p.group_codes_union.slice(0, 12).join(', ') + (p.group_codes_union.length > 12 ? ` (+${p.group_codes_union.length - 12})` : ''),
      })
    }
    nodes.push({
      icon: '👤', label: p.entity_label || p.entity_id,
      badge: p.entity_type === 'group' ? 'Groupe' : 'Client', badgeColor: 'green',
      children: identityChildren,
    })
    if (p.scenario_plus_50k && p.scenario_plus_50k.length > 0) {
      const top = p.scenario_plus_50k[0]
      nodes.push({
        icon: '➕', label: 'Si +50 K€',
        detail: `Meilleure opportunité: ${top.label}`,
        value: `+${fmt(top.gain)} RFA`, valueColor: 'green',
        children: p.scenario_plus_50k.slice(0, 4).map(s => ({
          icon: '🎯', label: s.label, value: `+${fmt(s.gain)}`, valueColor: 'green',
        })),
      })
    }
    if (p.scenario_moins_50k && p.scenario_moins_50k.length > 0) {
      const topRisk = p.scenario_moins_50k[0]
      nodes.push({
        icon: '➖', label: 'Si -50 K€',
        detail: `Risque principal: ${topRisk.label}`,
        value: `-${fmt(topRisk.loss)} RFA`, valueColor: 'red',
        children: p.scenario_moins_50k.slice(0, 4).map(s => ({
          icon: '⚠️', label: s.label, value: `-${fmt(s.loss)}`, valueColor: 'red',
        })),
      })
    }
    if (p.development_opportunities && p.development_opportunities.filter(o => (o.if_add_50k_gain || 0) > 0).length > 0) {
      nodes.push({
        icon: '📈', label: 'Possibilités de développement',
        detail: '+50 K€ ciblé par ligne',
        children: p.development_opportunities
          .filter(o => (o.if_add_50k_gain || 0) > 0)
          .slice(0, 6)
          .map(o => ({
            icon: '🎯', label: o.label,
            detail: `CA: ${fmt(o.current_ca)}`,
            value: `+${fmt(o.if_add_50k_gain)}`, valueColor: 'green',
          })),
      })
    }
    if (p.global_rows && p.global_rows.length > 0) {
      nodes.push({
        icon: '📈', label: 'Global (plateformes)',
        children: p.global_rows.slice(0, 8).map(r => ({
          icon: r.achieved ? '✅' : r.near ? '🔥' : '⬜',
          label: r.label,
          detail: `CA: ${fmt(r.ca)} (${(r.progress || 0).toFixed(0)}%)`,
          value: r.near && r.projected_gain ? `+${fmt(r.projected_gain)}` : null, valueColor: 'green',
        }))
      })
    }
    if (p.tri_rows && p.tri_rows.length > 0) {
      nodes.push({
        icon: '📦', label: 'Tri-partites',
        children: p.tri_rows.slice(0, 8).map(r => ({
          icon: r.achieved ? '✅' : r.near ? '🔥' : '⬜',
          label: r.label,
          detail: `CA: ${fmt(r.ca)} (${(r.progress || 0).toFixed(0)}%)`,
          value: r.near && r.projected_gain ? `+${fmt(r.projected_gain)}` : null, valueColor: 'green',
        }))
      })
    }
    if (p.smart_plans && p.smart_plans.length > 0) {
      nodes.push({
        icon: '🎯', label: `Plans d'achat (${p.smart_plans.length})`,
        children: p.smart_plans.slice(0, 3).map(pl => ({
          icon: '💎', label: pl.global_label,
          detail: `${pl.tiers_unlocked} palier(s) avec ${fmt(pl.total_ca_needed)}`,
          value: `+${fmt(pl.gain_option_a)}`, valueColor: 'green',
        }))
      })
    }
    if (p.cascade && p.cascade.length > 0) {
      nodes.push({
        icon: '🌊', label: `Effet cascade (${p.cascade.length})`,
        detail: '1 € peut impacter jusqu\'à 4 paliers',
        children: p.cascade.slice(0, 3).map(c => ({
          icon: '🎯', label: c.tri_label, badge: `${c.nb_impacts} impacts`, badgeColor: 'amber',
        }))
      })
    }
  }

  return nodes.length > 0 ? nodes : null
}

function fmt(v) {
  if (!v && v !== 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

// ─── Main Component ─────────────────────────────────────────
function GeniePage({ importId }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [exporting, setExporting] = useState(false)
  const [typing, setTyping] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [viewMode, setViewMode] = useState('chat') // 'chat' | 'mindmap' | 'parle_moi_de'
  const [entitySearch, setEntitySearch] = useState('')
  const [entities, setEntities] = useState([])
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  // Charger clients + groupes quand on ouvre l'onglet "Parle-moi de..."
  useEffect(() => {
    if (viewMode !== 'parle_moi_de' || !importId) return
    setEntitiesLoading(true)
    Promise.all([getEntities(importId, 'client'), getEntities(importId, 'group')])
      .then(([clients, groups]) => {
        const merged = [...(clients || []).map(e => ({ ...e, _source: 'client' })), ...(groups || []).map(e => ({ ...e, _source: 'group' }))]
        setEntities(merged)
      })
      .catch(() => setEntities([]))
      .finally(() => setEntitiesLoading(false))
  }, [viewMode, importId])

  const send = async (queryType, params = {}, label = '') => {
    if (!importId) return
    setShowWelcome(false)
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, from: 'user', text: label || queryType, ts: new Date() }])
    setTyping(true); setLoading(true)
    try {
      const r = await genieQuery(importId, queryType, params)
      setMessages(prev => [...prev, { id: `g-${Date.now()}`, from: 'genie', text: r.message || '', data: r.data, alerts: r.alerts, resultType: r.type, ts: new Date() }])
    } catch (err) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, from: 'genie', text: `Erreur: ${err.response?.data?.detail || err.message}`, isError: true, ts: new Date() }])
    } finally { setTyping(false); setLoading(false) }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send('search_adherent', { search: input.trim() }, `🔍 ${input.trim()}`)
    setInput('')
  }

  const md = (t) => t ? t.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>').replace(/### (.*?)(\n|$)/g, '<div class="text-sm font-extrabold text-violet-300 mt-3 mb-1">$1</div>').replace(/\n/g, '<br/>') : ''

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-6 -mt-6">

      {/* ═══ HEADER ═══ */}
      <div className="flex-shrink-0 border-b border-white/5 bg-[#0d0d1f]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="relative">
            <img src={uiLogo} alt="U.I." className="w-10 h-10 rounded-2xl object-cover shadow-xl shadow-violet-600/30" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0d0d1f]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white tracking-tight">UNION <span className="text-violet-400">Intelligence</span></h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/20">U.I.</span>
            </div>
            <p className="text-[11px] text-blue-300/40">Le cerveau commercial du Groupement Union</p>
          </div>
          {/* View toggle */}
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button onClick={() => setViewMode('chat')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'chat' ? 'bg-violet-500 text-white shadow-md' : 'text-blue-300/50 hover:text-white'}`}>💬 Chat</button>
            <button onClick={() => setViewMode('mindmap')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'mindmap' ? 'bg-violet-500 text-white shadow-md' : 'text-blue-300/50 hover:text-white'}`}>🧠 Mindmap</button>
            <button onClick={() => setViewMode('parle_moi_de')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'parle_moi_de' ? 'bg-violet-500 text-white shadow-md' : 'text-blue-300/50 hover:text-white'}`}>👤 Parle-moi de...</button>
          </div>
          <button onClick={async () => { if (!importId) return; setExporting(true); try { await exportSmartPlansExcel(importId) } catch(e){alert(e.message)} finally{setExporting(false)} }} disabled={exporting || !importId} className="px-2.5 py-1.5 bg-white/5 border border-white/10 text-blue-200/60 hover:text-white rounded-lg text-[10px] font-semibold transition-all disabled:opacity-30 hover:bg-white/10">
            {exporting ? '⏳' : '📊'} Excel
          </button>
          <button onClick={() => { setMessages([]); setShowWelcome(true) }} className="px-2.5 py-1.5 bg-white/5 border border-white/10 text-blue-200/60 hover:text-white rounded-lg text-[10px] font-semibold transition-all hover:bg-white/10">
            ✨ Nouveau
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto bg-[#0a0a1a]" style={{ minHeight: 0 }}>

        {/* Panneau "Parle-moi de..." : choix d'un adhérent */}
        {viewMode === 'parle_moi_de' && (
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">👤</span>
                <h3 className="text-sm font-bold text-white">Parle-moi de...</h3>
              </div>
              <p className="text-[11px] text-blue-300/50 mb-3">Choisissez un adhérent ou un groupe par nom/code Union. <strong>nom</strong> ou son <strong>code Union</strong>. U.I. affiche tout (dont ±50 K€ et développement) ce qu’il sait : contrat, RFA, objectifs, plans d’achat, effet cascade.</p>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <input
                    type="text"
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Nom, code Union ou groupe..."
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-blue-300/30 text-sm outline-none focus:border-violet-500/40"
                    disabled={!importId || loading}
                  />
                </div>
                <button
                  onClick={() => {
                    if (!entitySearch.trim()) return
                    setShowWelcome(false)
                    send('entity_profile', { search: entitySearch.trim() }, `👤 Parle-moi de : ${entitySearch.trim()}`)
                  }}
                  disabled={!importId || loading || !entitySearch.trim()}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-30 hover:shadow-lg hover:shadow-violet-600/20 transition-all"
                >
                  Voir la fiche
                </button>
              </div>
              {entitiesLoading ? (
                <div className="mt-3 text-[11px] text-blue-300/40">Chargement des adhérents...</div>
              ) : entities.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] text-blue-300/40 font-semibold uppercase tracking-wider mb-1.5">Suggestion (cliquez pour remplir)</div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {entities
                      .filter(e => !entitySearch.trim() || (e.id || '').toLowerCase().includes(entitySearch.toLowerCase()) || (e.label || '').toLowerCase().includes(entitySearch.toLowerCase()))
                      .slice(0, 40)
                      .map((e, i) => (
                        <button
                          key={`${e.id}-${i}`}
                          type="button"
                          onClick={() => setEntitySearch(e.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[11px] text-white/80 hover:bg-white/[0.1] hover:border-violet-500/30 hover:text-white transition-all truncate max-w-[220px]"
                        >
                          {e.label || e.id}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Welcome */}
        {showWelcome && messages.length === 0 && viewMode !== 'parle_moi_de' && (
          <div className="max-w-3xl mx-auto px-4 flex flex-col items-center justify-center h-full">
            <img src={uiLogo} alt="Union Intelligence" className="w-24 h-24 rounded-3xl object-cover mb-5 shadow-2xl shadow-violet-600/30" />
            <h2 className="text-xl font-extrabold text-white mb-1">UNION <span className="text-violet-400">Intelligence</span></h2>
            <p className="text-blue-300/40 text-xs mb-1">Le cerveau commercial du Groupement Union</p>
            <p className="text-blue-300/25 text-[10px] mb-8">Analyse croisée contrats fournisseurs × contrats adhérents × plans d'achat optimisés</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
              {QUERIES.map(q => (
                <button key={q.id} onClick={() => send(q.q, {}, `${q.icon} ${q.label}`)} disabled={loading || !importId}
                  className="group text-left p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.06] transition-all duration-200 disabled:opacity-30">
                  <div className="text-xl mb-1.5">{q.icon}</div>
                  <div className="text-[11px] font-bold text-white/80 group-hover:text-white">{q.label}</div>
                  <div className="text-[10px] text-blue-300/30 leading-tight mt-0.5">{q.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {(!showWelcome || messages.length > 0) && (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className="animate-genie-slide">
                {msg.from === 'user' ? (
                  /* User message - ChatGPT style: full width, darker bg */
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-white font-extrabold">V</span>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-300/30 font-semibold mb-0.5">VOUS</div>
                      <div className="text-sm text-white/90 font-medium">{msg.text}</div>
                    </div>
                  </div>
                ) : (
                  /* Genie message */
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 shadow-lg shadow-violet-600/20">
                      <img src={uiLogo} alt="U.I." className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-violet-400/50 font-semibold mb-1">UNION INTELLIGENCE</div>

                      {/* Mindmap view: carte mentale UNIQUEMENT */}
                      {viewMode === 'mindmap' && (() => {
                        const nodes = buildMindmap(msg)
                        if (!nodes) {
                          // Fallback: afficher le texte si pas de mindmap possible
                          return <div className={`text-[13px] leading-relaxed ${msg.isError ? 'text-red-300' : 'text-blue-100/80'}`} dangerouslySetInnerHTML={{ __html: md(msg.text) }} />
                        }
                        return (
                          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                            <div className="text-[10px] text-violet-400/50 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                              <span>🧠 Carte Mentale</span>
                              <div className="flex-1 h-px bg-white/5" />
                            </div>
                            {nodes.map((node, i) => (
                              <MindmapNode key={i} node={node} depth={0} />
                            ))}
                          </div>
                        )
                      })()}

                      {/* Chat view (ou Parle-moi de...) : texte + alertes + tableaux */}
                      {(viewMode === 'chat' || viewMode === 'parle_moi_de') && (
                        <div className={`text-[13px] leading-relaxed ${msg.isError ? 'text-red-300' : 'text-blue-100/80'}`}
                          dangerouslySetInnerHTML={{ __html: md(msg.text) }}
                        />
                      )}

                      {(viewMode === 'chat' || viewMode === 'parle_moi_de') && msg.alerts && msg.alerts.length > 0 && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {msg.alerts.map((a, i) => (
                            <div key={i} className={`rounded-xl p-3 border backdrop-blur-sm ${
                              a.priority === 'critical' ? 'bg-red-500/10 border-red-500/20' :
                              a.priority === 'high' ? 'bg-amber-500/10 border-amber-500/20' :
                              'bg-blue-500/10 border-blue-500/20'
                            }`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-sm">{a.priority === 'critical' ? '⚠️' : a.priority === 'high' ? '🔥' : '💡'}</span>
                                <span className="text-[11px] font-bold text-white/90">{a.title}</span>
                              </div>
                              <div className="text-[10px] text-blue-200/50 leading-relaxed">{a.message}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Chat view: table (top_gains, search_result) */}
                      {(viewMode === 'chat' || viewMode === 'parle_moi_de') && msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (msg.resultType === 'top_gains' || msg.resultType === 'search_result') && (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06]">
                          <table className="w-full text-[11px]">
                            <thead><tr className="bg-white/[0.03] border-b border-white/[0.06]">
                              <th className="px-3 py-2 text-left text-blue-300/40 font-semibold">Adhérent</th>
                              <th className="px-3 py-2 text-left text-blue-300/40 font-semibold">Objectif</th>
                              <th className="px-3 py-2 text-right text-blue-300/40 font-semibold">CA</th>
                              <th className="px-3 py-2 text-center text-blue-300/40 font-semibold">%</th>
                              <th className="px-3 py-2 text-right text-blue-300/40 font-semibold">Manque</th>
                              <th className="px-3 py-2 text-right text-emerald-400/60 font-semibold">Gain</th>
                            </tr></thead>
                            <tbody>{msg.data.slice(0, 12).map((r, i) => (
                              <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 py-2 text-white/80 font-medium max-w-[140px] truncate">{r.entity_label || r.entity_id}</td>
                                <td className="px-3 py-2 text-blue-200/40">{r.label}</td>
                                <td className="px-3 py-2 text-right text-white/70 font-semibold">{fmt(r.ca)}</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${(r.progress||0) >= 90 ? 'bg-emerald-400' : (r.progress||0) >= 80 ? 'bg-amber-400' : 'bg-blue-400/40'}`} style={{width:`${Math.min(r.progress||0,100)}%`}} />
                                    </div>
                                    <span className="text-[10px] text-blue-300/50 font-bold w-8">{(r.progress||0).toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right text-blue-300/30">{fmt(r.missing_ca)}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-400">{r.projected_gain > 0 ? `+${fmt(r.projected_gain)}` : '—'}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}

                      {/* Chat view: Near by objective (Expandable) */}
                      {(viewMode === 'chat' || viewMode === 'parle_moi_de') && msg.data && Array.isArray(msg.data) && msg.resultType === 'near_by_objective' && (
                        <div className="mt-3 space-y-2">
                          {msg.data.map((obj, i) => (
                            <ExpandableSection key={i} title={
                              <div className="flex items-center justify-between w-full pr-2">
                                <span className="font-semibold text-white/90">{obj.label || obj.key}</span>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/20">{obj.count} adh.</span>
                                  <span className="text-emerald-400 font-bold">{fmt(obj.total_gain)}</span>
                                </div>
                              </div>
                            }>
                              <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                <table className="w-full text-[10px]">
                                  <thead><tr className="bg-white/[0.03] border-b border-white/[0.06]">
                                    <th className="px-2 py-1.5 text-left text-blue-300/40">Adhérent</th>
                                    <th className="px-2 py-1.5 text-right text-blue-300/40">CA</th>
                                    <th className="px-2 py-1.5 text-center text-blue-300/40">%</th>
                                    <th className="px-2 py-1.5 text-right text-blue-300/40">Manque</th>
                                    <th className="px-2 py-1.5 text-right text-emerald-400/60">Gain</th>
                                  </tr></thead>
                                  <tbody>
                                    {obj.entries.sort((a, b) => (b.projected_gain || 0) - (a.projected_gain || 0)).map((e, idx) => (
                                      <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                        <td className="px-2 py-1.5 text-white/80 font-medium truncate max-w-[150px]" title={e.entity_label || e.entity_id}>{e.entity_label || e.entity_id}</td>
                                        <td className="px-2 py-1.5 text-right text-white/60">{fmt(e.ca)}</td>
                                        <td className="px-2 py-1.5 text-center">
                                          <span className={`${(e.progress||0) >= 90 ? 'text-emerald-400' : 'text-amber-400'} font-bold`}>{(e.progress||0).toFixed(0)}%</span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-blue-300/30">{fmt(e.missing_ca)}</td>
                                        <td className="px-2 py-1.5 text-right font-bold text-emerald-400">{e.projected_gain > 0 ? `+${fmt(e.projected_gain)}` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </ExpandableSection>
                          ))}
                        </div>
                      )}

                      <div className="text-[9px] text-blue-300/20 mt-2">{msg.ts?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Typing */}
            {typing && (
              <div className="flex gap-3 items-start animate-genie-slide">
                <div className="w-7 h-7 rounded-lg overflow-hidden shadow-lg shadow-violet-600/20">
                  <img src={uiLogo} alt="U.I." className="w-full h-full object-cover" />
                </div>
                <div className="flex items-center gap-1.5 py-2">
                  <div className="w-2 h-2 bg-violet-400/60 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                  <div className="w-2 h-2 bg-violet-400/60 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                  <div className="w-2 h-2 bg-violet-400/60 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ═══ INPUT BAR ═══ */}
      <div className="flex-shrink-0 border-t border-white/5 bg-[#0d0d1f]">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Quick chips */}
          <div className="flex gap-1 mb-2 overflow-x-auto pb-1 scrollbar-hide">
            {QUERIES.map(q => (
              <button key={q.id} onClick={() => send(q.q, {}, `${q.icon} ${q.label}`)} disabled={loading || !importId}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.03] border border-white/[0.06] text-blue-200/50 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all disabled:opacity-20">
                {q.icon} {q.label}
              </button>
            ))}
          </div>
          {/* Input */}
          <form onSubmit={onSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Rechercher un adhérent, un groupe, ou poser une question..."
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 placeholder-blue-300/20 text-sm outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
                disabled={loading || !importId}
              />
              {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-500/20 border-t-violet-400 rounded-full animate-spin" />}
            </div>
            <button type="submit" disabled={loading || !importId || !input.trim()}
              className="px-4 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-xl transition-all disabled:opacity-20 hover:shadow-xl hover:shadow-violet-600/30 hover:scale-[1.02] active:scale-95">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </form>
          <div className="text-center mt-1.5">
            <span className="text-[9px] text-blue-300/20">Union Intelligence — Les analyses sont basées sur les données importées. Vérifiez les résultats.</span>
          </div>
        </div>
      </div>

      {/* No import */}
      {!importId && (
        <div className="absolute inset-0 bg-[#0a0a1a]/95 flex items-center justify-center z-20">
          <div className="text-center">
            <img src={uiLogo} alt="U.I." className="w-20 h-20 rounded-3xl object-cover mx-auto mb-4 shadow-2xl shadow-violet-600/30" />
            <h2 className="text-lg font-bold text-white mb-1">UNION Intelligence</h2>
            <p className="text-blue-300/30 text-xs">Importez des données Excel pour activer l'intelligence commerciale.</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes genie-slide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes genie-expand { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
        .animate-genie-slide { animation: genie-slide 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-genie-expand { animation: genie-expand 0.3s ease-out; overflow: hidden; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

export default GeniePage
