// Regras do push do aluno. Só funções PURAS (sem rede, sem Deno): é o que o
// test_push.mjs testa em Node. Quem busca dados e envia é o index.ts.
//
// Datas: `now` é um Date "deslocado" para o horário de Brasília, de modo que
// getDay()/getHours()/toLocalISO devolvam o dia e a hora de Brasília num
// runtime em UTC (o da Edge Function). Ver brazilNow().
//
// Dois tipos de notificação, no máximo um de cada por dia:
//   reminder → no horário escolhido pelo aluno, em dia de treino, se ainda não treinou
//   risk     → às 20h, se a sequência acaba hoje caso ele não treine

export const BR_OFFSET_MIN = -180;      // Brasil sem horário de verão desde 2019
export const SEND_WINDOW_MIN = 120;     // até 2h depois do horário ainda manda (cron atrasado, inscrição tardia)
export const RISK_TIME_MIN = 20 * 60;   // alerta de sequência às 20h
export const LATE_REMINDER_MIN = 17 * 60; // lembrete a partir das 17h já cumpre o papel do alerta

// Date cujos getters locais (num runtime em UTC) mostram o horário de Brasília.
export function brazilNow(utcMs = Date.now()) {
  return new Date(utcMs + BR_OFFSET_MIN * 60 * 1000);
}

// '07:30' ou '07:30:00' → 450
export function timeToMinutes(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inWindow(nowMin, startMin) {
  return nowMin >= startMin && nowMin < startMin + SEND_WINDOW_MIN;
}

// Quais tipos estão na hora para este aluno, só pelo relógio e pelo que já foi
// tratado hoje. Se nenhum, nem vale buscar o plano.
export function dueKinds(prefs, now, todayStr) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const reminderMin = timeToMinutes(prefs.reminder_time);
  const kinds = [];
  if (prefs.reminder_on && prefs.last_reminder_on !== todayStr && inWindow(nowMin, reminderMin)) {
    kinds.push('reminder');
  }
  // Um por dia: quem escolheu lembrete no fim da tarde já foi lembrado.
  const lateReminderToday = prefs.reminder_on && prefs.last_reminder_on === todayStr && reminderMin >= LATE_REMINDER_MIN;
  if (prefs.risk_on && prefs.last_risk_on !== todayStr && !lateReminderToday && inWindow(nowMin, RISK_TIME_MIN)) {
    kinds.push('risk');
  }
  return kinds;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T12:00:00Z'), b = new Date(toISO + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Situação do aluno hoje, nos dois modos de plano.
//   logs: linhas de workout_logs ({ session_date, weekday, plan_id?, created_at })
export function analyze(M, now, plan, logs) {
  const today = M.toLocalISO(now);
  const trained = new Set(logs.map(l => l.session_date));
  const trainedToday = trained.has(today);
  const subtitles = plan.subtitles || {};
  const structure = plan.structure || {};

  if ((plan.mode || 'weekly') !== 'cyclic') {
    const dayName = M.DAYS[now.getDay()];
    const prescribed = M.prescribedDaySet(structure);
    const streak = prescribed.size ? M.computeStreak(trained, prescribed, now).current : 0;
    return {
      mode: 'weekly', today, trainedToday, streak,
      isWorkoutDay: prescribed.has(dayName),
      subtitle: subtitles[dayName] || ''
    };
  }

  // Cíclico: mesma regra de determineCyclicPosition() em index.html — o próximo
  // treino é o seguinte ao último feito NESTE plano.
  let seq = Array.isArray(plan.cycle_sequence) ? plan.cycle_sequence : [];
  if (seq.length === 0) {
    const keys = Object.keys(structure).filter(k => Array.isArray(structure[k]) && structure[k].length > 0);
    seq = keys.length ? [...keys, 'rest'] : [];
  }
  const scoped = logs.some(l => 'plan_id' in l) ? logs.filter(l => l.plan_id === plan.id) : logs;
  const last = [...scoped].sort((a, b) =>
    b.session_date.localeCompare(a.session_date) || String(b.created_at).localeCompare(String(a.created_at)))[0];

  let next = null, isWorkoutDay = false;
  if (seq.length && seq.some(s => s !== 'rest')) {
    let i = 0;
    if (last) {
      const idx = seq.indexOf(last.weekday);
      i = idx >= 0 ? (idx + 1) % seq.length : 0;
    }
    // Descanso logo após o último treino vale um dia por posição. Faltar não
    // avança o ciclo (o app também não avança): só os descansos são "gastos".
    const daysSince = last ? daysBetween(last.session_date, today) : Infinity;
    let day = 1, guard = 0;
    while (seq[i] === 'rest' && day < daysSince && guard++ < seq.length) { i = (i + 1) % seq.length; day++; }
    if (seq[i] !== 'rest') { next = seq[i]; isWorkoutDay = true; }
  }

  const dpw = plan.days_per_week || null;
  const r = dpw ? M.computeStreakCyclic(trained, dpw, now) : null;
  return {
    mode: 'cyclic', today, trainedToday, isWorkoutDay, next,
    subtitle: next ? (subtitles[next] || '') : '',
    daysPerWeek: dpw,
    weekCount: r ? r.thisWeekCount : 0,
    weeksStreak: r ? r.current : 0,
    // dias que restam na semana (segunda a domingo), contando hoje
    daysLeftInWeek: now.getDay() === 0 ? 1 : 8 - now.getDay()
  };
}

// ---------- textos ----------
// Cada situação tem várias frases. A escolha gira pelo dia (dias seguidos nunca
// repetem a mesma frase) com um deslocamento por aluno, para nem todo mundo
// receber o mesmo texto no mesmo dia. Templates que pedem algo que não temos
// (nome do aluno, nome do treino) devolvem null e saem da roda.

function hashStr(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h * 31 + c.codePointAt(0)) | 0;
  return Math.abs(h);
}

