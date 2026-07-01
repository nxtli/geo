#!/usr/bin/env node
/**
 * Standalone HubSpot connectivity test — verifies the token/scope and that a
 * lead (optionally with the GEO score) upserts as a contact. Uses NO AI credits
 * and does NOT run a scan; it exercises only the HubSpot CRM call the app makes.
 *
 * Usage:
 *   HUBSPOT_TOKEN=pat-... \
 *   HUBSPOT_SCORE_PROPERTY=geo_visibility_score \
 *   node scripts/hubspot-test.mjs [--create-prop]
 *
 *   --create-prop   also create the score property first (needs the extra
 *                   scope crm.schemas.contacts.write); skip if you made it in
 *                   the HubSpot UI instead.
 *
 * The test contact defaults to geo-scan-test@example.com — delete it in HubSpot
 * afterwards. Override with HUBSPOT_TEST_EMAIL=you@yourdomain.com.
 */
const token = process.env.HUBSPOT_TOKEN;
const scoreProp = process.env.HUBSPOT_SCORE_PROPERTY;
const createProp = process.argv.includes("--create-prop");
const testEmail = process.env.HUBSPOT_TEST_EMAIL || "geo-scan-test@example.com";
const BASE = "https://api.hubapi.com";

if (!token) {
  console.error("✗ HUBSPOT_TOKEN is not set. Run with HUBSPOT_TOKEN=... node scripts/hubspot-test.mjs");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function createScoreProperty() {
  const res = await fetch(`${BASE}/crm/v3/properties/contacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: scoreProp,
      label: "GEO Visibility Score",
      type: "number",
      fieldType: "number",
      groupName: "contactinformation",
    }),
  });
  if (res.status === 201) return console.log(`✓ created property "${scoreProp}"`);
  if (res.status === 409) return console.log(`• property "${scoreProp}" already exists — ok`);
  const body = await res.text().catch(() => "");
  if (res.status === 403) {
    console.log(`! cannot auto-create "${scoreProp}" (${res.status}): missing scope crm.schemas.contacts.write.`);
    console.log(`  Create it in HubSpot UI: Settings → Properties → Contact → Create property (type: Number).`);
    return;
  }
  console.log(`! create property responded ${res.status}: ${body.slice(0, 200)}`);
}

function upsert(properties) {
  return fetch(`${BASE}/crm/v3/objects/contacts/batch/upsert`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: testEmail, properties }] }),
  });
}

async function main() {
  console.log(`→ HubSpot test: upserting contact ${testEmail}${scoreProp ? ` with score → "${scoreProp}"` : " (no score property configured)"}`);

  if (createProp) {
    if (!scoreProp) console.log("! --create-prop given but HUBSPOT_SCORE_PROPERTY is unset — skipping property creation.");
    else await createScoreProperty();
  }

  const properties = {
    email: testEmail,
    firstname: "GEO",
    lastname: "Scan Test",
    phone: "0612345678",
    company: "NXTLI (test)",
    jobtitle: "Test lead",
    website: "https://example.com",
    lifecyclestage: "lead",
  };
  if (scoreProp) properties[scoreProp] = "73";

  let res = await upsert(properties);

  if (!res.ok && scoreProp) {
    const detail = await res.text().catch(() => "");
    console.log(`! upsert with score failed (${res.status}: ${detail.slice(0, 160)}) — retrying without the score property…`);
    const { [scoreProp]: _drop, ...standard } = properties;
    res = await upsert(standard);
    if (res.ok) {
      console.log("✓ contact synced WITHOUT the score. The score property name is wrong or missing.");
      console.log(`  Fix: create a Number property in HubSpot and set HUBSPOT_SCORE_PROPERTY to its internal name (now: "${scoreProp}").`);
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
  console.log(`  Find it in HubSpot: Contacts → search "${testEmail}"${scoreProp ? `; check the "${scoreProp}" property = 73` : ""}.`);
  console.log("  Tip: delete this test contact afterwards.");
}

main().catch((e) => {
  console.error("✗ unexpected error:", e?.message || e);
  process.exit(1);
});
