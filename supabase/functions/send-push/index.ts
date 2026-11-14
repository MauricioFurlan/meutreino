// Edge Function send-push — envia as notificações push dos alunos.
//
// Duas formas de chamar:
//   1. Cron (sql/37_push_cron.sql), a cada 15 min, com o header x-cron-secret.
//      Percorre quem tem aparelho inscrito e manda o que estiver na hora.
//   2. Botão "Enviar teste" em config.html, com o JWT do aluno e {test:true}.
//      Manda uma notificação de teste só para os aparelhos dele.
//
// Deploy com --no-verify-jwt: a função confere o segredo do cron ou o JWT por
// conta própria. Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_CRON_SECRET
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm do Supabase).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Metrics from './metrics.gen.mjs';
import { analyze, brazilNow, buildMessage, canReceive, dueKinds } from './decide.mjs';

const env = (k: string) => Deno.env.get(k) ?? '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
webpush.setVapidDetails('https://meutreino.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
type Msg = { title: string; body: string };

// Envia para todos os aparelhos e apaga os endereços que o serviço de push
// diz que não existem mais (app desinstalado, permissão retirada).
async function sendToSubs(subs: Sub[], msg: Msg, tag: string) {
  const payload = JSON.stringify({ ...msg, tag, url: '/index.html' });
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      // TTL de 6h: lembrete do treino de hoje não deve chegar amanhã.
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: 6 * 3600, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error('push falhou', code, (e as Error).message);
    }
  }));
  if (dead.length) await sb.from('push_subscriptions').delete().in('id', dead);
  return sent;
}

async function loadLogs(studentId: string, fromISO: string) {
  const withPlan = await sb.from('workout_logs').select('session_date, weekday, plan_id, created_at')
    .eq('student_id', studentId).gte('session_date', fromISO);
  if (!withPlan.error) return withPlan.data ?? [];
  // Sem a migration 30 não existe plan_id: histórico global, como o app faz.
  const plain = await sb.from('workout_logs').select('session_date, weekday, created_at')
    .eq('student_id', studentId).gte('session_date', fromISO);
  return plain.data ?? [];
}

async function runCron() {
  const now = brazilNow();
  const today = Metrics.toLocalISO(now);

  const { data: subs, error } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (error) throw error;
  const byUser = new Map<string, Sub[]>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (byUser.size === 0) return { checked: 0, sent: 0 };

  const { data: prefsRows } = await sb.from('notification_prefs').select('*').in('student_id', [...byUser.keys()]);
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - (Metrics.STREAK_WINDOW_DAYS - 1));
  const fromISO = Metrics.toLocalISO(windowStart);

  let sent = 0;
  for (const prefs of prefsRows ?? []) {
    const kinds = dueKinds(prefs, now, today);
    if (kinds.length === 0) continue;

    // Marca antes de enviar: se o envio falhar no meio, o pior caso é perder
    // um lembrete, não mandar o mesmo quatro vezes por hora.
    const mark: Record<string, string> = {};
    if (kinds.includes('reminder')) mark.last_reminder_on = today;
    if (kinds.includes('risk')) mark.last_risk_on = today;
    await sb.from('notification_prefs').update(mark).eq('student_id', prefs.student_id);

    const { data: profile } = await sb.from('profiles')
      .select('role, status, access_expires_at').eq('id', prefs.student_id).maybeSingle();
    if (!canReceive(profile, today)) continue;

    const { data: plans } = await sb.from('workout_plans')
      .select('id, structure, mode, subtitles, cycle_sequence, days_per_week')
      .eq('student_id', prefs.student_id).eq('is_active', true)
      .order('updated_at', { ascending: false }).limit(1);
    const plan = plans?.[0];
    if (!plan) continue;

    const state = analyze(Metrics, now, plan, await loadLogs(prefs.student_id, fromISO));
    // Se os dois estiverem na hora juntos, o alerta da sequência é o que vale.
    const kind = kinds.includes('risk') ? 'risk' : 'reminder';
    const msg = buildMessage(kind, state) ?? (kind === 'risk' && kinds.includes('reminder') ? buildMessage('reminder', state) : null);
    if (!msg) continue;
    sent += await sendToSubs(byUser.get(prefs.student_id) ?? [], msg, 'meutreino-' + kind);
  }
  return { checked: prefsRows?.length ?? 0, sent };
}

async function runTest(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: 'não autenticado' }, 401);
  const { data: subs } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user.id);
  if (!subs?.length) return json({ sent: 0, error: 'nenhum aparelho inscrito' }, 404);
  const sent = await sendToSubs(subs, {
    title: 'Notificações ligadas',
    body: 'É assim que os lembretes do seu treino vão aparecer.',
  }, 'meutreino-test');
  return json({ sent });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const secret = env('PUSH_CRON_SECRET');
    if (secret && req.headers.get('x-cron-secret') === secret) return json(await runCron());
    const body = await req.json().catch(() => ({}));
    if (body?.test) return await runTest(req);
    return json({ error: 'não autorizado' }, 401);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
