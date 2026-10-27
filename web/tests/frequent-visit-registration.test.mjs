import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../src/lib/frequentVisitRegistration.js", import.meta.url), "utf8");
const { getFrequentVisitRegistrationTarget, getVisitingBoatRegistrationData } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("docking and banyera reminders open registration with the correct source", () => {
  for (const service of ["docking", "banyera"]) {
    assert.deepEqual(getFrequentVisitRegistrationTarget({ related_type: `frequent_visiting_${service}`, related_id: 23 }), {
      pathname: "/add-boat", search: "", state: { registrationVisit: { source: service, id: 23 } },
    });
  }
});

test("unrelated notifications and invalid source identifiers keep their existing navigation", () => {
  assert.equal(getFrequentVisitRegistrationTarget({ related_type: "remittance", related_id: 23 }), null);
  for (const id of [null, -1, "abc", 1.5]) {
    assert.equal(getFrequentVisitRegistrationTarget({ related_type: "frequent_visiting_docking", related_id: id }), null);
  }
});

test("registration uses the source boat name and type and requires an explicit owner selection", () => {
  assert.deepEqual(getVisitingBoatRegistrationData({
    boat_category: "visiting", visiting_boat_name: " Sea Star ", visiting_boat_type_id: 4,
    visiting_owner_firstname: "Visitor", visiting_owner_lastname: "Owner",
  }), { boat_name: "SEA STAR", boat_type_id: 4 });
});

test("voided, already linked, and empty visits cannot prefill registration", () => {
  const visit = { boat_category: "visiting", visiting_boat_name: "SEA STAR" };
  assert.equal(getVisitingBoatRegistrationData({ ...visit, boat_id: 2 }), null);
  assert.equal(getVisitingBoatRegistrationData({ ...visit, voided_at: "2026-10-20" }), null);
  assert.equal(getVisitingBoatRegistrationData({ ...visit, boat_category: "registered" }), null);
  assert.equal(getVisitingBoatRegistrationData({ ...visit, visiting_boat_name: " " }), null);
});
