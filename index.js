import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";
import { config } from "dotenv";

config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN;

// ── Mapeamento de sprints ────────────────────────────────────────────
const SPRINT_FOLDERS = {
  "01": "155106",
  "02": "155105",
  "03": "155026",
  "04": "155033",
  "05": "155034",
  "06": "173130",
  "07": "173131",
  "08": "173135",
  "09": "173137",
};

function sprintNumberToFolderId(sprintNumber) {
  const normalized = String(sprintNumber).padStart(2, "0");
  return SPRINT_FOLDERS[normalized] || null;
}

// ── Helpers ─────────────────────────────────────────────────────────
function todoistFetch(path) {
  return fetch(`https://api.todoist.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}` },
  }).then((r) => r.json());
}

// ── Funções do Todoist ───────────────────────────────────────────────
async function getProjects() {
  const data = await todoistFetch("/projects");
  const projects = Array.isArray(data) ? data : (data.results || []);
  return projects.map((p) => ({ id: p.id, name: p.name, folder_id: p.folder_id || null }));
}

async function getProjectsByFolderId(folderId) {
  const projects = await getProjects();
  return projects.filter((p) => String(p.folder_id) === String(folderId));
}

async function getTasksByProject(projectId) {
  const data = await todoistFetch(`/tasks?project_id=${projectId}`);
  const tasks = Array.isArray(data) ? data : (data.results || []);
  return tasks.map((t) => ({
    id: t.id,
    content: t.content,
    due: t.due?.string || t.due?.date || null,
    responsible_uid: t.responsible_uid || null,
    deadline: t.deadline?.date || null,
    checked: t.checked,
    section_id: t.section_id || null,
  }));
}

async function getProjectMembers(projectId) {
  return todoistFetch(`/projects/${projectId}/collaborators`);
}

async function createTask(content, due_string = null, project_id = null) {
  const body = { content };
  if (due_string) body.due_string = due_string;
  if (project_id) body.project_id = project_id;
  return fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function closeTask(taskId) {
  const res = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}` },
  });
  return res.ok;
}

// ── Nova sprint ──────────────────────────────────────────────────────
const FIXED_PROJECTS = ["Trade Ideas"];
const WORKSPACE_ID = "68213";

async function createFolder(name) {
  const uuid = crypto.randomUUID();
  const tempId = crypto.randomUUID();
  const res = await fetch("https://api.todoist.com/api/v1/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [{ type: "folder_add", uuid, temp_id: tempId, args: { name, workspace_id: WORKSPACE_ID } }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.sync_status?.[uuid] !== "ok") {
    throw new Error(`Falha ao criar pasta: ${JSON.stringify(data)}`);
  }
  return String(data.temp_id_mapping[tempId]);
}

async function createProject(name, folderId) {
  const body = { name, workspace_id: WORKSPACE_ID, folder_id: String(folderId) };
  console.log(`\n  [DEBUG createProject] body: ${JSON.stringify(body)}`);
  const res = await fetch("https://api.todoist.com/api/v1/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const resBody = await res.text();
  console.log(`  [DEBUG createProject] status: ${res.status} — body: ${resBody}`);
  if (!res.ok) {
    throw new Error(`Falha ao criar projeto "${name}": HTTP ${res.status} — ${resBody}`);
  }
  const parsed = JSON.parse(resBody);
  console.log(`  [DEBUG createProject] folder_id na resposta: ${parsed.folder_id ?? "AUSENTE"}`);

  // Vincular projeto ao folder via sync
  const uuid = crypto.randomUUID();
  const syncBody = { commands: [{ type: "project_move", uuid, args: { id: parsed.id, folder_id: String(folderId) } }] };
  console.log(`  [DEBUG project_move] body: ${JSON.stringify(syncBody)}`);
  const syncRes = await fetch("https://api.todoist.com/api/v1/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(syncBody),
  });
  const syncResBody = await syncRes.text();
  console.log(`  [DEBUG project_move] status: ${syncRes.status} — body: ${syncResBody}`);

  return parsed;
}

async function moveTask(taskId, projectId) {
  // Tentativa 1: POST /tasks/{id}/move
  const moveBody = { project_id: projectId };
  console.log(`\n  [DEBUG moveTask] taskId=${taskId} projectId=${projectId}`);
  console.log(`  [DEBUG moveTask /move] body: ${JSON.stringify(moveBody)}`);
  const res = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}/move`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(moveBody),
  });
  const resBody1 = await res.text();
  console.log(`  [DEBUG moveTask /move] status: ${res.status} — body: ${resBody1}`);
  if (res.ok) return true;

  // Tentativa 2: Sync API com item_move
  const uuid = crypto.randomUUID();
  const syncBody = { commands: [{ type: "item_move", uuid, args: { id: taskId, project_id: projectId } }] };
  console.log(`  [DEBUG moveTask sync] body: ${JSON.stringify(syncBody)}`);
  const res2 = await fetch("https://api.todoist.com/api/v1/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(syncBody),
  });
  const resBody2 = await res2.text();
  console.log(`  [DEBUG moveTask sync] status: ${res2.status} — body: ${resBody2}`);
  const data2 = JSON.parse(resBody2);
  if (res2.ok && data2.sync_status?.[uuid] === "ok") return true;

  return false;
}

