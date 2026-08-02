# Fluxograma da Aplicação — App de Treino (Multi-Personal)

> Para visualizar os diagramas abaixo, cole em https://mermaid.live ou abra no VS Code
> com a extensão "Markdown Preview Mermaid Support".

---

## 1. Fluxo de Acesso (Login → Redirecionamento)

```mermaid
flowchart TD
    A[Usuário abre login.html] --> B{Tem sessão?}
    B -->|Sim| C{Qual papel?}
    B -->|Não| D[Digita e-mail]
    D --> E[Recebe código 6 dígitos por e-mail]
    E --> F[Digita código no app]
    F --> G{Usuário novo?}
    G -->|Sim - tem convite| H[Trigger cria perfil automaticamente]
    G -->|Sim - sem convite| I[Sem acesso: tela vazia]
    G -->|Não| C
    H --> C

    C -->|student| J[index.html - App do Aluno]
    C -->|trainer| K[professor.html - Painel do Professor]
    C -->|owner| L[owner.html - Painel do Dono]

    J --> M{get_my_access = ?}
    K --> M
    M -->|active| N[Usa o app normalmente]
    M -->|expired| O[Tela: Período encerrado]
    M -->|unavailable| P[Tela: Acesso indisponível]
    M -->|suspended| Q[Tela: Acesso suspenso]
```

---

## 2. Hierarquia de Controle (Quem provisiona quem)

```mermaid
flowchart TD
    OWNER["🏢 DONO (você)<br>owner.html"]
    TRAINER["👨‍🏫 PROFESSOR<br>professor.html"]
    STUDENT["🏋️ ALUNO<br>index.html"]

    OWNER -->|"Cria convite (trainer)<br>Define prazo (mensalidade)<br>Suspende/Reativa"| TRAINER
    TRAINER -->|"Cria convite (student)<br>Define prazo (acompanhamento)<br>Suspende/Reativa<br>Monta treino<br>Faz avaliação"| STUDENT

    OWNER -.->|"Suspende professor →<br>CASCATA: todos os alunos<br>dele perdem acesso"| STUDENT

    style OWNER fill:#f5c518,color:#000
    style TRAINER fill:#1a1a1a,color:#f5c518,stroke:#f5c518
    style STUDENT fill:#1a1a1a,color:#fff,stroke:#333
```

---

## 3. Telas e Navegação

```mermaid
flowchart LR
    subgraph LOGIN
        L[login.html<br>E-mail + Código OTP]
    end

    subgraph ALUNO
        A1[index.html<br>Treino do dia]
        A1 --- A2[Histórico<br>modal]
    end

    subgraph PROFESSOR
        P1[professor.html<br>Gestão de Alunos]
        P2[editor.html<br>Montar/Editar Treino]
        P3[anamnese.html<br>Avaliações]
        P4[treinador.html<br>Acompanhamento]
        P1 --> P2
        P1 --> P3
        P1 --> P4
    end

    subgraph DONO
        O1[owner.html<br>Gestão de Professores<br>+ Pagamentos]
    end

    L -->|student| A1
    L -->|trainer| P1
    L -->|owner| O1

    style L fill:#333,color:#f5c518
    style A1 fill:#0d0d0d,color:#f0f0f0,stroke:#f5c518
    style P1 fill:#0d0d0d,color:#f0f0f0,stroke:#f5c518
    style O1 fill:#0d0d0d,color:#f0f0f0,stroke:#f5c518
```

---

## 4. Modelo de Dados (Relacionamento)

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1:1"
    PROFILES ||--o{ INVITES : "created_by"
    PROFILES ||--o{ WORKOUT_PLANS : "student_id"
    PROFILES ||--o{ WORKOUT_LOGS : "student_id"
    PROFILES ||--o{ ASSESSMENTS : "student_id"
    PROFILES ||--o{ TRAINER_PAYMENTS : "trainer_id"
    PROFILES ||--o{ PROFILES : "coach_id (aluno→professor)"

    PROFILES {
        uuid id PK
        text role "owner|trainer|student"
        text full_name
        text email
        uuid coach_id FK
        text gym_name
        text status "active|suspended"
        date access_starts_at
        date access_expires_at
    }

    INVITES {
        uuid id PK
        text email
        text role "trainer|student"
        uuid coach_id FK
        text full_name
        text gym_name
        int months
        bool redeemed
    }

    WORKOUT_PLANS {
        uuid id PK
        uuid student_id FK
        uuid coach_id FK
        text title
        jsonb structure "dias > exercicios > sets"
        bool is_active
    }

    WORKOUT_LOGS {
        uuid id PK
        uuid student_id FK
        date session_date
        text weekday
        text exercise_name
        text set_type
        int set_number
        numeric weight
        int reps
    }

    ASSESSMENTS {
        uuid id PK
        uuid student_id FK
        uuid coach_id FK
        date assessment_date
        jsonb data "medidas + saude + obs"
    }

    TRAINER_PAYMENTS {
        uuid id PK
        uuid trainer_id FK
        numeric amount
        date paid_at
        date period_start
        date period_end
    }
```

---

## 5. Fluxo de Segurança (RLS + Mensagens)

```mermaid
flowchart TD
    REQ[Requisição do front-end] --> TOKEN{Token JWT válido?}
    TOKEN -->|Não| DENIED[403 - Negado]
    TOKEN -->|Sim| RLS[RLS verifica políticas]

    RLS --> R1{É o próprio dado?}
    RLS --> R2{É aluno do professor?}
    RLS --> R3{É o owner?}

    R1 -->|Sim| OK[Dados retornados]
    R2 -->|Sim| OK
    R3 -->|Sim| OK
    R1 -->|Não| R2
    R2 -->|Não| R3
    R3 -->|Não| DENIED

    subgraph "Mensagens de Bloqueio (aluno)"
        BLK1["expired → 'Período encerrado.<br>Fale com seu personal.'"]
        BLK2["unavailable → 'Acesso indisponível.<br>Fale com seu personal.'"]
        BLK3["Professor não pagou?<br>MESMA mensagem: unavailable"]
    end

    style BLK3 fill:#2a0000,color:#f44336,stroke:#f44336
```

---

## 6. Stack Técnico

```mermaid
flowchart LR
    subgraph "Front-end (custo R$0)"
        HTML[HTML/JS estático]
        GHP[GitHub Pages]
    end

    subgraph "Back-end (custo R$0)"
        SB_AUTH[Supabase Auth<br>Email OTP]
        SB_DB[Supabase Postgres<br>RLS + Funções]
        BREVO[Brevo SMTP<br>300 emails/dia free]
    end

    HTML --> GHP
    HTML -->|supabase-js| SB_AUTH
    HTML -->|supabase-js| SB_DB
    SB_AUTH -->|envia código via| BREVO

    style HTML fill:#1a1a1a,color:#f5c518,stroke:#f5c518
    style SB_DB fill:#1a1a1a,color:#4caf50,stroke:#4caf50
```
