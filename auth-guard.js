// auth-guard.js — guarda de acesso para páginas protegidas.
// Uso: inclua no HTML ANTES do script da página e chame guard('student'|'trainer'|'owner').
// Depende do supabase-js (CDN) já carregado.
//
// Fluxo:
//  1. Sem sessão → login.html
//  2. Sem perfil → login.html
//  3. Papel errado → redireciona para a página correta do papel
//  4. Acesso não "active" → mostra tela de bloqueio (ou login se não houver handler)
//  5. Tudo ok → chama onReady(session, profile) se fornecido

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Expõe no window para que scripts inline (não-módulo) possam usar _sb e guard()
window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _sb = window._sb;

const _ROUTES = { student: 'index.html', trainer: 'professor.html', owner: 'owner.html' };

/**
 * @param {string} requiredRole - 'student' | 'trainer' | 'owner'
 * @param {object} [opts]
 * @param {function} [opts.onReady]    - chamado com (session, profile) se acesso ok
 * @param {function} [opts.onBlocked]  - chamado com (state) se acesso negado ('expired'|'unavailable'|'suspended')
 *                                        se não fornecido, redireciona pro login
 */
async function guard(requiredRole, opts = {}) {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { location.replace('login.html'); return; }

  // Perfil do usuário
  const { data: profile } = await _sb.from('profiles')
    .select('id, role, full_name, email, gym_name, coach_id, status, access_expires_at')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) { location.replace('login.html'); return; }

  // Papel errado → manda pra página certa
  if (profile.role !== requiredRole) {
    const dest = _ROUTES[profile.role] || 'login.html';
    location.replace(dest);
    return;
  }

  // Estado de acesso seguro (motivos sensíveis colapsam)
  const { data: access } = await _sb.rpc('get_my_access');

  if (access !== 'active') {
    if (opts.onBlocked) { opts.onBlocked(access); }
    else { location.replace('login.html'); }
    return;
  }

  // Tudo ok
  if (opts.onReady) { opts.onReady(session, profile); }
}

// Expõe guard() no window para scripts inline
window.guard = guard;
