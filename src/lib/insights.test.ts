import { describe, expect, it } from "vitest";
import { placeOf } from "./insights";

const p = (name: string) => placeOf({ name, address: {} });

describe("cidade pelo nome do cliente", () => {
  it.each([
    ["Chaveiro Messi(Marília - São Paulo)", "Marília", "SP"],
    ["GD ar-condicionado(Campinas/São Paulo)", "Campinas", "SP"],
    ["Desentupidora AJW(Jabaquara - São Paulo)", "São Paulo", "SP"],
    ["Chaveiro Duque(São Paulo)", "São Paulo", "SP"],
    ["Desentupidora Solução BH", "Belo Horizonte", "MG"],
    ["Desentupidora POA 24H (Porto Alegre)", "Porto Alegre", "RS"],
    ["MB Imobiliária(Jaguaquara - Bahia)", "Jaguaquara", "BA"],
    ["Juan(Desentupidora/ Foz do Iguaçu)", "Foz do Iguaçu", "PR"],
    ["Desentupidora Caxiense", "Caxias do Sul", "RS"],
    ["Hydro Floripa (Desentupidora)", "Florianópolis", "SC"],
    ["Guinchos em Brasília", "Brasília", "DF"],
  ])("%s", (name, city, state) => expect(p(name)).toEqual({ city, state }));

  it("só o estado", () => {
    expect(p("Raio Sul Desentupidora (SP)")).toEqual({ city: null, state: "SP" });
    expect(p("Nem Refrigerações (RJ)")).toEqual({ city: null, state: "RJ" });
    expect(p("Joab Montador (Minas Gerais)")).toEqual({ city: null, state: "MG" });
  });

  it("não inventa cidade a partir de nome de pessoa", () => {
    expect(p("Desentupidora Hidro Baixada(Leandro)")).toEqual({ city: null, state: null });
    expect(p("HS Reformas")).toEqual({ city: null, state: null });
  });

  it("endereço cadastrado vence o nome", () => {
    expect(placeOf({ name: "X (SP)", address: { city: "Salvador", state: "ba" } })).toEqual({ city: "Salvador", state: "BA" });
  });
});
