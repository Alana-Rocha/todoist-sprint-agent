export const workspaceId = "68213";

export const sprintFolders = {
  "01": "155106",
  "02": "155105",
  "03": "155026",
  "04": "155033",
  "05": "155034",
  "06": "173130",
  "07": "173131",
  "08": "173135",
  "09": "173137",
  10: "174237",
  11: "174240",
  13: "174280",
};

export const fixedProjects = ["OnTick Code"];

export const systemPrompt = `Você é um assistente de produtividade com acesso ao Todoist do usuário. Responda sempre em português.

Para consultas de sprint:
1. Use get_sprint_projects para listar os projetos da sprint
2. Use get_tasks_by_project em cada projeto relevante
3. Apresente os resultados agrupados por projeto com ícone de status: ✅ concluída | ⬜ pendente

REGRA OBRIGATÓRIA — filtro por pessoa:
Sempre que o usuário mencionar o nome de uma pessoa, você DEVE chamar get_project_members em pelo menos um projeto da sprint para descobrir o responsible_uid ANTES de filtrar. Nunca filtre por nome diretamente.`;
