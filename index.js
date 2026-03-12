import { config } from "dotenv";
import * as readline from "readline";
import { chat } from "./src/chat.js";
import { createNewSprint } from "./src/sprint.js";

config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function handleNewSprint() {
  console.log("\n── Nova Sprint ────────────────────────────────────────");
  const number = (await ask("Número da sprint (ex: 06): ")).trim();
  const start = (await ask("Data de início (ex: 23/03): ")).trim();
  const end = (await ask("Data de fim (ex: 03/04): ")).trim();
  await createNewSprint(number, start, end);
}

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Claude + Todoist — Terminal CLI 🤖   ║");
  console.log("╚════════════════════════════════════════╝");
  console.log('Comandos: "nova sprint" | "sair"\n');

  while (true) {
    const input = await ask("Você: ");
    const command = input.trim().toLowerCase();

    if (command === "nova sprint") {
      await handleNewSprint();
      continue;
    }

    if (command === "sair") {
      console.log("Até logo!");
      rl.close();
      break;
    }

    if (!input.trim()) continue;

    try {
      console.log("");
      const response = await chat(input);
      console.log(`\nClaude: ${response}\n`);
    } catch (err) {
      console.error("Erro:", err.message);
    }
  }
}

main();
