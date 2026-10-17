import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import {
  applyMacros,
  crc32,
  embedCharacterCardInPng,
  emptyCharacterContent,
  formatExampleDialogue,
  parseCharacterCardJson,
  parseCharacterCardPng,
  readPngTextChunks,
  toCharacterCardV2,
  toCharacterCardV3,
} from "../src/lib/character-card.ts";

// ---- 用 Node 自带的 zlib 独立构造 PNG（不依赖被测代码的 CRC 实现） ----
function chunk(type: string, data: Uint8Array): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function makePng(textChunks: Record<string, string> = {}): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]));
  const texts = Object.entries(textChunks).map(([k, v]) =>
    chunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"))
  );
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      ...texts,
      chunk("IDAT", idat),
      chunk("IEND", new Uint8Array()),
    ])
  );
}

function listChunks(png: Uint8Array) {
  const buf = Buffer.from(png);
  const chunks: { type: string; crcOk: boolean }[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const typeAndData = buf.subarray(offset + 4, offset + 8 + length);
    const crc = buf.readUInt32BE(offset + 8 + length);
    chunks.push({ type: typeAndData.subarray(0, 4).toString("latin1"), crcOk: crc === zlib.crc32(typeAndData) });
    offset += 12 + length;
  }
  return chunks;
}

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");

const v2Card = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "艾琳",
    description: "{{char}}是灯塔守护人。",
    personality: "沉稳",
    scenario: "雾夜的灯塔",
    first_mes: "你好，{{user}}。",
    mes_example: "<START>\n{{user}}: 你是谁？\n{{char}}: 守灯人。",
    creator_notes: "测试卡",
    system_prompt: "",
    post_history_instructions: "保持神秘",
    alternate_greetings: ["又见面了。"],
    character_book: { entries: [{ keys: ["灯塔"], content: "古老的灯塔" }] },
    tags: ["悬疑"],
    creator: "someone",
    character_version: "1.0",
    extensions: { talkativeness: "0.5" },
    nickname: "小艾",
  },
};

test("crc32 matches zlib", () => {
  const data = new TextEncoder().encode("tEXtchara\0hello 世界");
  assert.equal(crc32(data), zlib.crc32(Buffer.from(data)));
});

test("parses V2 cards and keeps unknown fields", () => {
  const card = parseCharacterCardJson(v2Card);
  assert.equal(card.name, "艾琳");
  assert.equal(card.firstMessage, "你好，{{user}}。");
  assert.deepEqual(card.alternateGreetings, ["又见面了。"]);
  assert.equal(card.postHistoryInstructions, "保持神秘");
  assert.deepEqual(card.extensions, { talkativeness: "0.5" });
  assert.deepEqual(card.extra, { nickname: "小艾" });
  assert.ok(card.characterBook);
});

test("parses V1 flat cards", () => {
  const card = parseCharacterCardJson({
    name: "Bob",
    description: "desc",
    personality: "kind",
    first_mes: "hi",
    mes_example: "",
    creatorcomment: "old notes",
  });
  assert.equal(card.name, "Bob");
  assert.equal(card.personality, "kind");
  assert.equal(card.creatorNotes, "old notes");
  assert.deepEqual(card.extra, {});
});

test("rejects cards without a name", () => {
  assert.throws(() => parseCharacterCardJson({ spec: "chara_card_v2", data: { name: " " } }), /名称/);
  assert.throws(() => parseCharacterCardJson("text"), /JSON 对象/);
});

test("V2 and V3 export round-trip through the parser", () => {
  const card = parseCharacterCardJson(v2Card);
  assert.deepEqual(parseCharacterCardJson(toCharacterCardV2(card)), { ...card, extra: {} });
  assert.deepEqual(parseCharacterCardJson(toCharacterCardV3(card)), {
    ...card,
    extra: { group_only_greetings: [], nickname: "小艾" },
  });
  // V2 导出保留 V1 顶层字段
  assert.equal(toCharacterCardV2(card).first_mes, card.firstMessage);
});

test("reads a V2 card from a PNG chara chunk", () => {
  const png = makePng({ chara: b64(v2Card) });
  assert.equal(parseCharacterCardPng(png).name, "艾琳");
});

test("prefers ccv3 over chara and accepts raw JSON text", () => {
  const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Card.data, name: "新版" } };
  const png = makePng({ chara: b64(v2Card), ccv3: b64(v3) });
  assert.equal(parseCharacterCardPng(png).name, "新版");

  const raw = makePng({ chara: JSON.stringify({ name: "Raw" }) });
  assert.equal(parseCharacterCardPng(raw).name, "Raw");
});

test("reports PNGs without card data", () => {
  assert.throws(() => parseCharacterCardPng(makePng({ Software: "x" })), /没有角色卡数据/);
  assert.throws(() => parseCharacterCardPng(new Uint8Array([1, 2, 3])), /PNG/);
});

test("embedding replaces old card chunks and keeps the image valid", () => {
  const png = makePng({ chara: b64({ name: "旧卡" }), Software: "editor" });
  const card = { ...emptyCharacterContent("新卡"), description: "中文描述" };
  const out = embedCharacterCardInPng(png, card);

  const chunks = listChunks(out);
  assert.ok(chunks.every((c) => c.crcOk), "all CRCs valid");
  assert.deepEqual(
    chunks.map((c) => c.type),
    ["IHDR", "tEXt", "IDAT", "tEXt", "tEXt", "IEND"]
  );
  const texts = readPngTextChunks(out);
  assert.equal(texts.Software, "editor");
  assert.ok(texts.chara && texts.ccv3);
  assert.equal(parseCharacterCardPng(out).description, "中文描述");
});

test("macros replace char and user placeholders case-insensitively", () => {
  const ctx = { char: "艾琳", user: "你" };
  assert.equal(applyMacros("{{char}}看着{{User}}。<BOT>和<USER>", ctx), "艾琳看着你。艾琳和你");
  assert.equal(applyMacros("{{ CHAR }}", ctx), "艾琳");
});

test("example dialogue splits on START markers", () => {
  const blocks = formatExampleDialogue("<START>\n{{user}}: 嗨\n{{char}}: 你好\n<START>\n{{char}}: 再见", {
    char: "艾琳",
    user: "你",
  });
  assert.deepEqual(blocks, ["你: 嗨\n艾琳: 你好", "艾琳: 再见"]);
});
