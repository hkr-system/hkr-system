import { describe, expect, it } from "vitest";
import { companyLines } from "./invoice-parties";

describe("invoiced company block (Nov 9 2026)", () => {
  it("prints only the identifiers it has, in the order RSIN, EORI, KVK/CoC, VAT", () => {
    expect(companyLines({ name: "Clearance BV", address: "Street 144\nDordrecht, Zuid-Holland", country: "NL", rsin: "1", eori: "NL1", kvk: "2", vat: "NL1B01" }))
      .toEqual(["Clearance BV", "Street 144", "Dordrecht, Zuid-Holland", "Netherlands", "RSIN: 1", "EORI: NL1", "KVK/CoC: 2", "VAT: NL1B01"]);
    expect(companyLines({ name: "Galimix Demo SL", address: "Calle 1\n33401 Aviles", country: "ES", rsin: null, eori: null, kvk: "", vat: "ESB1" }))
      .toEqual(["Galimix Demo SL", "Calle 1", "33401 Aviles", "Spain", "VAT: ESB1"]);
  });
  it("does not repeat the country when the address already ends with it", () => {
    expect(companyLines({ name: "X", address: "Road 1\nRotterdam\nThe Netherlands", country: "NL", rsin: null, eori: null, kvk: null, vat: null }))
      .toEqual(["X", "Road 1", "Rotterdam", "The Netherlands"]);
  });
});
