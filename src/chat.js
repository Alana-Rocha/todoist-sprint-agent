import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt } from "./config.js";
import { sprintToFolderId } from "./sprint.js";
import {
  getProjectsByFolderId,
  getTasksByProject,
  getProjectMembers,
  createTask,
  closeTask,
} from "./todoist.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: "get_sprint_projects",
    description: "Returns projects of a sprint by number (e.g. '05', '5', '4').",
    input_schema: {
      type: "object",
      properties: {
        sprint_number: { type: "string", description: "Sprint number, e.g. '05', '5'" },
      },
      required: ["sprint_number"],
    },
  },
  {
    name: "get_tasks_by_project",
    description: "Fetches all tasks of a project including responsible_uid and checked status.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_members",
    description: "Returns project collaborators. Use to find a person's responsible_uid by name.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_task",
    description: "Creates a new task in Todoist.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        due_string: { type: "string", description: "e.g. 'today', 'tomorrow', 'next monday'" },
        project_id: { type: "string" },
      },
      required: ["content"],
    },
  },
  {
    name: "close_task",
    description: "Marks a task as completed.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
      },
      required: ["task_id"],
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case "get_sprint_projects": {
      const folder_id = sprintToFolderId(input.sprint_number);
      if (!folder_id) return { error: `Sprint "${input.sprint_number}" not found.` };
      return getProjectsByFolderId(folder_id);
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
      return { error: "Unknown tool" };
  }
}

export async function chat(message) {
  let history = [{ role: "user", content: message }];

  let response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: history,
    tools,
  });

  while (response.stop_reason === "tool_use") {
    const tool_uses = response.content.filter((b) => b.type === "tool_use");
    const tool_results = [];

    for (const tool of tool_uses) {
      process.stdout.write(`  → ${tool.name}...\n`);
      const result = await executeTool(tool.name, tool.input);
      tool_results.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(result),
      });
    }

    history.push({ role: "assistant", content: response.content });
    history.push({ role: "user", content: tool_results });

    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: history,
      tools,
    });
  }

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}