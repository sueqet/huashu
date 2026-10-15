// 浏览器里模拟 Tauri IPC（仅用于开发预览/截图，不会打包进应用）。
// 提供内存文件系统（plugin-fs）、plugin-store 和 plugin-dialog 的最小实现。
// 初始数据来自 window.__HUASHU_SEED__：{ "相对路径": "文件内容字符串" }。
(() => {
  const files = new Map(); // path -> Uint8Array
  const dirs = new Set([""]);
  const encoder = new TextEncoder();

  const norm = (p) => String(p).replace(/^\/+|\/+$/g, "");
  const parentOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const mkdirp = (p) => {
    let cur = norm(p);
    while (cur && !dirs.has(cur)) {
      dirs.add(cur);
      cur = parentOf(cur);
    }
  };
  const writeBytes = (p, bytes) => {
    p = norm(p);
    mkdirp(parentOf(p));
    files.set(p, bytes);
  };

  for (const [path, content] of Object.entries(window.__HUASHU_SEED__ || {})) {
    writeBytes(path, encoder.encode(content));
  }

  const toBytes = (data) => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return Uint8Array.from(data);
    return encoder.encode(String(data));
  };

  const stores = new Map(); // rid -> Map
  let nextRid = 1;

  const handlers = {
    "plugin:fs|exists": ({ path }) => files.has(norm(path)) || dirs.has(norm(path)),
    "plugin:fs|mkdir": ({ path }) => void mkdirp(path),
    "plugin:fs|read_dir": ({ path }) => {
      const base = norm(path);
      const prefix = base ? `${base}/` : "";
      const names = new Map();
      for (const f of files.keys()) {
        if (f.startsWith(prefix) && !f.slice(prefix.length).includes("/")) names.set(f.slice(prefix.length), "file");
      }
      for (const d of dirs) {
        if (d && d.startsWith(prefix) && !d.slice(prefix.length).includes("/")) names.set(d.slice(prefix.length), "dir");
      }
      return [...names].map(([name, kind]) => ({
        name,
        isDirectory: kind === "dir",
        isFile: kind === "file",
        isSymlink: false,
      }));
    },
    "plugin:fs|read_file": ({ path }) => {
      const bytes = files.get(norm(path));
      if (!bytes) throw new Error(`No such file: ${path}`);
      return Array.from(bytes);
    },
    "plugin:fs|read_text_file": (args) => handlers["plugin:fs|read_file"](args),
    "plugin:fs|write_file": (data, options) =>
      writeBytes(decodeURIComponent(options.headers.path), toBytes(data)),
    "plugin:fs|write_text_file": (data, options) =>
      writeBytes(decodeURIComponent(options.headers.path), toBytes(data)),
    "plugin:fs|remove": ({ path, options }) => {
      const p = norm(path);
      files.delete(p);
      if (options?.recursive) {
        for (const f of [...files.keys()]) if (f.startsWith(`${p}/`)) files.delete(f);
        for (const d of [...dirs]) if (d === p || d.startsWith(`${p}/`)) dirs.delete(d);
      } else {
        dirs.delete(p);
      }
    },
    "plugin:fs|rename": ({ oldPath, newPath }) => {
      const bytes = files.get(norm(oldPath));
      if (!bytes) throw new Error(`No such file: ${oldPath}`);
      files.delete(norm(oldPath));
      writeBytes(newPath, bytes);
    },
    "plugin:store|load": () => {
      const rid = nextRid++;
      stores.set(rid, new Map());
      return rid;
    },
    "plugin:store|get_store": () => null,
    "plugin:store|get": ({ rid, key }) => {
      const store = stores.get(rid);
      return store?.has(key) ? [store.get(key), true] : [null, false];
    },
    "plugin:store|set": ({ rid, key, value }) => void stores.get(rid)?.set(key, value),
    "plugin:store|has": ({ rid, key }) => !!stores.get(rid)?.has(key),
    "plugin:store|delete": ({ rid, key }) => !!stores.get(rid)?.delete(key),
    "plugin:store|save": () => undefined,
    "plugin:dialog|open": () => null,
    "plugin:dialog|save": () => null,
    "plugin:dialog|message": () => undefined,
    "plugin:dialog|ask": () => true,
    "plugin:dialog|confirm": () => true,
  };

  let callbackId = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    async invoke(cmd, args = {}, options) {
      const handler = handlers[cmd];
      if (!handler) {
        console.warn(`[tauri-mock] unhandled command: ${cmd}`);
        return null;
      }
      return handler(args, options);
    },
    transformCallback(callback, once) {
      const id = callbackId++;
      window[`_${id}`] = (payload) => {
        if (once) delete window[`_${id}`];
        callback?.(payload);
      };
      return id;
    },
    unregisterCallback(id) {
      delete window[`_${id}`];
    },
    convertFileSrc(path) {
      return path;
    },
  };
  window.__HUASHU_MOCK_FS__ = { files, dirs };
})();
