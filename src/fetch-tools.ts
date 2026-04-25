import "dotenv/config";
import { Composio } from "@composio/core";
import { writeFile } from "fs/promises";

const composio = new Composio();

for (const toolkit of ["googlesuper", "github"] as const) {
  const tools = await composio.tools.getRawComposioTools({
    toolkits: [toolkit],
    limit: 1000,
  });
  const file = `${toolkit}_tools.json`;
  await writeFile(file, JSON.stringify(tools, null, 2), "utf-8");
  console.log(`${toolkit}: ${tools.length} tools -> ${file}`);
}