async function novaSprint() {
  console.log("\n── Criar nova sprint ──────────────────────────────────");

  const numero = (await pergunta("Número da sprint (ex: 06): ")).trim().padStart(2, "0");
  const inicio = (await pergunta("Data de início (ex: 23/03): ")).trim();
  const fim = (await pergunta("Data de fim (ex: 03/04): ")).trim();

  if (SPRINT_FOLDERS[numero]) {
    console.log(`Sprint ${numero} já existe no mapeamento (folder_id: ${SPRINT_FOLDERS[numero]}).`);
    return;
  }

  const sprintName = `Sprint ${numero} [${inicio} → ${fim}]`;

  // 1. Criar a pasta
  process.stdout.write(`\nCriando pasta "${sprintName}"... `);
  let folderId;
  try {
    folderId = await createFolder(sprintName);
    console.log(`OK (folder_id: ${folderId})`);
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    return;
  }

  // 2. Criar projetos fixos
  console.log("\nCriando projetos:");
  const novosProjects = {};
  for (const name of FIXED_PROJECTS) {
    process.stdout.write(`  • ${name}... `);
    try {
      const project = await createProject(name, folderId);
      novosProjects[name] = project.id;
      console.log("OK");
    } catch (err) {
      console.error(`Erro: ${err.message}`);
    }
  }

  // 3. Mover tarefas não concluídas da sprint anterior
  const sprintAnterior = String(Number(numero) - 1).padStart(2, "0");
  const folderIdAnterior = SPRINT_FOLDERS[sprintAnterior];
  let tarefasMovidas = 0;

  if (folderIdAnterior) {
    console.log(`\nBuscando tarefas pendentes da Sprint ${sprintAnterior}...`);
    try {
      const projectsAnteriores = await getProjectsByFolderId(folderIdAnterior);
      for (const proj of projectsAnteriores) {
        const tarefas = await getTasksByProject(proj.id);
        const pendentes = tarefas.filter((t) => !t.checked);
        const novoId = novosProjects[proj.name];
        if (!novoId) {
          if (pendentes.length > 0) console.log(`  ⚠ Projeto "${proj.name}" não encontrado na nova sprint, ${pendentes.length} tarefa(s) ignorada(s).`);
          continue;
        }
        for (const tarefa of pendentes) {
          const ok = await moveTask(tarefa.id, novoId);
          if (ok) tarefasMovidas++;
          else console.log(`  ⚠ Falha ao mover tarefa "${tarefa.content}"`);
        }
      }
    } catch (err) {
      console.error(`Erro ao buscar tarefas anteriores: ${err.message}`);
    }
  } else {
    console.log(`\nSprint anterior (${sprintAnterior}) não encontrada no mapeamento, nenhuma tarefa movida.`);
  }

  // 4. Atualizar SPRINT_FOLDERS em memória
  SPRINT_FOLDERS[numero] = folderId;

  // 5. Atualizar o mapeamento no arquivo fonte
  try {
    const fs = await import("fs/promises");
    const src = await fs.readFile(new URL(import.meta.url), "utf-8");
    const updated = src.replace(
      /const SPRINT_FOLDERS = \{[^}]+\};/s,
      `const SPRINT_FOLDERS = {\n${Object.entries(SPRINT_FOLDERS).map(([k, v]) => `  "${k}": "${v}",`).join("\n")}\n};`
    );
    await fs.writeFile(new URL(import.meta.url), updated, "utf-8");
    console.log("\nSPRINT_FOLDERS atualizado no código.");
  } catch (err) {
    console.error(`\nAviso: não foi possível atualizar SPRINT_FOLDERS no código: ${err.message}`);
  }

  // 6. Resumo
  console.log("\n── Resumo ─────────────────────────────────────────────");
  console.log(`  Pasta criada:     ${sprintName} (${folderId})`);
  console.log(`  Projetos criados: ${Object.keys(novosProjects).length}/${FIXED_PROJECTS.length}`);
  console.log(`  Tarefas movidas:  ${tarefasMovidas}`);
  console.log("───────────────────────────────────────────────────────\n");
}