function dayNumber(iso) {
  return Math.round(new Date(iso + 'T12:00:00Z').getTime() / 86400000);
}

// slot separa título e corpo: com tamanhos de lista diferentes, as
// combinações também variam.
function pick(templates, ctx, slot) {
  const ok = templates.map(t => t(ctx)).filter(Boolean);
  if (!ok.length) return '';
  return ok[(dayNumber(ctx.today) + hashStr(ctx.seed + slot)) % ok.length];
}

export function firstName(fullName) {
  const n = String(fullName || '').trim().split(/\s+/)[0] || '';
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : '';
}

// Nome do treino de hoje: o subtítulo cadastrado; no cíclico sem subtítulo, "Treino B".
function workoutName(s) {
  if (s.subtitle) return s.subtitle;
  return s.mode === 'cyclic' && s.next ? `Treino ${s.next}` : '';
}

const T_REMINDER_NAMED = [
  c => `Hoje é dia de ${c.treino}`,
  c => `Treino de hoje: ${c.treino}`,
  c => `Hoje tem ${c.treino}. Bora?`,
  c => c.nome && `${c.nome}, hoje tem ${c.treino}`,
  c => `${c.treino} te esperando`,
  c => c.nome && `Bora, ${c.nome}? Hoje é ${c.treino}`,
];
const T_REMINDER_GENERIC = [
  () => 'Hoje é dia de treino',
  () => 'Seu treino de hoje está pronto',
  () => 'Hora de treinar',
  c => c.nome && `${c.nome}, bora treinar?`,
  c => c.nome && `Bora, ${c.nome}! Dia de treino`,
];
const B_STREAK = [
  c => `${plural(c.n, 'treino seguido', 'treinos seguidos')}. Não deixa a sequência parar agora!`,
  c => `Mais um hoje e a sua sequência vai para ${c.n + 1}.`,
  c => `Sequência de ${c.n} e contando. Hoje é o ${c.n + 1}º.`,
  c => `Constância é o que dá resultado, e você já tem ${plural(c.n, 'treino seguido', 'treinos seguidos')}.`,
  c => `Você está com ${plural(c.n, 'treino seguido', 'treinos seguidos')}. Bora manter o foguinho aceso!`,
];
const B_FRESH = [
  () => 'O treino mais difícil é o que você não começa. Bora?',
  () => 'Não precisa ser perfeito, só precisa ser feito.',
  () => 'Seu eu de amanhã vai agradecer. Bora treinar?',
  () => 'Hoje é um ótimo dia para começar uma sequência nova.',
  () => 'Cada treino conta. Começa hoje e vê a sequência crescer.',
  () => 'Uma hora de treino, o dia inteiro de disposição.',
];
const T_RISK = [
  c => `Sua sequência de ${c.n} acaba hoje`,
  c => `${plural(c.n, 'treino seguido', 'treinos seguidos')} em jogo`,
  c => c.nome && `${c.nome}, não perde a sequência de ${c.n}!`,
  c => `Não deixa a sequência de ${c.n} cair`,
];
const B_RISK = [
  c => c.treino ? `Ainda dá tempo: ${c.treino} hoje mantém o foguinho aceso.` : 'Ainda dá tempo de treinar e manter o foguinho aceso.',
  () => 'Mesmo um treino mais curto hoje já salva a sequência.',
  c => `Foram ${c.n} treinos de esforço. Um hoje e a sequência continua.`,
  () => 'Falta pouco para o dia acabar, mas ainda dá tempo de treinar.',
];
const B_CYCLIC_START = [
  () => 'Primeiro treino da semana. Começa forte!',
  () => 'Semana nova, meta nova. Bora abrir com o pé direito.',
  () => 'O primeiro treino da semana puxa todos os outros.',
];
const T_CYCLIC_RISK = [
  () => 'Sua meta da semana está em risco',
  c => c.nome && `${c.nome}, a meta da semana depende de hoje`,
  () => 'Hoje decide a sua meta da semana',
];

