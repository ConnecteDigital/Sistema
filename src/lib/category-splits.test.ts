import { describe, expect, it } from "vitest";
import { categoryLabel, categoryParts, hasCategory } from "./finance";

describe("divisão em categorias", () => {
  it("sem divisão, usa a categoria única", () => {
    expect(categoryParts({ amount: 100, categoryId: "a", splits: null })).toEqual([{ categoryId: "a", amount: 100 }]);
  });
  it("com divisão, devolve as partes", () => {
    const m = { amount: 2500, categoryId: "site", splits: [{ categoryId: "site", amount: 1500 }, { categoryId: "mens", amount: 1000 }] };
    expect(categoryParts(m)).toEqual(m.splits);
    expect(categoryLabel(m, (id) => ({ site: "Criação de site", mens: "Mensalidade" })[id])).toBe("Criação de site + Mensalidade");
    expect(hasCategory(m, (id) => id === "mens")).toBe(true);
  });
  it("valor mudou depois (baixa parcial): ajusta na proporção e fecha o total", () => {
    const parts = categoryParts({ amount: 1000, categoryId: "a", splits: [{ categoryId: "a", amount: 2000 }, { categoryId: "b", amount: 1000 }] });
    expect(parts).toEqual([{ categoryId: "a", amount: 666.67 }, { categoryId: "b", amount: 333.33 }]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000, 2);
  });
});
