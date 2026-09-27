import { BOSSES, MISSIONS, RACES, missionUnlocked, rewardSummary, type Mission, type Profile } from '@gentium/engine';

export interface CampaignCtx {
  profile: Profile;
  selected: string | null;
  onPrepare: (missionId: string) => void;
}

/** Mapa de campaña: capítulos con misiones y, aparte, las incursiones contra jefes. */
export function renderCampaign(container: HTMLElement, ctx: CampaignCtx): void {
  const { profile } = ctx;
  const chapters = new Map<string, Mission[]>();
  for (const m of MISSIONS) chapters.set(m.chapter, [...(chapters.get(m.chapter) ?? []), m]);
  const done = MISSIONS.filter((m) => m.kind === 'mission' && profile.cleared.includes(m.id)).length;
  const total = MISSIONS.filter((m) => m.kind === 'mission').length;

  container.replaceChildren();
  const intro = document.createElement('p');
  intro.className = 'muted';
  intro.textContent = `Progreso: ${done} / ${total} misiones. Cada batalla gasta provisiones (🍖), que se recuperan solas: 1 cada 20 minutos.`;
  container.append(intro);

  for (const [chapter, missions] of chapters) {
    const h = document.createElement('h3');
    h.textContent = chapter === 'Incursión' ? 'Incursiones: jefes de mundo' : chapter;
    container.append(h);
    for (const m of missions) container.append(missionElement(m, ctx));
  }
}

function missionElement(m: Mission, ctx: CampaignCtx): HTMLElement {
  const { profile } = ctx;
  const unlocked = missionUnlocked(profile, m);
  const cleared = profile.cleared.includes(m.id);
  const el = document.createElement('div');
  el.className = `mission${m.kind === 'raid' ? ' raid' : ''}${cleared ? ' cleared' : ''}${unlocked ? '' : ' locked'}${ctx.selected === m.id ? ' selected' : ''}`;
  const enemy = m.enemy.bosses?.length
    ? m.enemy.bosses.map((b) => `${BOSSES[b.id].name}, ${BOSSES[b.id].title}`).join(', ')
    : `${RACES[m.enemy.race].name} · ${m.enemy.units.length} unidades`;
  const rewards = rewardSummary(m.reward).join(' · ');
  const first = m.firstClear && !cleared ? rewardSummary(m.firstClear).join(' · ') : '';
  const best = m.kind === 'raid' && profile.raidBest[m.id] !== undefined ? `Mejor daño: ${profile.raidBest[m.id]}%` : '';
  el.innerHTML = `
    <div class="mission-head">
      <strong>${m.name}</strong>
      <span class="mission-tag">${cleared ? '✓ Completada' : unlocked ? `🍖 ${m.cost}` : '🔒 Bloqueada'}</span>
    </div>
    <p>${m.text}</p>
    <div class="mission-meta">Enemigo: ${enemy}${best ? ` · ${best}` : ''}</div>
    <div class="mission-meta">${m.kind === 'raid' ? 'Botín según el daño al jefe:' : 'Botín:'} ${rewards}${m.kind === 'raid' ? ' · 🜏 Fichas Extrañas' : ''}</div>
    ${first ? `<div class="mission-meta first">Primera victoria: ${first}</div>` : ''}`;
  if (unlocked) {
    const b = document.createElement('button');
    b.className = `btn ${m.kind === 'raid' ? 'primary' : ''} small`;
    b.textContent = ctx.selected === m.id ? 'Preparada: pulsa ¡A la batalla!' : m.kind === 'raid' ? 'Preparar incursión' : 'Preparar batalla';
    b.onclick = () => ctx.onPrepare(m.id);
    el.append(b);
  }
  return el;
}
