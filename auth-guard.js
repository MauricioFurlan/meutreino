// auth-guard.js — guarda de acesso para páginas protegidas.
// Uso: inclua no HTML ANTES do script da página e chame
//   guard('student'|'trainer'|'owner')  — um papel
//   guard(['trainer','student'])        — página compartilhada por dois papéis
// Depende do supabase-js (CDN) já carregado.
// As credenciais vêm de window.__ENV, injetado pelo Vite em build-time.
//
// Fluxo:
//  1. Sem sessão → login.html
//  2. Sem perfil → login.html
//  3. Papel errado → redireciona para a página correta do papel
//  4. Acesso não "active" → mostra tela de bloqueio (ou login se não houver handler)
//  5. Tudo ok → chama onReady(session, profile) se fornecido

const _ENV = window.__ENV || {};
const SUPABASE_URL = _ENV.SUPABASE_URL || '';
const SUPABASE_KEY = _ENV.SUPABASE_KEY || '';

// Expõe _sb globalmente para que os scripts inline das páginas possam usar
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window._sb = _sb;

const _ROUTES = { student: 'index.html', trainer: 'professor.html', owner: 'owner.html' };

/**
 * @param {string|string[]} requiredRole - 'student' | 'trainer' | 'owner', ou uma
 *   lista quando a mesma página serve mais de um papel (ex: anamnese.html, que o
 *   professor usa para lançar e o aluno para consultar). A página é responsável
 *   por adaptar a interface ao profile.role recebido em onReady.
 * @param {object} [opts]
 * @param {function} [opts.onReady]    - chamado com (session, profile) se acesso ok
 * @param {function} [opts.onBlocked]  - chamado com (state) se acesso negado
 */
async function guard(requiredRole, opts = {}) {
  const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { location.replace('login.html'); return; }

  const { data: profile } = await _sb.from('profiles')
    .select('id, role, full_name, email, gym_name, coach_id, status, access_expires_at, app_theme')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) { location.replace('login.html'); return; }

  if (!allowed.includes(profile.role)) {
    const dest = _ROUTES[profile.role] || 'login.html';
    location.replace(dest);
    return;
  }

  const { data: access } = await _sb.rpc('get_my_access');

  if (access !== 'active') {
    if (opts.onBlocked) { opts.onBlocked(access); }
    else { location.replace('login.html'); }
    return;
  }

  if (opts.onReady) { opts.onReady(session, profile); }
}

// Expõe guard() globalmente
window.guard = guard;