// O mesmo foguinho da sequência no app: aparece sempre que há sequência em jogo.
const FIRE = '\u{1F525}';

// Mensagem de um tipo, ou null se hoje não cabe mandar.
//   opts.name: nome completo do aluno (opcional)
//   opts.seed: identificador estável do aluno, para variar a frase entre alunos
export function buildMessage(kind, s, opts = {}) {
  if (s.trainedToday) return null;
  const ctx = { today: s.today, seed: (opts.seed || '') + kind, nome: firstName(opts.name), treino: workoutName(s) };

  if (s.mode === 'weekly') {
    if (!s.isWorkoutDay) return null;
    ctx.n = s.streak;
    if (kind === 'reminder') {
      return {
        title: pick(ctx.treino ? T_REMINDER_NAMED : T_REMINDER_GENERIC, ctx, 't'),
        body: s.streak > 0 ? `${pick(B_STREAK, ctx, 'b')} ${FIRE}` : pick(B_FRESH, ctx, 'b')
      };
    }
    // Sequência de 1 ainda não é algo que dê pena perder.
    if (s.streak < 2) return null;
    return { title: `${FIRE} ${pick(T_RISK, ctx, 't')}`, body: pick(B_RISK, ctx, 'b') };
  }

  // cíclico
  const metaBatida = s.daysPerWeek && s.weekCount >= s.daysPerWeek;
  if (kind === 'reminder') {
    if (!s.isWorkoutDay || metaBatida) return null;
    let body;
    if (!s.daysPerWeek) body = pick(B_FRESH, ctx, 'b');
    else if (s.weekCount === 0) body = pick(B_CYCLIC_START, ctx, 'b');
    else {
      const faltam = s.daysPerWeek - s.weekCount;
      body = faltam === 1
        ? `Já são ${s.weekCount} de ${s.daysPerWeek} esta semana. Só falta 1 para bater a meta!`
        : `Já são ${s.weekCount} de ${s.daysPerWeek} esta semana. Faltam ${faltam} para a meta.`;
    }
    if (s.weeksStreak > 0) body += ` ${FIRE} ${plural(s.weeksStreak, 'semana seguida', 'semanas seguidas')} na meta.`;
    return { title: pick(T_REMINDER_NAMED, ctx, 't'), body };
  }
  if (!s.daysPerWeek || metaBatida) return null;
  const faltam = s.daysPerWeek - s.weekCount;
  // Só avisa quando é treinar hoje ou perder a meta. Se já não dá mais, não
  // adianta cobrar.
  if (faltam !== s.daysLeftInWeek) return null;
  return {
    title: pick(T_CYCLIC_RISK, ctx, 't'),
    body: `${faltam === 1 ? 'Falta 1 treino' : `Faltam ${faltam} treinos`} e ${plural(s.daysLeftInWeek, 'dia', 'dias')} na semana. ${ctx.treino ? ctx.treino + ' hoje' : 'Treinar hoje'} mantém a meta.`
  };
}

// O aluno ainda pode receber? (acesso vencido ou suspenso: não)
export function canReceive(profile, todayStr) {
  if (!profile || profile.role !== 'student' || profile.status !== 'active') return false;
  return !profile.access_expires_at || profile.access_expires_at >= todayStr;
}
