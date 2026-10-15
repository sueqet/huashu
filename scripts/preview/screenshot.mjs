// 在手机尺寸下截取主要界面，用于在没有安卓设备时检查布局。
// 用法：pnpm build && node scripts/preview/screenshot.mjs <输出目录> [宽度] [高度]
// 依赖 Playwright（可通过 PLAYWRIGHT_MODULE 指定模块路径）。
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dist = path.join(root, "dist");
const [outDir = path.join(root, "preview-shots"), width = "360", height = "740"] = process.argv.slice(2);

const require = createRequire(process.env.PLAYWRIGHT_MODULE || import.meta.url);
const { chromium } = require("playwright");

const now = Date.now();
const projectId = "p-demo";
const convId = "c-demo";
const node = (id, role, content, parentId, childrenIds = [], extra = {}) => ({
  id, conversationId: convId, parentId, childrenIds, role, content,
  isUserEdited: role === "user", isPartial: false, isPinned: false, isStarred: false,
  createdAt: now, updatedAt: now, ...extra,
});
const seed = {
  "config.json": JSON.stringify({
    schemaVersion: 1,
    providers: [{
      id: "prov", name: "示例厂商", apiUrl: "https://api.example.com/v1", apiKey: "sk-demo-1234",
      models: ["story-model"], defaultModel: "story-model", maxContextTokens: 128000,
      modelConfig: { temperature: 0.8, maxTokens: 2048, topP: 1, frequencyPenalty: 0, presencePenalty: 0 },
    }],
    activeProviderId: "prov", activeModel: "story-model", autoGenerateOnEnter: true,
  }),
  [`projects/${projectId}/meta.json`]: JSON.stringify({
    schemaVersion: 1, id: projectId, name: "雾港奇谈", description: "蒸汽朋克港口城市的悬疑冒险",
    conversationOrder: [convId], createdAt: now, updatedAt: now, isArchived: false, mode: "story",
    storyConfig: {
      worldSetting: "终年被雾笼罩的港口城市，蒸汽机与古老的潮汐信仰并存。",
      rules: "玩家扮演刚抵达雾港的侦探。", openingMessage: "雾笛长鸣，你踏上了湿滑的码头……",
      characters: [{ name: "艾琳", description: "灯塔守护人，知道很多秘密", isOriginal: true }],
      chapterSummaries: [],
    },
  }),
  [`projects/${projectId}/conversations/${convId}.json`]: JSON.stringify({
    schemaVersion: 1, id: convId, projectId, name: "第1章", rootNodeIds: ["n1"],
    createdAt: now, updatedAt: now,
    nodes: {
      n1: node("n1", "assistant", "雾笛长鸣，你踏上了湿滑的码头。远处灯塔的光在雾中若隐若现。", null, ["n2"]),
      n2: node("n2", "user", "我向灯塔走去。", "n1", ["n3", "n6"]),
      n3: node("n3", "assistant", "灯塔下站着一位披着油布斗篷的女人。\n\n[选项1] 上前搭话\n[选项2] 躲在暗处观察\n[选项3] 返回码头", "n2", ["n4"]),
      n4: node("n4", "user", "上前搭话。", "n3", ["n5"]),
      n5: node("n5", "assistant", "“你不该在起雾的夜里来这里。”她低声说。", "n4"),
      n6: node("n6", "assistant", "（另一个分支）灯塔的门虚掩着，里面传来齿轮转动的声音。", "n2"),
    },
  }),
};

const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://localhost:${server.address().port}/`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
await page.addInitScript(`window.__HUASHU_SEED__ = ${JSON.stringify(seed)};`);
await page.addInitScript({ path: path.join(here, "tauri-mock.js") });

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}.png${overflow > 0 ? `  (横向溢出 ${overflow}px)` : ""}`);
};
const step = async (name, fn) => {
  try {
    await fn();
    await shot(name);
  } catch (err) {
    console.log(`${name}: 失败 - ${err.message.split("\n")[0]}`);
  }
};

await page.goto(url);
await page.getByText("雾港奇谈").first().waitFor({ state: "attached", timeout: 10000 });
await shot("01-projects");
await step("01b-sidebar-open", () => page.locator("button:has(svg.lucide-chevron-right)").first().click());
await page.goto(url);
await page.getByText("雾港奇谈").first().waitFor({ state: "attached", timeout: 10000 });
await step("02-project-detail", () => page.getByText("雾港奇谈").first().click());
await step("03-canvas", async () => {
  await page.getByText("第1章").first().click();
  await page.locator(".react-flow").waitFor({ timeout: 5000 });
});
await step("04-chat", async () => {
  await page.getByText("你不该在起雾的夜里来这里", { exact: false }).first().dblclick();
});
await step("05-settings", async () => {
  await page.goto(url);
  await page.locator("button:has(svg.lucide-settings)").first().click();
});

await step("06-provider-form", async () => {
  await page.getByText("示例厂商").first().click();
  await page.waitForTimeout(300);
  const edit = page.locator("button:has(svg.lucide-pencil), button:has(svg.lucide-edit), button:has(svg.lucide-square-pen)").first();
  if (await edit.count()) await edit.click();
});
await page.setViewportSize({ width: Number(width), height: 2400 });
await step("06b-provider-form-full", async () => {});

console.log(problems.length ? `问题：\n${problems.join("\n")}` : "无页面错误");
await browser.close();
server.close();
