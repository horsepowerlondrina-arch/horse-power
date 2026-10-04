import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
function worker() {
  let listener: any;
  let fail = false;
  const calls: any[] = [];
  const area = () => {
    const data: Record<string, any> = {};
    return {
      data,
      async setAccessLevel() {},
      async get(key: string) {
        return structuredClone({ [key]: data[key] });
      },
      async set(v: any) {
        Object.assign(data, structuredClone(v));
      },
      async remove(k: string) {
        delete data[k];
      },
    };
  };
  const local = area(),
    session = area();
  const chrome = {
    storage: { local, session },
    runtime: {
      getURL: (p: string) => "chrome-extension://" + "a".repeat(32) + "/" + p,
      onMessage: { addListener: (f: any) => (listener = f) },
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    tabs: { async update() {}, async create() {} },
  };
  runInNewContext(readFileSync("extension/horse-power/background.js", "utf8"), {
    chrome,
    URL,
    Date,
    crypto: { randomUUID },
    AbortSignal,
    fetch: async (url: string, opts: any) => {
      calls.push({ url, ...opts });
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  const send = (msg: any, sender: any) =>
    new Promise<any>((resolve) => listener(msg, sender, resolve));
  return { send, local, session, calls, setFail: (v: boolean) => (fail = v) };
}
const app = {
  url: "https://horse-power.vercel.app/ordens/o/editar",
  frameId: 0,
  tab: { id: 1 },
};
const sky = {
  url: "https://cliente.skypecas.com.br/catalogo",
  frameId: 0,
  tab: { id: 2 },
};
const popup = { url: "chrome-extension://" + "a".repeat(32) + "/popup.html" };
const connect = {
  type: "HP_CONNECT",
  target: { token: "a".repeat(64), number: 123, orderId: "o" },
};
test("worker only accepts app pairing, keeps token away from status, and sends captures to authenticated destination", async () => {
  const w = worker();
  assert.equal((await w.send(connect, sky)).ok, false);
  assert.equal((await w.send(connect, app)).ok, true);
  const status = await w.send({ type: "HP_STATUS" }, sky);
  assert.equal(status.number, 123);
  assert.equal(status.token, undefined);
  await w.send(
    {
      type: "HP_CAPTURE",
      item: { capture_id: randomUUID(), source: "tempario", name: "Peça" },
    },
    sky,
  );
  assert.equal(JSON.parse(w.calls[0].body).source, "sky");
  assert.equal(w.calls[0].credentials, "omit");
  assert.equal(
    w.calls[0].url,
    "https://horse-power.vercel.app/api/extension/import",
  );
  assert.equal(w.local.data.pending.length, 0);
  assert.equal(w.local.data.token, undefined);
  assert.equal(
    (
      await w.send(
        { type: "HP_CAPTURE", item: {} },
        { ...sky, url: "https://evil.example" },
      )
    ).ok,
    false,
  );
});
test("worker preserves pending IDs for retry, refuses changing active target and never sends old items to another quote", async () => {
  const w = worker();
  await w.send(connect, app);
  w.setFail(true);
  const capture_id = randomUUID();
  assert.equal(
    (
      await w.send(
        { type: "HP_CAPTURE", item: { capture_id, name: "Peça" } },
        sky,
      )
    ).ok,
    false,
  );
  assert.equal(w.local.data.pending[0].item.capture_id, capture_id);
  assert.equal(
    (
      await w.send(
        { ...connect, target: { ...connect.target, orderId: "other" } },
        app,
      )
    ).ok,
    false,
  );
  await w.send({ type: "HP_DISCONNECT", orderId: "o" }, app);
  await w.send(
    { ...connect, target: { ...connect.target, orderId: "other" } },
    app,
  );
  w.setFail(false);
  assert.equal((await w.send({ type: "HP_RETRY" }, popup)).ok, false);
  await w.send({ type: "HP_DISCONNECT", orderId: "other" }, app);
  await w.send(connect, app);
  assert.equal((await w.send({ type: "HP_RETRY" }, popup)).ok, true);
  assert.equal(w.local.data.pending.length, 0);
  assert.equal(JSON.parse(w.calls[1].body).capture_id, capture_id);
});
test("Tempario parser preserves minutes and decimal hours", () => {
  const src = readFileSync("extension/horse-power/tempario.js", "utf8");
  const scope: any = {};
  runInNewContext(
    src.slice(src.search(/const norm\s*=/), src.indexOf("function vehicle()")) +
      ";this.parseHours=hrs;this.parseMoney=money;",
    scope,
  );
  for (const [input, hours] of [
    ["25min", 25 / 60],
    ["1h30m", 1.5],
    ["0,6h", 0.6],
    ["3h", 3],
  ])
    assert.equal(scope.parseHours(input), hours);
  assert.equal(scope.parseMoney("R$ 1.234,56"), 1234.56);
});
test("Sky parser rejects ambiguous fallback prices instead of guessing the larger value", () => {
  const src = readFileSync("extension/horse-power/sky.js", "utf8");
  const scope: any = {
    crypto: { randomUUID },
    location: { href: "https://cliente.skypecas.com.br/" },
  };
  const helpers = src.slice(
    src.search(/const norm\s*=/),
    src.indexOf("function getProductContainers"),
  );
  const parser = src.slice(
    src.indexOf("function extractProduct"),
    src.indexOf("async function addItem"),
  );
  runInNewContext(
    helpers + parser + ";this.parseProduct=extractProduct;",
    scope,
  );
  const raw = "Cód. Fáb: ABC123\nCorreia dentada\nMarca X\nEstoque: 5\n";
  assert.equal(
    scope.parseProduct({ innerText: raw + "R$ 10,00\nR$ 20,00" }).unitCost,
    0,
  );
  assert.equal(
    scope.parseProduct({ innerText: raw + "R$ 10,00 /UN\nR$ 20,00" }).unitCost,
    10,
  );
});