// ── Tools ────────────────────────────────────────────────────────────
const tools = [
  {
    name: "get_sprint_projects",
    description: "Retorna os projetos de uma sprint pelo número. Aceita '05', '5', '4', etc. Converte internamente para o folder_id correto.",
    input_schema: {
      type: "object",
      properties: {
        sprint_number: { type: "string", description: "Número da sprint, ex: '05', '5', '4'" },
      },
      required: ["sprint_number"],
    },
  },
  {
    name: "get_tasks_by_project",
    description: "Busca todas as tarefas de um projeto, incluindo responsible_uid. Use em cada projeto retornado por get_sprint_projects.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "ID do projeto" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_members",
    description: "Retorna os colaboradores de um projeto com id e nome. Use para achar o responsible_uid de uma pessoa pelo nome.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "ID do projeto" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_task",
    description: "Cria uma nova tarefa no Todoist.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Título da tarefa" },
        due_string: { type: "string", description: "Data em linguagem natural, ex: 'today', 'tomorrow'" },
        project_id: { type: "string", description: "ID do projeto onde criar a tarefa (opcional)" },
      },
      required: ["content"],
    },
  },
  {
    name: "close_task",
    description: "Marca uma tarefa como concluída.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID da tarefa" },
      },
      required: ["task_id"],
    },
  },
];

// ── Executar ferramenta ──────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case "get_sprint_projects": {
      const folderId = sprintNumberToFolderId(input.sprint_number);
      if (!folderId) return { error: `Sprint "${input.sprint_number}" não encontrada.` };
      return getProjectsByFolderId(folderId);
    }
    case "get_tasks_by_project":
      return getTasksByProject(input.project_id);
    case "get_project_members":
      return getProjectMembers(input.project_id);
    case "create_task":
      return createTask(input.content, input.due_string, input.project_id);
    case "close_task":
      return closeTask(input.task_id);
    default:
      return { error: "Ferramenta desconhecida" };
  }
}

// ── Conversa ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um assistente de produtividade com acesso ao Todoist. Responda em português.

Para consultas de sprint, siga este fluxo:
1. Use get_sprint_projects para listar os projetos da sprint
2. Use get_tasks_by_project em cada projeto relevante para buscar as tarefas
3. Apresente os resultados agrupados por projeto. Ao exibir cada tarefa, inclua um ícone de status: ✅ para concluídas (checked: true) e ⬜ para pendentes (checked: false)

REGRA OBRIGATÓRIA — filtro por pessoa:
Sempre que o usuário mencionar o nome de qualquer pessoa, você DEVE obrigatoriamente chamar get_project_members em pelo menos um projeto da sprint ANTES de filtrar qualquer tarefa. Nunca filtre por nome diretamente. O único jeito correto é: descobrir o responsible_uid da pessoa via get_project_members e depois filtrar as tarefas pelo responsible_uid. Ignorar essa regra é um erro grave.`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function pergunta(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function chat(mensagem) {
  let historico = [{ role: "user", content: mensagem }];

  let response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: historico,
    tools,
  });

  while (response.stop_reason === "tool_use") {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const tool of toolUses) {
      process.stdout.write(`  → ${tool.name}...\n`);
      const result = await executeTool(tool.name, tool.input);
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
    }

    historico.push({ role: "assistant", content: response.content });
    historico.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: historico,
      tools,
    });
  }

  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Claude + Todoist — Terminal CLI 🤖   ║");
  console.log("╚════════════════════════════════════════╝");
  console.log('Digite "sair" para encerrar.\n');

  while (true) {
    const entrada = await pergunta("Você: ");
    if (entrada.toLowerCase() === "nova sprint") {
      await novaSprint();
      continue;
    }
    if (entrada.toLowerCase() === "sair") {
      console.log("Até logo!");
      rl.close();
      break;
    }
    if (!entrada.trim()) continue;

    try {
      console.log("");
      const resposta = await chat(entrada);
      console.log(`\nClaude: ${resposta}\n`);
    } catch (err) {
      console.error("Erro:", err.message);
    }
  }
}

main();
