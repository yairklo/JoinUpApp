import fs from "node:fs";
import path from "node:path";

export const THEMES = ["light", "dark"];
export const WEB_VIEWPORTS = ["desktop", "mobile"];

const HEADER = `# Design screens

Scripted screenshots for the design agent. Do not browse the app to refresh these.

- Web: \`cd next_app && npm run screens:web\` (optional \`-- --grep <screen-id|feature>\`). Targets \`BASE_URL\`, default the Dev preview. Needs \`CLERK_SECRET_KEY\` / \`CLERK_PUBLISHABLE_KEY\` (\`sk_test_\` / \`pk_test_\` only). Does not start a local server.
- Mobile: \`cd mobile_app && npm run screens:mobile\` (optional \`-- --feature <name>\`). Maestro flows in \`.maestro/screenshots/\`. Needs a device or emulator with the Dev API build. Seeded users have no password; the flow signs in only when an email-code field (\`sign-in-code\`) is on screen, otherwise it expects an existing session.
- Users: \`adult-a\`, \`adult-b\`, \`minor-c\`, \`organizer-o\` (\`+clerk_test@example.com\`, code 424242).
- Files: \`web/<feature>/<screen-id>-<light|dark>.png\` and \`mobile/<feature>/<screen-id>-<light|dark>.png\`. Web screen ids include the viewport (\`profile-desktop\`, \`profile-mobile\`).

Earlier hand-captured frames live in \`docs/plans/d1-feature1-screens/\`.

| screen id | platform | route/screen | source file | theme | last captured (sha, date) |
| --- | --- | --- | --- | --- | --- |
`;

export function webRows(screens) {
  const rows = [];
  for (const screen of screens) {
    for (const viewport of WEB_VIEWPORTS) {
      for (const theme of THEMES) {
        rows.push({
          id: `${screen.id}-${viewport}`,
          platform: "web",
          route: screen.route,
          source: screen.source,
          theme,
          captured: "not yet",
        });
      }
    }
  }
  return rows;
}

export function mobileRows(mobileScreens) {
  const rows = [];
  for (const screen of mobileScreens) {
    for (const theme of THEMES) {
      rows.push({
        id: screen.id,
        platform: "mobile",
        route: screen.route,
        source: screen.source,
        theme,
        captured: "not yet",
      });
    }
  }
  return rows;
}

function lineKey(row) {
  return `${row.id}\t${row.platform}\t${row.theme}`;
}

export function parseIndex(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    if (cells[0] === "screen id" || cells[0].startsWith("---")) continue;
    rows.push({
      id: cells[0],
      platform: cells[1],
      route: cells[2],
      source: cells[3],
      theme: cells[4],
      captured: cells[5],
    });
  }
  return rows;
}

export function renderIndex(rows) {
  const body = rows
    .map((row) => `| ${row.id} | ${row.platform} | ${row.route} | ${row.source} | ${row.theme} | ${row.captured} |`)
    .join("\n");
  return `${HEADER}${body}\n`;
}

/** Overlay `updates` onto the catalog rows, preserving prior captures that this run did not retake. */
export function mergeRows(catalogRows, previousMarkdown, updates) {
  const previous = previousMarkdown ? parseIndex(previousMarkdown) : [];
  const byKey = new Map(previous.map((row) => [lineKey(row), row]));
  for (const row of catalogRows) {
    const key = lineKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  for (const update of updates) {
    byKey.set(lineKey(update), update);
  }
  const order = new Map(catalogRows.map((row, index) => [lineKey(row), index]));
  return [...byKey.values()].sort((a, b) => (order.get(lineKey(a)) ?? 1000) - (order.get(lineKey(b)) ?? 1000));
}

export function writeIndex(indexPath, catalogRows, updates) {
  const previous = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const rows = mergeRows(catalogRows, previous, updates);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, renderIndex(rows));
}
