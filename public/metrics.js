// metrics.js — regras de cálculo compartilhadas entre as telas de
// acompanhamento (professor.html, treinador.html) e a de evolução do aluno
// (evolucao.html).
//
// Por que existe: computeStreak, toLocalISO, isTrainingDate e os helpers de
// cardio estavam duplicados em cada página. A regra "descanso não quebra a
// sequência" já foi corrigida uma vez e teve de ser corrigida em dois lugares —
// havia até um teste (test_streak.mjs) só para verificar se as duas cópias
// continuavam iguais. Agora existe uma cópia.
//
// É um script CLÁSSICO (sem import/export) de propósito: as páginas usam
// scripts inline, não módulos. As declarações abaixo viram globais no browser,
// então o código das páginas continua chamando `toLocalISO(...)` direto.
// Para os testes em Node, tudo também é exposto em `window.Metrics`.
//
// Regra de ouro: aqui só entra função PURA (sem DOM, sem rede). O que desenha
// fica na página.

// Dia da semana pelo índice de Date.getDay()
const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

// Fuso fixo do app (o Brasil não tem horário de verão desde 2019).
// Usado ao filtrar colunas timestamptz por um intervalo de DIAS locais — sem o
// offset explícito o Postgres interpreta o horário no fuso do servidor (UTC) e
// a janela desloca um dia.
const TZ = '-03:00';

// Janela padrão da sequência. professor.html usa uma janela menor (o payload da
// lista de alunos é multiplicado pelo número de alunos), passando windowDays.
const STREAK_WINDOW_DAYS = 180;

// Janela dos gráficos de evolução por exercício.
const CHART_WINDOW_DAYS = 84;
const CHART_WINDOW_WEEKS = 12;

// Legendas dos gráficos. Sem esse aviso o total de 12 semanas é lido como se
// fosse o número daquele treino.
const CARDIO_CAPTION = 'Últimas 12 semanas · 1 coluna por treino — não é o total do dia';
const FORCA_CAPTION  = 'Últimas 12 semanas · 1 ponto por treino — não é o dia selecionado';

// =====================================================================
// DATAS
// =====================================================================

