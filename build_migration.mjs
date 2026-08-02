// =====================================================================
// App de Treino — build_migration.mjs
// Gera sql/05_migrate_workout.sql a partir de:
//  - WORKOUT (treino prescrito, espelho do index.html)
//  - notas ativas do treinador (fundidas na estrutura)
//  - backup/workout_logs.json (execução real de hoje)
//
// Uso:  node build_migration.mjs
// O SQL gerado é parametrizado por e-mail do aluno (roda no SQL Editor).
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';

// Título do treino (o "título" que o app exibe)
const PLAN_TITLE = 'Treino';

// Estrutura prescrita — espelho do index.html
const WORKOUT = {
  'Segunda': [
    { name: 'Barra fixa (ativação)', sets: [{type:'hard', reps:'até falha'}] },
    { name: 'Remada baixa triângulo cimerian', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Remada curvada pronada irontech', sets: [
      {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Puxador alto aberto cimerian', sets: [
      {type:'feeder', reps:'2-4'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Pulldown corda', sets: [
      {type:'feeder', reps:'2-4'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]},
    { name: 'Crucifixo inverso + Face pull (biset)', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]},
    { name: 'Rosca alta máquina unilateral', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]}
  ],
  'Terça': [
    { name: 'Peck Deck (ativação)', sets: [{type:'aquec', reps:'15'}] },
    { name: 'Supino reto sentado cimerian', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Desenvolvimento irontech', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Supino inclinado irontech guiado', sets: [
      {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Crossover cima pra baixo', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9 + drop'} ]},
    { name: 'Tríceps polia barra W', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]}
  ],
  'Quarta': [
    { name: 'Banco romano (ativação)', sets: [{type:'aquec', reps:'15'}] },
    { name: 'Cadeira flexora', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Elevação pélvica', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'7-9'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]},
    { name: 'Mesa flexora', sets: [
      {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Leg press 90° irontech', sets: [
      {type:'aquec', reps:'12-15'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Cadeira abdutora + adutora', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'10-15'} ]}
  ],
  'Quinta': [
    { name: 'Panturrilha sentado', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'10-15'} ]},
    { name: 'Panturrilha em pé', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'10-15'} ]},
    { name: 'Abdômen máquina', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'10-15'} ]},
    { name: 'Abdômen paralela', sets: [
      {type:'hard', reps:'10-15'}, {type:'hard', reps:'10-15'}, {type:'hard', reps:'10-15'} ]},
    { name: 'Cardio', sets: [{type:'hard', reps:'40 min'}] }
  ],
  'Sexta': [
    { name: 'Peck Deck (ativação)', sets: [{type:'aquec', reps:'15'}] },
    { name: 'Puxador frente aberto barra anatômica', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Puxada unilateral Cimerian', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Supino inclinado máquina Cimerian', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Crossover baixo pra cima', sets: [
      {type:'hard', reps:'8-12 + drop'}, {type:'hard', reps:'8-12 + drop'}, {type:'hard', reps:'8-12 + drop'} ]},
    { name: 'Elevação frontal halter simultâneo', sets: [
      {type:'hard', reps:'8-12 + parciais'}, {type:'hard', reps:'8-12 + parciais'}, {type:'hard', reps:'8-12 + parciais'} ]},
    { name: 'Elevação lateral unilateral Crossover', sets: [
      {type:'hard', reps:'8-12 + parciais'}, {type:'hard', reps:'8-12 + parciais'}, {type:'hard', reps:'8-12 + parciais'} ]},
    { name: 'Tríceps corda + Bíceps corda', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]}
  ],
  'Sábado': [
    { name: 'Extensora unilateral (ativação)', sets: [{type:'aquec', reps:'12-15'}] },
    { name: 'Leg press 45° articulado cimerian', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Hack glutebuilder', sets: [
      {type:'feeder', reps:'2-4'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'} ]},
    { name: 'Cadeira extensora (pico de contração)', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'7-9'}, {type:'hard', reps:'8-12 + drop'} ]},
    { name: 'Stiff glutebuilder', sets: [
      {type:'aquec', reps:'12-15'}, {type:'feeder', reps:'2-4'},
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]},
    { name: 'Cadeira abdutora pra frente', sets: [
      {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'}, {type:'hard', reps:'8-12'} ]}
  ],
  'Domingo': []
};

// Notas ATIVAS do treinador (do backup trainer_notes.json). set_number null = nota do exercício.
const TRAINER_NOTES = [
  { exercise: 'Cadeira extensora (pico de contração)', set_number: 3, note: 'Cada drop conta como meia série' }
];

// --- Monta a estrutura final do plano (com video_url/note por exercício e set) ---
const structure = {};
for (const [day, exercises] of Object.entries(WORKOUT)) {
  structure[day] = exercises.map(ex => {
    const exNote = TRAINER_NOTES.find(n => n.exercise === ex.name && n.set_number == null);
    return {
      name: ex.name,
      video_url: null,
      note: exNote ? exNote.note : null,
      sets: ex.sets.map((s, i) => {
        const setNote = TRAINER_NOTES.find(n => n.exercise === ex.name && n.set_number === i + 1);
        return { type: s.type, reps: s.reps, note: setNote ? setNote.note : null };
      })
    };
  });
}

// --- Lê os logs reais do backup ---
const logs = JSON.parse(readFileSync(new URL('./backup/workout_logs.json', import.meta.url)));

const esc = (s) => (s == null ? null : String(s).replace(/'/g, "''"));
const sqlVal = (v) => (v == null ? 'null' : `'${esc(v)}'`);
const sqlNum = (v) => (v == null ? 'null' : Number(v));

const logRows = logs.map(l => {
  const sd = l.created_at.split('T')[0];
  return `    ('${sd}', ${sqlVal(l.day)}, ${sqlVal(l.exercise_name)}, ${sqlVal(l.set_type)}, ${l.set_number}, ${sqlNum(l.weight)}, ${sqlNum(l.reps)}, ${sqlVal(l.notes)}, '${l.created_at}')`;
}).join(',\n');

const structureJson = JSON.stringify(structure).replace(/'/g, "''");

const sql = `-- =====================================================================
-- App de Treino — 05_migrate_workout.sql  (GERADO por build_migration.mjs)
-- Migra o treino prescrito (JSONB) + a execução real de hoje para o novo schema.
-- Rodar DEPOIS de 01..03 E depois que o ALUNO já tiver perfil (login por OTP).
-- Ajuste o e-mail do aluno abaixo antes de rodar.
-- =====================================================================
do $$
declare
  v_student uuid;
  v_coach   uuid;
begin
  -- >>> AJUSTE AQUI: e-mail do aluno dono deste treino <<<
  select id, coach_id into v_student, v_coach
  from public.profiles
  where lower(email) = lower('ALUNO@EXEMPLO.COM') and role = 'student';

  if v_student is null then
    raise exception 'Aluno não encontrado. O aluno precisa logar (OTP) antes de migrar.';
  end if;

  -- Plano prescrito (desativa qualquer plano ativo anterior deste aluno)
  update public.workout_plans set is_active = false where student_id = v_student and is_active = true;

  insert into public.workout_plans (student_id, coach_id, title, structure, is_active)
  values (v_student, v_coach, '${PLAN_TITLE.replace(/'/g, "''")}', '${structureJson}'::jsonb, true);

  -- Execução real (logs de hoje)
  insert into public.workout_logs
    (student_id, session_date, weekday, exercise_name, set_type, set_number, weight, reps, notes, created_at)
  values
${logRows.replace(/^    \(/gm, `    (v_student, `)};

  raise notice 'Migração concluída para o aluno %', v_student;
end $$;
`;

writeFileSync(new URL('./sql/05_migrate_workout.sql', import.meta.url), sql);
console.log('Gerado sql/05_migrate_workout.sql com', logs.length, 'logs e', Object.keys(structure).length, 'dias.');
