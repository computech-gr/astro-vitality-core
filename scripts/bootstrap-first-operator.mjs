import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = required("SUPABASE_URL");
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const email = required("MISSION_BOOTSTRAP_EMAIL");
const password = required("MISSION_BOOTSTRAP_PASSWORD");
const missionCode = required("MISSION_BOOTSTRAP_CODE");
const missionName = required("MISSION_BOOTSTRAP_NAME");
const startsAt = process.env.MISSION_BOOTSTRAP_STARTS_AT?.trim() || null;

if (serviceRoleKey.startsWith("sb_publishable_")) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not a privileged server key.");
}

const bootstrapSecret = randomBytes(32).toString("base64url");
const bootstrapHash = createHash("sha256").update(bootstrapSecret, "utf8").digest("hex");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const user = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: armError } = await admin.rpc("configure_mission_bootstrap", {
  p_secret_hash: bootstrapHash,
});
if (armError) throw new Error(`Could not arm first-operator bootstrap: ${armError.message}`);

const { data: signInData, error: signInError } = await user.auth.signInWithPassword({ email, password });
if (signInError || !signInData.user) {
  throw new Error(`Bootstrap user sign-in failed: ${signInError?.message ?? "no authenticated user returned"}`);
}

const { data, error } = await user.rpc("bootstrap_first_mission", {
  p_code: missionCode,
  p_name: missionName,
  p_bootstrap_secret: bootstrapSecret,
  p_starts_at: startsAt,
});
if (error) throw new Error(`First-operator bootstrap failed: ${error.message}`);

await user.auth.signOut();
console.log(`Secure bootstrap PASS for ${email}.`);
console.log(`Created mission: ${data?.code ?? missionCode} (${data?.mission_id ?? "unknown id"}).`);
console.log("The one-time bootstrap secret was generated in memory and consumed; it was never written to disk or browser configuration.");
console.log("Remove SUPABASE_SERVICE_ROLE_KEY and MISSION_BOOTSTRAP_PASSWORD from the shell environment after this command.");
