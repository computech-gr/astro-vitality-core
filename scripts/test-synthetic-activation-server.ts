// Production hard-block acceptance; disposable SQL is available but must not be called.
import { execFileSync } from "node:child_process";
import { answerSyntheticQuestion } from "../src/lib/synthetic-evidence-qa.server";
import {
  PRODUCTION_SYNTHETIC_MISSION as mission,
  PRODUCTION_SYNTHETIC_CREW as crew,
  SYNTHETIC_DEMO_QUESTIONS,
} from "../src/domain/health-intelligence/production-synthetic-demo";
const socket = process.env["FV01_PG_SOCKET_DIR"];
if (!socket?.startsWith("/tmp/") || process.env["FV0143_INCLUDE_PENDING"] !== "1")
  throw Error("Disposable opt-in required");
const rpc = async (name: string, args: Record<string, unknown>) => {
  const order: Record<string, string[]> = {
    medical_v3_fixture_snapshot: [],
    medical_v3_ai_evidence: ["p_mission", "p_crew"],
    medical_demo_reserve: ["p_sha", "p_nonce"],
    medical_demo_dispatch: ["p_attempt", "p_sha", "p_nonce"],
    medical_demo_finish: ["p_attempt", "p_usage", "p_nonce"],
  };
  const keys = order[name];
  if (!keys) throw Error("RPC not allowed");
  const params = keys
    .map((k) => (args[k] === null ? "NULL" : `'${String(args[k]).replaceAll("'", "''")}'`))
    .join(",");
  try {
    const raw = execFileSync(
      "psql",
      [
        "-h",
        socket,
        "-p",
        "55432",
        "-U",
        "postgres",
        "-d",
        "medical_v3_it",
        "-X",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `set role authenticated;select set_config('request.jwt.claim.sub','22a72429-1674-4174-9b27-ba63db3c0279',false);select ${name}(${params})`,
      ],
      {
        encoding: "utf8",
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG"))),
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
      .trim()
      .split("\n")
      .at(-1);
    return {
      data: raw === "t" ? true : raw === "f" ? false : JSON.parse(raw ?? "null"),
      error: null,
    };
  } catch {
    return { data: null, error: "Disposable RPC rejected" };
  }
};
let sent = 0;
const result = await answerSyntheticQuestion(
  {
    missionId: mission,
    crewMemberId: crew,
    question: SYNTHETIC_DEMO_QUESTIONS[0],
    consent: true,
    provenance: "synthetic",
  },
  {
    enabled: true,
    productionSynthetic: true,
    apiKey: "simulated-not-a-key",
    rpc,
    now: () => new Date().toISOString(),
    providerFetch: (async (_url, init) => {
      sent++;
      const payload = JSON.parse(String(init?.body));
      if (
        payload.model !== "gpt-4.1-mini-2025-04-14" ||
        payload.max_output_tokens !== 1500 ||
        payload.store !== false
      )
        throw Error("Provider policy mismatch");
      const evidence = JSON.parse(payload.input).evidence as Array<{
        metric: string;
        value: string;
        unit: string;
        time: string;
        id: string;
      }>;
      return Response.json({
        model: payload.model,
        usage: { input_tokens: 1000, output_tokens: 500 },
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  statements: evidence.map((o) => ({
                    text: `${o.metric} recorded ${o.value} ${o.unit} at ${o.time}.`,
                    observationId: o.id,
                  })),
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
  },
);
const body = await result.json();
if (
  result.status !== 503 ||
  sent !== 0 ||
  !String(body.error).includes("serialized outbound")
)
  throw Error(`Server guard integration failed: ${result.status}`);
console.log(
  "PASS: enabled production path denies before any provider transmission; no toggle substitutes for missing hard guarantees. No live AI, production writes or browser acceptance.",
);
