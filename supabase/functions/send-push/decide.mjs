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

// Mensagem de um tipo, ou null se hoje não cabe mandar.
export function buildMessage(kind, s) {
  if (s.trainedToday) return null;

  if (s.mode === 'weekly') {
    if (!s.isWorkoutDay) return null;
    if (kind === 'reminder') {
      return {
        title: s.subtitle ? `Treino de hoje: ${s.subtitle}` : 'Hoje é dia de treino',
        body: s.streak > 0
          ? `Você está com ${plural(s.streak, 'treino seguido', 'treinos seguidos')}. Bora manter a sequência!`
          : 'Bora começar uma sequência nova hoje?'
      };
    }
    // Sequência de 1 ainda não é algo que dê pena perder.
    if (s.streak < 2) return null;
    return {
      title: `Sua sequência de ${s.streak} acaba hoje`,
      body: 'Ainda dá tempo de treinar e manter o foguinho aceso.'
    };
  }

  // cíclico
  const metaBatida = s.daysPerWeek && s.weekCount >= s.daysPerWeek;
  if (kind === 'reminder') {
    if (!s.isWorkoutDay || metaBatida) return null;
    let body = s.daysPerWeek ? `Esta semana: ${s.weekCount} de ${s.daysPerWeek} treinos.` : 'Bora treinar?';
    if (s.weeksStreak > 0) body += ` ${plural(s.weeksStreak, 'semana seguida', 'semanas seguidas')} na meta.`;
    return { title: `Treino de hoje: ${s.next}${s.subtitle ? ' — ' + s.subtitle : ''}`, body };
  }
  if (!s.daysPerWeek || metaBatida) return null;
  const faltam = s.daysPerWeek - s.weekCount;
  // Só avisa quando é treinar hoje ou perder a meta. Se já não dá mais, não
  // adianta cobrar.
  if (faltam !== s.daysLeftInWeek) return null;
  return {
    title: 'Sua meta da semana está em risco',
    body: `${faltam === 1 ? 'Falta 1 treino' : `Faltam ${faltam} treinos`} e ${plural(s.daysLeftInWeek, 'dia', 'dias')} na semana. Treinar hoje mantém a meta.`
  };
}

// O aluno ainda pode receber? (acesso vencido ou suspenso: não)
export function canReceive(profile, todayStr) {
  if (!profile || profile.role !== 'student' || profile.status !== 'active') return false;
  return !profile.access_expires_at || profile.access_expires_at >= todayStr;
}
