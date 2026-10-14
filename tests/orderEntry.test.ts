import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppContext } from "../src/lib/context";
import { OrderEditor } from "../src/pages/OrderEditor";

const customer = { id: "c", name: "Cliente Nome Completo", active: 1 };
const vehicle = {
  id: "v",
  customer_id: "c",
  plate: "ABC1D23",
  brand: "Marca",
  model: "Modelo",
  km: 1234,
  active: 1,
};
function render(path: string, order?: Record<string, unknown>) {
  const context: any = {
    session: {
      role: "owner",
      user: { name: "Admin" },
      tenant: { id: "t", name: "Oficina" },
    },
    data: {
      customers: [customer],
      vehicles: [vehicle],
      orders: order ? [order] : [],
      catalog: [],
      professionals: [],
    },
    refresh: async () => {},
    notify: () => {},
  };
  return renderToStaticMarkup(
    h(
      AppContext.Provider,
      { value: context },
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          Routes,
          null,
          h(Route, { path: "/ordens/:id", element: h(OrderEditor) }),
        ),
      ),
    ),
  );
}
test("new quote and OS begin with plate choice before customer fields or saving", () => {
  for (const path of ["/ordens/nova?status=quote", "/ordens/nova"]) {
    const html = render(path);
    assert.match(html, /Qual é a placa do veículo/);
    assert.match(html, /Continuar sem informar a placa/);
    assert.doesNotMatch(html, /Dados do cliente/);
    assert.match(
      html,
      /<button[^>]*disabled=""[^>]*>[^<]*<svg[\s\S]*?Salvar atendimento/,
    );
  }
});
test("editing a linked quote shows its registered customer without a duplicate guest name", () => {
  const html = render("/ordens/o", {
    id: "o",
    status: "quote",
    kind: "quote",
    number: 1,
    customer_id: "c",
    vehicle_id: "v",
    plate: vehicle.plate,
    items: [],
  });
  assert.match(html, /Cliente Nome Completo/);
  assert.doesNotMatch(html, /Nome do cliente \(opcional\)/);
  assert.doesNotMatch(html, /Nome para o orçamento/);
  assert.match(html, /value="ABC1D23"/);
});
test("a guest quote preserves optional name and vehicle with a single plate input", () => {
  const html = render("/ordens/o", {
    id: "o",
    status: "quote",
    kind: "quote",
    number: 1,
    guest_name: "Nome completo avulso",
    guest_plate: "DEF4G56",
    guest_vehicle: "Veículo avulso",
    items: [],
  });
  assert.match(html, /value="Nome completo avulso"/);
  assert.match(html, /value="Veículo avulso"/);
  assert.equal((html.match(/value="DEF4G56"/g) || []).length, 1);
  assert.doesNotMatch(html, /Veículo cadastrado \(opcional\)/);
});
