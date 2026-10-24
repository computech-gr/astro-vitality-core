// Executed ONLY by the disposable SQL verifier before rollback. Provider is simulated.
import { execFileSync } from "node:child_process";
import { answerSyntheticQuestion } from "../src/lib/synthetic-evidence-qa.server";
import {
  PRODUCTION_SYNTHETIC_MISSION,
  PRODUCTION_SYNTHETIC_CREW,
  SYNTHETIC_DEMO_QUESTIONS,
} from "../src/domain/health-intelligence/production-synthetic-demo";
const socket = process.env["FV01_PG_SOCKET_DIR"];
if (!socket?.startsWith("/tmp/") || process.env["FV0143_INCLUDE_PENDING"] !== "1")
  throw new Error("Disposable socket opt-in required");
const rpc = async (name: string, args: Record<string, unknown>) => {
  if (
    ![
      "medical_v3_fixture_snapshot",
      "medical_v3_ai_evidence",
      "medical_v3_reserve_ai",
      "medical_v3_release_ai",
    ].includes(name)
  )
    throw new Error("Unapproved RPC");
  const quote = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
  const params =
    name === "medical_v3_fixture_snapshot"
      ? ""
      : name === "medical_v3_release_ai"
        ? quote(args["p_reservation"])
        : [args["p_mission"], args["p_crew"]].map(quote).join(",");
  try {
    const result = execFileSync(
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
        `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);select ${name}(${params})`,
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
      data: name === "medical_v3_release_ai" ? null : JSON.parse(result ?? "null"),
      error: null,
    };
  } catch {
    return { data: null, error: "Disposable caller RPC failed" };
  }
};
let providerCalls = 0;
const response = await answerSyntheticQuestion(
  {
    missionId: PRODUCTION_SYNTHETIC_MISSION,
    crewMemberId: PRODUCTION_SYNTHETIC_CREW,
    question: SYNTHETIC_DEMO_QUESTIONS[0],
    provenance: "synthetic",
    consent: true,
  },
  {
    enabled: true,
    productionSynthetic: true,
    apiKey: "simulated-not-a-key",
    rpc,
    now: () => new Date().toISOString(),
    providerFetch: (async (_url, init) => {
      providerCalls++;
      const payload = JSON.parse(String(init?.body));
      const evidence = JSON.parse(payload.input).evidence as Array<{
        metric: string;
        value: string;
        unit: string;
        time: string;
        id: string;
      }>;
      return Response.json({
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
const body = await response.json();
if (
  response.status !== 200 ||
  providerCalls !== 1 ||
  body.citedIds.join(",") !== "synthetic-v3-hr-001,synthetic-v3-hr-002"
)
  throw new Error("Disposable production synthetic server integration failed");
console.log(
  "PASS: genuine caller-scoped disposable SQL -> authoritative evidence -> atomic quota -> simulated provider -> exact citations -> authority recheck -> release. NOT live AI or browser acceptance.",
);
