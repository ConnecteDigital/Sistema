import { describe, expect, it } from "vitest";
import { findDuplicateContact, normName } from "./contacts";
import type { Contact } from "./types";

const c = (p: Partial<Contact>): Contact => ({
  id: "x", name: "", isCustomer: true, isSupplier: false, personType: "natural", taxId: null, email: null, phone: null, address: {}, notes: null, deleted: false, ...p,
});

describe("findDuplicateContact", () => {
  const list = [c({ id: "1", name: "Assistência Sensitec", taxId: "71728055423" }), c({ id: "2", name: "Joaozinho", deleted: true })];

  it("acha pelo CPF, mesmo formatado", () => {
    expect(findDuplicateContact(list, { name: "Outro nome", taxId: "717.280.554-23" })?.contact.id).toBe("1");
  });
  it("acha pelo nome sem acento e sem diferenciar maiúsculas", () => {
    expect(findDuplicateContact(list, { name: "  assistencia   SENSITEC ", taxId: null })).toMatchObject({ by: "name", contact: { id: "1" } });
  });
  it("ignora arquivados e o próprio cadastro", () => {
    expect(findDuplicateContact(list, { name: "joaozinho", taxId: null })).toBeNull();
    expect(findDuplicateContact(list, { name: "Assistência Sensitec", taxId: null }, "1")).toBeNull();
  });
  it("normaliza nomes", () => {
    expect(normName("Solução  BH")).toBe("solucao bh");
  });
});
