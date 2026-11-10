import { describe, expect, it } from "vitest";
import { categoriesOf, categoryLabel, hasCategory } from "./finance";

describe("categorias adicionais", () => {
  const names: Record<string, string> = { mens: "Mensalidade", free: "Freelancer" };
  it("sem adicionais, só a principal", () => {
    expect(categoriesOf({ categoryId: "mens", extraCategoryIds: null })).toEqual(["mens"]);
  });
  it("principal + adicionais, sem repetir", () => {
    const m = { categoryId: "mens", extraCategoryIds: ["free", "mens"] };
    expect(categoriesOf(m)).toEqual(["mens", "free"]);
    expect(categoryLabel(m, (id) => names[id])).toBe("Mensalidade + Freelancer");
    expect(hasCategory(m, (id) => id === "free")).toBe(true);
  });
});
