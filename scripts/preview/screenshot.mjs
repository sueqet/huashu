// 在手机尺寸下截取主要界面，用于在没有安卓设备时检查布局。
// 用法：pnpm build && node scripts/preview/screenshot.mjs <输出目录> [宽度] [高度]
// 依赖 Playwright（可通过 PLAYWRIGHT_MODULE 指定模块路径）。
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

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
      persona: { name: "林", description: "刚抵达雾港的侦探" },
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

// 一张 SillyTavern V2 PNG 角色卡（64x64 纯色头像 + chara 文本块），用于测试导入
function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}
function makeCardPng(card) {
  const size = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [40, 90, 160]).flat())]);
  const chara = Buffer.from(JSON.stringify(card), "utf8").toString("base64");
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", Buffer.from(`chara\0${chara}`, "latin1")),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(Array(size).fill(row)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const importCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "港务长",
    description: "{{char}}掌管雾港码头四十年，对{{user}}的来历很好奇。",
    personality: "精明、多疑",
    scenario: "",
    first_mes: "“又一个外乡人。”{{char}}眯起眼睛打量着{{user}}。",
    mes_example: "<START>\n{{user}}: 最近港口有什么怪事？\n{{char}}: 怪事？雾港每天都有怪事。",
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: ["“码头今晚封锁。”"],
    tags: ["雾港", "NPC"],
    creator: "preview",
    character_version: "1.0",
    extensions: {},
  },
};
// 模拟安卓文件选择器：content:// 地址没有扩展名
const CARD_URI = "content://com.android.providers.media.documents/document/image%3A42";
const seedBinary = { [CARD_URI]: makeCardPng(importCard).toString("base64") };

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
await page.addInitScript(`window.__HUASHU_SEED__ = ${JSON.stringify(seed)}; window.__HUASHU_SEED_BINARY__ = ${JSON.stringify(seedBinary)};`);

// 假的模型接口：记录请求体，返回一段流式回复
const chatRequests = [];
await page.route("https://api.example.com/v1/chat/completions", async (route) => {
  chatRequests.push(JSON.parse(route.request().postData() || "{}"));
  await route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" },
    body: 'data: {"choices":[{"delta":{"content":"雾更浓了。"}}]}\n\ndata: [DONE]\n\n',
  });
});
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
await page.setViewportSize({ width: Number(width), height: Number(height) });

// 角色卡：旧项目的内联角色应已迁移进角色库
await step("07-characters", async () => {
  await page.goto(url);
  await page.locator("button:has(svg.lucide-users)").first().click();
  await page.getByText("艾琳").first().waitFor({ timeout: 5000 });
});
await step("07b-characters-imported", async () => {
  await page.evaluate((uri) => { window.__HUASHU_DIALOG_OPEN__ = [uri]; }, CARD_URI);
  await page.getByRole("button", { name: "导入" }).click();
  await page.getByText("港务长").first().waitFor({ timeout: 5000 });
  await page.evaluate(() => { window.__HUASHU_DIALOG_OPEN__ = null; });
});
await step("08-character-editor", async () => {
  await page.getByText("艾琳").first().click();
  await page.getByText("更换头像").waitFor({ timeout: 5000 });
  // 用无扩展名的 content:// 地址更换头像
  await page.evaluate((uri) => { window.__HUASHU_DIALOG_OPEN__ = uri; }, CARD_URI);
  await page.getByRole("button", { name: "更换头像" }).click();
  await page.locator("img[alt='艾琳']").waitFor({ timeout: 5000 });
  await page.evaluate(() => { window.__HUASHU_DIALOG_OPEN__ = null; });
});
await page.setViewportSize({ width: Number(width), height: 2000 });
await step("08b-character-editor-full", async () => {
  await page.getByText("进阶设置").click();
});
await page.setViewportSize({ width: Number(width), height: Number(height) });

// 故事设定：把导入的角色加入故事
// 注意：之后不要 page.goto，刷新会重置内存文件系统
await step("09-story-setup", async () => {
  await page.locator("button:has(svg.lucide-arrow-left)").first().click();
  await page.locator("button:has(svg.lucide-folder-open)").first().click();
  await page.getByText("雾港奇谈").first().click();
  await page.getByRole("button", { name: "故事设定" }).click();
  await page.getByText("出场角色").first().scrollIntoViewIfNeeded();
});
await step("10-character-picker", async () => {
  await page.getByRole("button", { name: "添加" }).first().click();
  await page.getByText("添加出场角色").waitFor({ timeout: 5000 });
});
await step("10b-story-setup-with-two", async () => {
  await page.locator("[role=dialog] button", { hasText: "港务长" }).click();
  await page.getByText("港务长").first().waitFor({ timeout: 5000 });
  await page.getByText("出场角色").first().scrollIntoViewIfNeeded();
});

await page.setViewportSize({ width: Number(width), height: 2200 });
await step("10c-story-setup-full", async () => {});
await page.setViewportSize({ width: Number(width), height: Number(height) });

