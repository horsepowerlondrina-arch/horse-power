import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
function worker() {
  let listener: any;
  let fail = false;
  const calls: any[] = [];
  const tabs: any[] = [];
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
    tabs: {
      async update() {},
      async create(tab: any) {
        tabs.push(tab);
      },
    },
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
  return {
    send,
    local,
    session,
    calls,
    tabs,
    setFail: (v: boolean) => (fail = v),
  };
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
const tempario = {
  url: "https://sistema.tempar.io/time-search",
  frameId: 0,
  tab: { id: 3 },
};
const connect = {
  type: "HP_CONNECT",
  target: {
    token: "a".repeat(64),
    number: 123,
    orderId: "o",
    plate: "ABC1D23",
  },
};
test("Sky, Tempario and the popup receive the active plate without credentials", async () => {
  const w = worker();
  await w.send(connect, app);
  const vehicle = await w.send({ type: "HP_VEHICLE" }, tempario);
  assert.equal(vehicle.plate, "ABC1D23");
  assert.equal(vehicle.number, 123);
  assert.equal(vehicle.connected, true);
  assert.ok(vehicle.connectionId);
  assert.ok(vehicle.expires > Date.now());
  assert.equal(vehicle.token, undefined);
  assert.equal(vehicle.origin, undefined);
  const skyVehicle = await w.send({ type: "HP_VEHICLE" }, sky);
  assert.equal(skyVehicle.plate, "ABC1D23");
  assert.equal(skyVehicle.number, 123);
  assert.equal(skyVehicle.token, undefined);
  assert.equal(skyVehicle.origin, undefined);
  assert.equal((await w.send({ type: "HP_STATUS" }, sky)).plate, undefined);
  for (const sender of [
    app,
    { ...sky, frameId: 1 },
    { ...tempario, frameId: 1 },
    { ...tempario, url: "https://evil.example" },
  ])
    assert.equal((await w.send({ type: "HP_VEHICLE" }, sender)).ok, false);
  assert.equal((await w.send({ type: "HP_VEHICLE" }, popup)).plate, "ABC1D23");
  assert.equal(w.local.data.plate, undefined);
  w.session.data.target.expires = Date.now() - 1;
  const expired = await w.send({ type: "HP_VEHICLE" }, tempario);
  assert.equal(expired.connected, false);
  assert.equal(expired.plate, undefined);
  assert.equal((await w.send({ type: "HP_OPEN_TEMPARIO" }, popup)).ok, false);
});
test("reconnection updates the plate and popup opens Tempario without data in its URL", async () => {
  const w = worker();
  await w.send(connect, app);
  const old = await w.send({ type: "HP_VEHICLE" }, tempario);
  await w.send(
    { ...connect, target: { ...connect.target, plate: "DEF2345" } },
    app,
  );
  const current = await w.send({ type: "HP_VEHICLE" }, tempario);
  assert.equal(current.plate, "DEF2345");
  assert.notEqual(current.connectionId, old.connectionId);
  assert.equal((await w.send({ type: "HP_OPEN_TEMPARIO" }, popup)).ok, true);
  assert.equal(w.tabs[0].url, "https://sistema.tempar.io/");
  assert.equal(
    (await w.send({ type: "HP_OPEN_TEMPARIO" }, tempario)).ok,
    false,
  );
  await w.send({ type: "HP_DISCONNECT", orderId: "o" }, app);
  assert.equal(
    (await w.send({ type: "HP_VEHICLE" }, tempario)).plate,
    undefined,
  );
  await w.send(
    { ...connect, target: { ...connect.target, plate: "SEM PLACA" } },
    app,
  );
  assert.equal((await w.send({ type: "HP_VEHICLE" }, tempario)).plate, "");
});
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
  assert.equal(
    scope.parseProduct({
      innerText: raw + "R$ 107,44/JG.\nR$ 91,85 + 15,59(Impostos)",
    }).unitCost,
    107.44,
  );
  assert.equal(
    scope.parseProduct({
      innerText: raw + "R$ 89,90/PC\nR$ 80,00 + 9,90(Impostos)",
    }).unitCost,
    89.9,
  );
});

test("catalog destinations advertise capability and cannot receive pending order captures", async () => {
  const w = worker();
  await w.send(connect, app);
  w.setFail(true);
  await w.send(
    { type: "HP_CAPTURE", item: { capture_id: randomUUID(), name: "Peça" } },
    sky,
  );
  await w.send({ type: "HP_DISCONNECT", orderId: "o" }, app);
  assert.equal(
    (
      await w.send(
        {
          ...connect,
          target: {
            ...connect.target,
            destination: "catalog",
            label: "Catálogo",
            plate: "",
            number: 0,
          },
        },
        app,
      )
    ).ok,
    true,
  );
  const status = await w.send({ type: "HP_STATUS" }, popup);
  assert.equal(status.catalogCapture, true);
  assert.equal(status.label, "Catálogo");
  assert.equal(status.token, undefined);
  w.setFail(false);
  const count = w.calls.length;
  assert.equal((await w.send({ type: "HP_RETRY" }, popup)).ok, false);
  assert.equal(w.calls.length, count);
});
