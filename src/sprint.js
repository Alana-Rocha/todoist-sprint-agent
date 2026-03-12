import { fixedProjects, sprintFolders, workspaceId } from "./config.js";
import {
  assignProjectToFolder,
  createFolder,
  createProject,
  getProjectsByFolderId,
  getTasksByProject,
  moveTask,
} from "./todoist.js";

export function sprintToFolderId(sprint_number) {
  const normalized = String(sprint_number).padStart(2, "0");
  return sprintFolders[normalized] || null;
}

async function createSprintFolder(sprint_name) {
  const folder_id = await createFolder(sprint_name, workspaceId);
  console.log(`  ✓ Pasta criada (id: ${folder_id})`);
  return folder_id;
}

async function createSprintProjects(folder_id) {
  const created_projects = {};

  for (const name of fixedProjects) {
    try {
      const project = await createProject(name, workspaceId);
      const assigned = await assignProjectToFolder(project.id, folder_id);

      if (assigned) {
        console.log(`  ✓ ${name} (id: ${project.id})`);
        created_projects[name] = project.id;
      } else {
        console.log(`  ⚠ ${name} criado mas não vinculado à pasta`);
      }
    } catch (err) {
      console.log(`  ✗ Falha ao criar "${name}": ${err.message}`);
    }
  }

  return created_projects;
}

async function movePendingTasks(sprint_number, new_projects) {
  const previous_number = String(Number(sprint_number) - 1).padStart(2, "0");
  const previous_folder_id = sprintFolders[previous_number];

  if (!previous_folder_id) {
    console.log(
      `\nSprint anterior (${previous_number}) não encontrada, nenhuma tarefa migrada.`,
    );
    return 0;
  }

  console.log(`\nMigrando tarefas pendentes da Sprint ${previous_number}...`);
  let moved_count = 0;

  const previous_projects = await getProjectsByFolderId(previous_folder_id);

  for (const project of previous_projects) {
    const tasks = await getTasksByProject(project.id);
    const pending = tasks.filter((t) => !t.checked);

    if (!pending.length) continue;

    const new_project_id = new_projects[project.name];
    if (!new_project_id) {
      console.log(
        `  ⚠ "${project.name}" não encontrado na nova sprint — ${pending.length} tarefa(s) ignorada(s)`,
      );
      continue;
    }

    for (const task of pending) {
      const ok = await moveTask(task.id, new_project_id);
      if (ok) moved_count++;
      else console.log(`  ✗ Falha ao mover: "${task.content}"`);
    }
  }

  return moved_count;
}

async function saveFolderMapping(sprint_number, folder_id) {
  sprintFolders[sprint_number] = folder_id;

  const fs = await import("fs/promises");
  const file_url = new URL("./config.js", import.meta.url);
  const src = await fs.readFile(file_url, "utf-8");

  const entries = Object.entries(sprintFolders)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  "${k}": "${v}",`)
    .join("\n");

  const updated = src.replace(
    /export const sprintFolders = \{[^}]+\};/s,
    `export const sprintFolders = {\n${entries}\n};`,
  );

  await fs.writeFile(file_url, updated, "utf-8");
  console.log("\n✓ Mapeamento de sprints salvo em config.js");
}

export async function createNewSprint(sprint_number, start_date, end_date) {
  const normalized = sprint_number.padStart(2, "0");

  if (sprintFolders[normalized]) {
    console.log(
      `⚠ Sprint ${normalized} já existe (folder_id: ${sprintFolders[normalized]}).`,
    );
    return;
  }

  const sprint_name = `Sprint ${normalized} [${start_date} → ${end_date}]`;
  console.log(`\nCriando "${sprint_name}"...`);

  const folder_id = await createSprintFolder(sprint_name);
  const new_projects = await createSprintProjects(folder_id);
  const moved_count = await movePendingTasks(normalized, new_projects);

  await saveFolderMapping(normalized, folder_id);

  console.log("\n── Resumo ─────────────────────────────────────────────");
  console.log(`  Pasta:            ${sprint_name} (${folder_id})`);
  console.log(
    `  Projetos criados: ${Object.keys(new_projects).length}/${fixedProjects.length}`,
  );
  console.log(`  Tarefas movidas:  ${moved_count}`);
  console.log("───────────────────────────────────────────────────────\n");
}