// 剧本模板：导出后再导入，检查 2.0 格式内嵌角色卡和头像
await step("10d-template-roundtrip", async () => {
  await page.evaluate(() => { window.__HUASHU_DIALOG_SAVE__ = "export/fog.huashu-story"; });
  await page.getByRole("button", { name: "导出剧本" }).first().click();
  await page.waitForTimeout(800);
  const exported = await page.evaluate(() => {
    const bytes = window.__HUASHU_MOCK_FS__.files.get("export/fog.huashu-story");
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  });
  const checks = {
    "剧本导出为 2.0": exported?.version === "2.0",
    "剧本内嵌两张角色卡": exported?.characters?.length === 2,
    "剧本内嵌头像": exported?.characters?.every((c) => c.avatar?.startsWith("data:image/png")),
  };
  await page.evaluate(() => { window.__HUASHU_DIALOG_OPEN__ = "export/fog.huashu-story"; });
  await page.getByRole("button", { name: "导入剧本" }).first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__HUASHU_DIALOG_OPEN__ = null; window.__HUASHU_DIALOG_SAVE__ = null; });
  const cardFiles = await page.evaluate(() =>
    [...window.__HUASHU_MOCK_FS__.files.keys()].filter((k) => k.startsWith("library/characters/") && k.endsWith(".json")).length
  );
  checks["导入剧本后角色写入角色库"] = cardFiles === 4;
  for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "✓" : "✗"} ${name}`);
});

// 发一条消息，检查发给模型的系统提示词
await step("11-chat-sent", async () => {
  await page.getByRole("button", { name: "章节", exact: true }).click();
  await page.getByText("第1章").first().click();
  await page.locator(".react-flow").waitFor({ timeout: 5000 });
  await page.getByText("你不该在起雾的夜里来这里", { exact: false }).first().dblclick();
  await page.locator("textarea").last().fill("我问她灯塔的事。");
  await page.locator("textarea").last().press("Enter");
  await page.getByText("雾更浓了。").first().waitFor({ timeout: 5000 });
});
if (chatRequests.length > 0) {
  const system = chatRequests[0].messages?.find((m) => m.role === "system")?.content || "";
  const checks = {
    "旧角色已迁移进提示词": system.includes("### 艾琳"),
    "导入的角色进入提示词": system.includes("### 港务长"),
    "{{char}}/{{user}} 已替换": system.includes("港务长掌管雾港码头四十年，对林的来历很好奇") && !system.includes("{{"),
    "玩家人设": system.includes("玩家扮演：林"),
    "示例对话": system.includes("林: 最近港口有什么怪事？"),
  };
  for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "✓" : "✗"} ${name}`);
  fs.writeFileSync(path.join(outDir, "system-prompt.txt"), system);
} else {
  console.log("✗ 没有捕获到模型请求");
}

// 角色扮演模式：港务长设为主角色后再发一条
await step("12-roleplay-setup", async () => {
  // 全屏对话 → 画布 → 项目页
  await page.locator("button:has(svg.lucide-arrow-left)").first().click();
  await page.locator(".react-flow").waitFor({ timeout: 5000 });
  await page.locator("button:has(svg.lucide-arrow-left)").first().click();
  await page.getByRole("button", { name: "故事设定" }).click();
  await page.getByRole("button", { name: /角色扮演/ }).click();
  await page.getByRole("button", { name: "设为主角色" }).click();
  await page.getByText("主角色").first().waitFor({ timeout: 5000 });
  await page.getByText("出场角色").first().scrollIntoViewIfNeeded();
});
await step("13-roleplay-chat", async () => {
  await page.getByRole("button", { name: "章节", exact: true }).click();
  await page.getByText("第1章").first().click();
  await page.locator(".react-flow").waitFor({ timeout: 5000 });
  await page.getByText("雾更浓了。").first().dblclick();
  await page.locator("textarea").last().fill("我出示了侦探证件。");
  await page.locator("textarea").last().press("Enter");
  await page.waitForTimeout(800);
});
if (chatRequests.length > 1) {
  const messages = chatRequests[1].messages || [];
  const system = messages[0]?.content || "";
  const checks = {
    "角色扮演指令以主角色开头": system.startsWith("[指令]\n你将扮演港务长，与林进行角色扮演。"),
    "主角色在角色设定，其余在其他角色": system.includes("[角色设定]\n### 港务长") && system.includes("[其他角色]\n### 艾琳"),
    "不再要求给出选项": !system.includes("[选项1]"),
  };
  for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "✓" : "✗"} ${name}`);
  fs.writeFileSync(path.join(outDir, "system-prompt-roleplay.txt"), system);
} else {
  console.log("✗ 没有捕获到角色扮演模式的请求");
}

console.log(problems.length ? `问题：\n${problems.join("\n")}` : "无页面错误");
await browser.close();
server.close();
