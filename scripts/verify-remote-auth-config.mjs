const canonicalOrigin = "https://mitochondria.edocinfo.com";
const identityRedirect = `${canonicalOrigin}/mission/identity`;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const token = required("SUPABASE_ACCESS_TOKEN");
let projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
if (!projectRef) {
  const url = process.env.SUPABASE_URL?.trim();
  const match = url?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  projectRef = match?.[1];
}
if (!projectRef) throw new Error("Set SUPABASE_PROJECT_REF or a standard SUPABASE_URL so the project ref can be resolved.");

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
if (!response.ok) throw new Error(`Supabase Management API auth config request failed (${response.status}).`);
const config = await response.json();

const siteUrl = typeof config.site_url === "string" ? config.site_url.replace(/\/$/, "") : undefined;
const rawAllowList = config.uri_allow_list ?? config.additional_redirect_urls ?? config.redirect_urls;
const allowList = Array.isArray(rawAllowList)
  ? rawAllowList.map(String)
  : typeof rawAllowList === "string"
    ? rawAllowList.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
const emailEnabled =
  typeof config.external_email_enabled === "boolean"
    ? config.external_email_enabled
    : typeof config.email_enabled === "boolean"
      ? config.email_enabled
      : undefined;

const failures = [];
if (siteUrl !== canonicalOrigin) failures.push(`Site URL must be exactly ${canonicalOrigin}; received ${siteUrl ?? "unavailable"}`);
if (!allowList.some((value) => value.replace(/\/$/, "") === identityRedirect)) {
  failures.push(`Redirect allowlist must include ${identityRedirect}`);
}
if (emailEnabled === false) failures.push("Supabase Email authentication is disabled.");

if (failures.length) {
  console.error("Remote Auth readiness FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Remote Auth readiness PASS for ${projectRef}.`);
console.log(`Site URL: ${siteUrl}`);
console.log(`Mission identity redirect present: ${identityRedirect}`);
if (emailEnabled === undefined) console.log("Email-provider flag was not exposed by this Management API response; browser readiness probe remains the provider check.");