// Converte um Date para 'YYYY-MM-DD' no fuso LOCAL.
// NÃO usar toISOString() para datas: ele converte para UTC e, após ~21h no
// Brasil, devolve o dia seguinte — o que gravava o treino na data errada e
// marcava o dia de amanhã como "faltou".
function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// '2026-08-05' → '05/08'
function formatDayMonth(date) {
  if (!date) return '';
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Semana de segunda a domingo. offset 0 = semana atual, -1 = anterior.
function getWeekRange(offset) {
  const now = new Date();
  now.setDate(now.getDate() + (offset * 7));
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

// =====================================================================
// FORMATAÇÃO
// =====================================================================

// 3600 → '1h00min' · 900 → '15min'
function formatDurationHM(seconds) {
  if (!seconds || seconds <= 0) return '0min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`;
  return `${m}min`;
}

// 40 → '40min' · 95 → '1h35' · 120 → '2h'
function formatMinutes(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return '0min';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h > 0) return rest > 0 ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
  return `${m}min`;
}

// =====================================================================
// CARDIO
// Minutos vêm de workout_logs.duration_minutes (coluna própria, criada em
// sql/10_add_cardio.sql). Não entram em volume nem em sets hard: cardio é
// tempo, e somar isso à musculação inventaria progresso que não existe.
// =====================================================================
function isCardio(setType) {
  return String(setType || '').trim().toLowerCase() === 'cardio';
}

// Soma os minutos de cardio de um conjunto de linhas de workout_logs.
// Ignora linha sem minutos (o aluno marcou o set mas não informou o tempo).
function sumCardioMinutes(rows) {
  return (rows || []).reduce((sum, r) => {
    const min = Number(r.duration_minutes);
    return sum + (isCardio(r.set_type) && min > 0 ? min : 0);
  }, 0);
}

// Minutos de cardio por data ('YYYY-MM-DD' → minutos)
function cardioByDate(rows) {
  const out = {};
  (rows || []).forEach(r => {
    const min = Number(r.duration_minutes);
    if (!isCardio(r.set_type) || !(min > 0)) return;
    out[r.session_date] = (out[r.session_date] || 0) + min;
  });
  return out;
}

// Último treino COM cardio antes de uma data. rows são linhas de workout_logs
// (qualquer data anterior); agrupa por dia porque pode haver cardio em dois
// exercícios no mesmo treino.
function previousCardioSession(rows, beforeDate) {
  const porData = cardioByDate((rows || []).filter(r => r.session_date && r.session_date < beforeDate));
  const datas = Object.keys(porData).filter(d => porData[d] > 0).sort();
  if (datas.length === 0) return null;
  const date = datas[datas.length - 1];
  return { date, minutes: porData[date] };
}

// Comparativo do card do dia: "hoje 50min · último 40min ↑25% (30/07)".
// É a pergunta diária de verdade — o total de 12 semanas do gráfico não
// responde se o cardio de HOJE foi maior que o do treino anterior.
// Sem base anterior não inventa ↑100%: diz que é o primeiro registro.
function cardioComparison(currentMinutes, prev, label) {
  const cur = Math.round(Number(currentMinutes) || 0);
  if (cur <= 0) return null;
  const quando = label || 'hoje';
  const agora = `${quando} <strong class="cmp-now">${formatMinutes(cur)}</strong>`;

  if (!prev || !(prev.minutes > 0)) {
    return { dir: 'first', diff: null, html: `${agora} · <span class="cmp-flat">1º cardio registrado</span>` };
  }

  const diff = Math.round(((cur - prev.minutes) / prev.minutes) * 100);
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const delta = diff === 0 ? '= igual' : `${diff > 0 ? '↑' : '↓'}${Math.abs(diff)}%`;
  return {
    dir,
    diff,
    html: `${agora} · último <strong class="cmp-prev">${formatMinutes(prev.minutes)}</strong>` +
      ` <span class="cmp-${dir}">${delta}</span> <span class="cmp-when">em ${formatDayMonth(prev.date)}</span>`
  };
}

// Texto do gráfico de cardio + se vale desenhar o gráfico.
// Puro de propósito: as regras de "quando um número engana" são o que precisa
// de teste, não o desenho.
//   1 sessão  → sem gráfico e sem média/total/máximo (seriam o mesmo número 3x)
//   2 sessões → gráfico, sem comparação 1ª→última (é o próprio gráfico em texto)
//   3+        → tudo
function cardioChartInfo(dates, minutesData) {
  const n = minutesData.length;
  const dia = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const row = (label, value, cls) =>
    `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value${cls ? ' ' + cls : ''}">${value}</span></div>`;
  const caption = `<div class="chart-caption">${CARDIO_CAPTION}</div>`;

  if (n === 0) {
    return { showChart: false, html: '<div class="no-data">Sem cardio registrado nas últimas 12 semanas</div>' };
  }
  if (n === 1) {
    return {
      showChart: false,
      html: caption +
        row('Única sessão', `${formatMinutes(minutesData[0])} em ${dia(dates[0])}`) +
        '<div class="no-data">Só 1 sessão na janela — o gráfico aparece a partir da 2ª.</div>'
    };
  }

  const total = minutesData.reduce((a, b) => a + b, 0);
  let html = caption;
  html += row('Sessões na janela', n);
  html += row('Total', formatMinutes(total));
  html += row('Média por sessão', formatMinutes(total / n));
  html += row('Maior sessão', formatMinutes(Math.max(...minutesData)));
  if (n >= 3) {
    const ini = minutesData[0], fim = minutesData[n - 1];
    const diff = ini > 0 ? Math.round(((fim - ini) / ini) * 100) : 0;
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
    // Rótulo explícito: são duas sessões pontuais, não a inclinação da curva.
    html += row('1ª → última sessão',
      `${formatMinutes(ini)} → ${formatMinutes(fim)} ${arrow} ${Math.abs(diff)}%`, cls);
  }
  return { showChart: true, html };
}

// =====================================================================
// MUSCULAÇÃO
// =====================================================================

// 1RM estimado (fórmula de Epley). Normaliza a carga pelas reps, então a curva
// de força não oscila só porque o aluno fez 5 reps numa sessão e 10 na outra.
function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

// Volume dos hard sets (kg × reps). Aquecimento e feeder ficam fora: eles
// existem para preparar a série, contá-los infla o número sem trabalho novo.
function hardVolume(rows) {
  return (rows || []).reduce((sum, r) => {
    if (r.set_type !== 'hard') return sum;
    const w = Number(r.weight) || 0;
    const reps = Number(r.reps) || 0;
    return sum + w * reps;
  }, 0);
}

// =====================================================================
// FREQUÊNCIA E SEQUÊNCIA
// =====================================================================

// Dias em que o aluno TEM treino prescrito, a partir da structure do plano
// ativo ({ 'Segunda': [exercícios], ... }).
// Substitui a regra antiga "todo dia que não é domingo é dia de treino", que
// fazia um aluno de 4x/semana aparecer com 2 faltas toda semana.
// Dia presente no plano mas SEM exercício não é dia de treino — senão viraria
// falta toda semana e zeraria a sequência sem o aluno ter faltado.
function prescribedDaySet(structure) {
  const s = structure || {};
  return new Set(Object.keys(s).filter(d => (s[d] || []).length > 0));
}

// dateStr no formato 'YYYY-MM-DD' → é dia de treino prescrito?
// No modo cíclico, prescribed é um número (days_per_week), não um Set de dias.
// Para manter compatibilidade, isTrainingDate aceita ambos.
function isTrainingDate(dateStr, prescribed) {
  if (typeof prescribed === 'number') {
    // Modo cíclico: não temos dias fixos, delega para isTrainingDateCyclic
    return true; // no modo cíclico, qualquer dia pode ser treino — a aderência é calculada por semana
  }
  const d = new Date(dateStr + 'T12:00:00');
  return prescribed.has(DAYS[d.getDay()]);
}

// === MODO CÍCLICO: aderência e streak ===
// No modo cíclico não existe dia fixo de treino. A aderência é:
//   esperado por semana = days_per_week
//   realizado por semana = dias distintos com log
// O streak funciona diferente: conta semanas consecutivas em que o aluno
// atingiu pelo menos days_per_week treinos.

// Calcula streak para modo cíclico.
// trained: Set de 'YYYY-MM-DD' com treino registrado
// daysPerWeek: número de treinos esperados por semana
// today: Date de referência
function computeStreakCyclic(trained, daysPerWeek, today) {
  const dpw = daysPerWeek || 5;
  const weekWindow = 26; // 6 meses de semanas

  // Agrupa treinos por semana (segunda a domingo)
  function weekStart(date) {
    const d = new Date(date);
    const wd = d.getDay();
    d.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1));
    return toLocalISO(d);
  }

  const trainedByWeek = {};
  trained.forEach(dateStr => {
    const wk = weekStart(new Date(dateStr + 'T12:00:00'));
    trainedByWeek[wk] = (trainedByWeek[wk] || 0) + 1;
  });

  // Conta dias de treino nesta semana
  const thisWeekStart = weekStart(today);
  const thisWeekCount = trainedByWeek[thisWeekStart] || 0;

  // Sequência: conta semanas consecutivas que atingiram a meta
  let current = 0;
  // A semana atual conta como "em andamento" — não penaliza
  for (let w = 1; w <= weekWindow; w++) {
    const wk = new Date(today);
    wk.setDate(today.getDate() - w * 7);
    const ws = weekStart(wk);
    if ((trainedByWeek[ws] || 0) >= dpw) {
      current++;
    } else {
      break;
    }
  }

  let best = 0, run = 0;
  for (let w = weekWindow; w >= 1; w--) {
    const wk = new Date(today);
    wk.setDate(today.getDate() - w * 7);
    const ws = weekStart(wk);
    if ((trainedByWeek[ws] || 0) >= dpw) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  return { current, best, thisWeekCount, daysPerWeek: dpw };
}

