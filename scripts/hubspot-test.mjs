#!/usr/bin/env node
/**
 * Standalone HubSpot connectivity test — verifies the token/scope and that a
 * lead (with the GEO custom properties) upserts as a contact. Uses NO AI credits
 * and does NOT run a scan; it exercises only the HubSpot CRM call the app makes.
 *
 * Usage:
 *   HUBSPOT_TOKEN=pat-... node scripts/hubspot-test.mjs [--create-props]
 *
 *   --create-props  create the 3 GEO custom properties first (needs the extra
 *                   scope crm.schemas.contacts.write); skip if you made them in
 *                   the HubSpot UI.
 *
 * The test contact defaults to geo-scan-test@example.com — delete it afterwards.
 * Override with HUBSPOT_TEST_EMAIL=you@yourdomain.com.
 */
const token = process.env.HUBSPOT_TOKEN;
const createProps = process.argv.includes("--create-props");
const testEmail = process.env.HUBSPOT_TEST_EMAIL || "geo-scan-test@example.com";
const BASE = "https://api.hubapi.com";

// The GEO custom properties this test (and the app) writes.
const GEO_PROPS = [
  { name: "geoscore", label: "GEO Score", type: "number", fieldType: "number", sample: "73" },
  { name: "geoscore_rapport", label: "GEO Score rapport", type: "string", fieldType: "text", sample: "https://geo.nxtli.com/api/geo/report/test-123" },
  { name: "geoscanpagina", label: "GEO scanpagina", type: "string", fieldType: "text", sample: "https://voorbeeld.nl" },
];

if (!token) {
  console.error("✗ HUBSPOT_TOKEN is not set. Run: HUBSPOT_TOKEN=... node scripts/hubspot-test.mjs");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function createProperty(p) {
  const res = await fetch(`${BASE}/crm/v3/properties/contacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      groupName: "contactinformation",
    }),
  });
  if (res.status === 201) return console.log(`✓ created property "${p.name}"`);
  if (res.status === 409) return console.log(`• property "${p.name}" already exists — ok`);
  const body = await res.text().catch(() => "");
  if (res.status === 403) {
    console.log(`! cannot auto-create "${p.name}" (403): missing scope crm.schemas.contacts.write.`);
    console.log(`  Create it in HubSpot UI: Settings → Properties → Contact → Create property.`);
    return;
  }
  console.log(`! create "${p.name}" responded ${res.status}: ${body.slice(0, 160)}`);
}

function upsert(properties) {
  return fetch(`${BASE}/crm/v3/objects/contacts/batch/upsert`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: testEmail, properties }] }),
  });
}

async function main() {
  console.log(`→ HubSpot test: upserting ${testEmail} with GEO properties ${GEO_PROPS.map((p) => p.name).join(", ")}`);

  if (createProps) {
    for (const p of GEO_PROPS) await createProperty(p);
  }

  const standard = {
    email: testEmail,
    firstname: "GEO",
    lastname: "Scan Test",
    phone: "0612345678",
    company: "NXTLI (test)",
    jobtitle: "Test lead",
    website: "https://voorbeeld.nl",
    lifecyclestage: "lead",
  };
  const geo = Object.fromEntries(GEO_PROPS.map((p) => [p.name, p.sample]));

  let res = await upsert({ ...standard, ...geo });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.log(`! upsert with GEO properties failed (${res.status}: ${detail.slice(0, 200)}) — retrying with standard fields only…`);
    res = await upsert(standard);
    if (res.ok) {
      console.log("✓ contact synced WITHOUT the GEO properties — so one of these names/types is wrong or missing in HubSpot:");
      console.log(`  ${GEO_PROPS.map((p) => `${p.name} (${p.type})`).join(", ")}`);
      console.log("  Create/rename them in HubSpot → Settings → Properties → Contact and re-run.");
    }
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`✗ upsert failed: ${res.status} ${detail.slice(0, 300)}`);
    if (res.status === 401) console.error("  → token invalid/expired.");
    if (res.status === 403) console.error("  → token missing scope crm.objects.contacts.write.");
    process.exit(1);
  }

  const json = await res.json().catch(() => ({}));
  const id = json?.results?.[0]?.id;
  console.log(`✓ success — contact upserted${id ? ` (id ${id})` : ""}.`);
  console.log(`  In HubSpot: Contacts → search "${testEmail}" → check geoscore=73, geoscore_rapport, geoscanpagina.`);
  console.log("  Tip: delete this test contact afterwards.");
}

main().catch((e) => {
  console.error("✗ unexpected error:", e?.message || e);
  process.exit(1);
});
