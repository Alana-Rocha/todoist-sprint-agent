const base_url = "https://api.todoist.com/api/v1";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.TODOIST_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function restGet(path) {
  const res = await fetch(`${base_url}${path}`, {
    headers: { Authorization: `Bearer ${process.env.TODOIST_API_TOKEN}` },
  });
  return res.json();
}

async function restPost(path, body) {
  const res = await fetch(`${base_url}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function syncRequest(commands) {
  const res = await fetch(`${base_url}/sync`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ commands }),
  });
  return { ok: res.ok, data: await res.json() };
}

export async function getProjects() {
  const data = await restGet("/projects");
  const list = Array.isArray(data) ? data : (data.results || []);
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    folder_id: String(p.folder_id || ""),
  }));
}

export async function getProjectsByFolderId(folder_id) {
  const projects = await getProjects();
  return projects.filter((p) => p.folder_id === String(folder_id));
}

export async function getTasksByProject(project_id) {
  const data = await restGet(`/tasks?project_id=${project_id}`);
  const list = Array.isArray(data) ? data : (data.results || []);
  return list.map((t) => ({
    id: t.id,
    content: t.content,
    due: t.due?.string || t.due?.date || null,
    deadline: t.deadline?.date || null,
    responsible_uid: t.responsible_uid || null,
    checked: t.checked || false,
    section_id: t.section_id || null,
  }));
}

export async function getProjectMembers(project_id) {
  return restGet(`/projects/${project_id}/collaborators`);
}

export async function createTask(content, due_string = null, project_id = null) {
  const body = { content };
  if (due_string) body.due_string = due_string;
  if (project_id) body.project_id = project_id;
  const { data } = await restPost("/tasks", body);
  return data;
}

export async function closeTask(task_id) {
  const res = await fetch(`${base_url}/tasks/${task_id}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TODOIST_API_TOKEN}` },
  });
  return res.ok;
}

export async function moveTask(task_id, project_id) {
  const res = await fetch(`${base_url}/tasks/${task_id}/move`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ project_id }),
  });
  if (res.ok) return true;

  const uuid = crypto.randomUUID();
  const { ok, data } = await syncRequest([{
    type: "item_move",
    uuid,
    args: { id: task_id, project_id },
  }]);
  return ok && data.sync_status?.[uuid] === "ok";
}

export async function createFolder(name, workspace_id) {
  const uuid = crypto.randomUUID();
  const temp_id = "folder-" + crypto.randomUUID();
  const { ok, data } = await syncRequest([{
    type: "folder_add",
    uuid,
    temp_id,
    args: { name, workspace_id },
  }]);

  console.log(`  [debug createFolder] ok: ${ok}`);
  console.log(`  [debug createFolder] data: ${JSON.stringify(data)}`);

  if (!ok || data.sync_status?.[uuid] !== "ok") {
    throw new Error(`Falha ao criar pasta: ${JSON.stringify(data.sync_status?.[uuid])}`);
  }

  return String(data.temp_id_mapping[temp_id]);
}

export async function createProject(name, workspace_id) {
  const { ok, status, data } = await restPost("/projects", { name, workspace_id });
  if (!ok) throw new Error(`Failed to create project "${name}": HTTP ${status}`);
  return data;
}

export async function deleteFolder(folder_id) {
  const uuid = crypto.randomUUID();
  const { ok, data } = await syncRequest([{
    type: "folder_delete",
    uuid,
    args: { id: Number(folder_id) },
  }]);
  if (!ok || data.sync_status?.[uuid] !== "ok") {
    throw new Error(`Falha ao deletar pasta: ${JSON.stringify(data.sync_status?.[uuid])}`);
  }
  return true;
}

export async function assignProjectToFolder(project_id, folder_id) {
  const uuid = crypto.randomUUID();
  const { ok, data } = await syncRequest([{
    type: "project_update",
    uuid,
    args: { id: project_id, folder_id: Number(folder_id) },
  }]);
  return ok && data.sync_status?.[uuid] === "ok";
}