// Sequência (foguinho).
// Regra: conta apenas os DIAS DE TREINO PRESCRITOS. Dia de descanso é ignorado
// — não conta e NÃO quebra a sequência. O dia de hoje, se ainda não tem
// registro, fica pendente (não quebra: o dia não acabou).
//   trained: Set de 'YYYY-MM-DD' com treino registrado
//   prescribed: Set de nomes de dia ('Segunda', ...) vindos do plano ativo
//   today: Date de referência
//   windowDays: quantos dias para trás olhar
function computeStreak(trained, prescribed, today, windowDays) {
  const window = windowDays || STREAK_WINDOW_DAYS;

  // sequência atual: caminha de hoje para trás
  let current = 0;
  for (let i = 0; i < window; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = toLocalISO(d);

    if (!isTrainingDate(ds, prescribed)) continue;   // descanso: pula, não quebra
    if (trained.has(ds)) { current++; continue; }
    if (i === 0) continue;                           // hoje ainda pode treinar
    break;                                           // faltou num dia prescrito
  }

  // melhor sequência dentro da janela
  let best = 0, run = 0;
  for (let i = window - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = toLocalISO(d);

    if (!isTrainingDate(ds, prescribed)) continue;
    if (trained.has(ds)) { run++; if (run > best) best = run; }
    else if (i > 0) run = 0;
  }

  return { current, best, hitWindowEdge: current >= window - 1 };
}

// Exposto para os testes em Node (que avaliam este arquivo com um `window` falso).
// No browser as declarações acima já são globais e as páginas as usam direto.
if (typeof window !== 'undefined') {
  window.Metrics = {
    DAYS, TZ, STREAK_WINDOW_DAYS, CHART_WINDOW_DAYS, CHART_WINDOW_WEEKS,
    CARDIO_CAPTION, FORCA_CAPTION,
    toLocalISO, formatDayMonth, getWeekRange,
    formatDurationHM, formatMinutes,
    isCardio, sumCardioMinutes, cardioByDate, previousCardioSession,
    cardioComparison, cardioChartInfo,
    e1rm, hardVolume,
    prescribedDaySet, isTrainingDate, computeStreak, computeStreakCyclic
  };
}
