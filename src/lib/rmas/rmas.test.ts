import { describe, expect, it } from "vitest";
import { nextCutoff, timeUntil } from "./cutoff";
import { parseRmaForm } from "./form-import";
import { rmaFolder } from "./constants";

describe("nextCutoff (Friday 12:00 Amsterdam)", () => {
  it("Wednesday → this Friday, 10:00 UTC in winter time", () => {
    expect(nextCutoff(new Date("2026-11-04T09:00:00Z"))).toEqual({ date: "2026-11-06", at: "2026-11-06T11:00:00.000Z" });
  });
  it("summer time: 12:00 Amsterdam = 10:00 UTC", () => {
    expect(nextCutoff(new Date("2026-07-01T09:00:00Z")).at).toBe("2026-07-03T10:00:00.000Z");
  });
  it("Friday before noon → today; after noon → next Friday", () => {
    expect(nextCutoff(new Date("2026-11-06T10:59:00Z")).date).toBe("2026-11-06");
    expect(nextCutoff(new Date("2026-11-06T11:01:00Z")).date).toBe("2026-11-13");
  });
  it("Saturday → next Friday", () => {
    expect(nextCutoff(new Date("2026-11-07T08:00:00Z")).date).toBe("2026-11-13");
  });
  it("timeUntil reads in plain words", () => {
    const now = new Date("2026-11-04T09:00:00Z");
    expect(timeUntil("2026-11-06T11:00:00.000Z", now)).toBe("2 days 2 h");
    expect(timeUntil("2026-11-04T10:30:00.000Z", now)).toBe("1 h 30 min");
    expect(timeUntil("2026-11-04T08:00:00.000Z", now)).toBe("passed");
  });
});

describe("parseRmaForm (HKR_RMA_Request_Form_TEMPLATE)", () => {
  const rows = [
    [null, null, null, "RMA REQUEST FORM"],
    [], [], [], ["CLIENT DETAILS"],
    ["Company name", null, "Amstel Refurb", null, null, null, "Client code (HKR)", "AMS-NL-901"],
    ["Contact person", null, "Daan", null, null, null, "RMA number (HKR)", ""],
    ["Email / WhatsApp", null, "daan@example.com"],
    ["Order / invoice number(s)", null, "ORD-02 / 09212026"],
    ["Units in this form", null, 3, null, null, null, "Where are the units now?", "At the EU intermediary"],
    [], ["UNITS"],
    ["#", "IMEI (15 digits)", "Model", "Storage", "Color", "Fault category", "Fault description (what happens, when)", "Source",
     "Date detected", "Battery swollen?", "Physical / liquid damage?", "Evidence file names (photo / video)", "IMEI check", "HKR resolution"],
    [1, 350000000000139, "iPhone 15", "128GB", "Black", "Camera", "Blurry", "Reception testing", new Date("2026-10-20T00:00:00Z"), "No", "No", "000139_video.mp4"],
    [2, "350000000000147", "iPhone 15", 256, "Blue", "battery / charging", "Swollen", "End customer", 46315, "Yes", "No", ""],
    [3, "350000000000147", null, null, null, "Camera", null, null, null, null, null, null],
    [4, "12345", null, null, null, "Camera"],
    [5, "490154203237519", null, null, null, "Water damage", null, null, "20/10/2026"],
    ["", "", ""],
  ];
  const p = parseRmaForm(rows);
  it("reads the client block", () => {
    expect(p.header).toEqual({ company: "Amstel Refurb", contact: "Daan", contactInfo: "daan@example.com",
      orderRefs: "ORD-02 / 09212026", location: "at_intermediary" });
  });
  it("reads units, normalises values and skips duplicates and short IMEIs", () => {
    expect(p.units.map((u) => u.imei)).toEqual(["350000000000139", "350000000000147", "490154203237519"]);
    expect(p.units[0]).toMatchObject({ storage_gb: 128, fault_category: "Camera", source: "testing", detected_on: "2026-10-20",
      battery_swollen: false, evidence_names: "000139_video.mp4" });
    expect(p.units[1]).toMatchObject({ storage_gb: 256, fault_category: "Battery / charging", source: "end_customer",
      detected_on: "2026-10-20", battery_swollen: true });
    expect(p.units[2]).toMatchObject({ fault_category: "Other", detected_on: "2026-10-20" });
  });
  it("explains every skipped or corrected line", () => {
    expect(p.problems.join("\n")).toMatch(/DUPLICATE/);
    expect(p.problems.join("\n")).toMatch(/"12345" does not have 15 digits/);
    expect(p.problems.join("\n")).toMatch(/fails the check digit/);
    expect(p.problems.join("\n")).toMatch(/"Water damage" is not in the list/);
  });
  it("rejects a file that is not the form", () => {
    expect(parseRmaForm([["hello"]]).problems[0]).toMatch(/does not look like/);
  });
});

describe("rmaFolder", () => {
  it("uses the RMA-NN part of the number", () => {
    expect(rmaFolder("AMS-NL-901-RMA-02")).toBe("RMA-02");
  });
});
