import { describe, expect, it } from "vitest";
import { bodyVariableCount, buildComponents, fillBody, resolveVariables, windowOpen } from "./templates";

const tpl = [
  { type: "HEADER", format: "DOCUMENT" },
  { type: "BODY", text: "Hi {{1}}, this week's list for {{2}} is attached." },
  { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Stop promotions" }] },
];

describe("templates", () => {
  it("counts body variables", () => expect(bodyVariableCount(tpl)).toBe(2));
  it("fills the body for preview", () => expect(fillBody(tpl, ["Eva", "Tulip"])).toBe("Hi Eva, this week's list for Tulip is attached."));
  it("resolves variables from the lead", () =>
    expect(resolveVariables([{ source: "first_name" }, { source: "company" }, { source: "text", value: "x" }],
      { company: "Tulip Phones", contact_name: "Eva Jansen" })).toEqual(["Eva", "Tulip Phones", "x"]));
  it("builds header document + body parameters", () =>
    expect(buildComponents(tpl, ["Eva", "Tulip"], { id: "M1", filename: "list.pdf" })).toEqual([
      { type: "header", parameters: [{ type: "document", document: { id: "M1", filename: "list.pdf" } }] },
      { type: "body", parameters: [{ type: "text", text: "Eva" }, { type: "text", text: "Tulip" }] },
    ]));
  it("24-hour window", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(windowOpen("2026-10-26T12:30:00Z", now)).toBe(true);
    expect(windowOpen("2026-10-26T11:59:00Z", now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
  });
});
