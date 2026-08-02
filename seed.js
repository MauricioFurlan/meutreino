// Script para popular Supabase com 3 meses de treino fictício
// Roda com: node seed.js

const SUPABASE_URL = 'https://qslvwyhpamazoqhcmqan.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lTQKzQJc5uq7LNq-N1UvRg_w3aF_7zH';

const WORKOUT = {
  'Segunda': [
    { name: 'Barra fixa (ativação)', sets: [{type:'hard'}] },
    { name: 'Remada baixa triângulo cimerian', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Remada curvada pronada irontech', sets: [
      {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Puxador alto aberto cimerian', sets: [
      {type:'feeder'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Pulldown corda', sets: [
      {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Crucifixo inverso + Face pull (biset)', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Rosca alta máquina unilateral', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]}
  ],
  'Terça': [
    { name: 'Peck Deck (ativação)', sets: [{type:'aquec'}] },
    { name: 'Supino reto sentado cimerian', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Desenvolvimento irontech', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Supino inclinado irontech guiado', sets: [
      {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Crossover cima pra baixo', sets: [
      {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Tríceps polia barra W', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}
    ]}
  ],
  'Quarta': [
    { name: 'Banco romano (ativação)', sets: [{type:'aquec'}] },
    { name: 'Cadeira flexora', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Elevação pélvica', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Mesa flexora', sets: [
      {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Leg press 90° irontech', sets: [
      {type:'aquec'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Cadeira abdutora + adutora', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]}
  ],
  'Quinta': [
    { name: 'Panturrilha sentado', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Panturrilha em pé', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Abdômen máquina', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Abdômen paralela', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]}
  ],
  'Sexta': [
    { name: 'Peck Deck (ativação)', sets: [{type:'aquec'}] },
    { name: 'Puxador frente aberto barra anatômica', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Puxada unilateral Cimerian', sets: [
      {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Supino inclinado máquina Cimerian', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Crossover baixo pra cima', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Elevação frontal halter simultâneo', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Elevação lateral unilateral Crossover', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Tríceps corda + Bíceps corda', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]}
  ],
  'Sábado': [
    { name: 'Extensora unilateral (ativação)', sets: [{type:'aquec'}] },
    { name: 'Leg press 45° articulado cimerian', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Hack glutebuilder', sets: [
      {type:'feeder'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Cadeira extensora (pico de contração)', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Stiff glutebuilder', sets: [
      {type:'aquec'}, {type:'feeder'}, {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]},
    { name: 'Cadeira abdutora pra frente', sets: [
      {type:'hard'}, {type:'hard'}, {type:'hard'}
    ]}
  ]
};

// Cargas base iniciais (kg) por exercício - valores realistas
const BASE_WEIGHTS = {
  'Barra fixa (ativação)': 0,
  'Remada baixa triângulo cimerian': 60,
  'Remada curvada pronada irontech': 50,
  'Puxador alto aberto cimerian': 55,
  'Pulldown corda': 30,
  'Crucifixo inverso + Face pull (biset)': 12,
  'Rosca alta máquina unilateral': 18,
  'Peck Deck (ativação)': 40,
  'Supino reto sentado cimerian': 70,
  'Desenvolvimento irontech': 40,
  'Supino inclinado irontech guiado': 55,
  'Crossover cima pra baixo': 20,
  'Tríceps polia barra W': 30,
  'Banco romano (ativação)': 0,
  'Cadeira flexora': 45,
  'Elevação pélvica': 80,
  'Mesa flexora': 40,
  'Leg press 90° irontech': 150,
  'Cadeira abdutora + adutora': 50,
  'Panturrilha sentado': 40,
  'Panturrilha em pé': 60,
  'Abdômen máquina': 35,
  'Abdômen paralela': 0,
  'Puxador frente aberto barra anatômica': 55,
  'Puxada unilateral Cimerian': 30,
  'Supino inclinado máquina Cimerian': 60,
  'Crossover baixo pra cima': 15,
  'Elevação frontal halter simultâneo': 10,
  'Elevação lateral unilateral Crossover': 8,
  'Tríceps corda + Bíceps corda': 25,
  'Extensora unilateral (ativação)': 30,
  'Leg press 45° articulado cimerian': 180,
  'Hack glutebuilder': 80,
  'Cadeira extensora (pico de contração)': 50,
  'Stiff glutebuilder': 60,
  'Cadeira abdutora pra frente': 50
};

function getDayName(date) {
  const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  return days[date.getDay()];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRecords() {
  const records = [];
  const startDate = new Date('2026-05-01');
  const endDate = new Date('2026-07-31');

  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayName = getDayName(currentDate);

    if (dayName === 'Domingo' || !WORKOUT[dayName]) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Simular faltar ~10% dos treinos
    if (Math.random() < 0.10) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const weekNumber = Math.floor((currentDate - startDate) / (7 * 24 * 60 * 60 * 1000));
    const progressFactor = 1 + (weekNumber * 0.02); // +2% por semana

    const exercises = WORKOUT[dayName];

    exercises.forEach(exercise => {
      const baseWeight = BASE_WEIGHTS[exercise.name] || 20;

      exercise.sets.forEach((set, setIdx) => {
        let weight, reps;

        if (set.type === 'aquec') {
          weight = Math.round(baseWeight * 0.5 * progressFactor);
          reps = randomInt(12, 15);
        } else if (set.type === 'feeder') {
          weight = Math.round(baseWeight * 0.85 * progressFactor);
          reps = randomInt(2, 4);
        } else {
          // hard set - progressão real
          weight = Math.round(baseWeight * progressFactor);
          // Variação natural: às vezes pega mais, às vezes menos
          weight += randomInt(-2, 3);
          reps = randomInt(7, 12);
        }

        // Bodyweight exercises
        if (baseWeight === 0) {
          weight = 0;
          reps = set.type === 'aquec' ? randomInt(12, 15) : randomInt(8, 15);
        }

        const timestamp = new Date(currentDate);
        timestamp.setHours(randomInt(6, 9), randomInt(0, 59), randomInt(0, 59));

        records.push({
          day: dayName,
          exercise_name: exercise.name,
          set_type: set.type,
          set_number: setIdx + 1,
          weight: weight > 0 ? weight : null,
          reps: reps,
          notes: null,
          created_at: timestamp.toISOString()
        });
      });
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return records;
}

async function insertBatch(records) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/workout_logs', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(records)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ${res.status}: ${text}`);
  }
}

async function main() {
  console.log('Gerando dados fictícios de 3 meses...');
  const records = generateRecords();
  console.log(`Total de registros: ${records.length}`);

  // Inserir em batches de 500
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await insertBatch(batch);
    inserted += batch.length;
    console.log(`Inseridos: ${inserted}/${records.length}`);
  }

  console.log('Concluído! Dados de maio a julho de 2026 inseridos.');
}

main().catch(console.error);
