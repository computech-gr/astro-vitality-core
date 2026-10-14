import { createFileRoute } from "@tanstack/react-router";
import { normalizeAccession, researchEndpoint } from "@/domain/nasa-research/import";
const MAX_BYTES = 1024 * 1024;
export const Route = createFileRoute("/api/nasa-research")({
  server: {handlers: {GET: async ({request}) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    let accession: string;
    try { accession = normalizeAccession(url.searchParams.get("accession") ?? ""); }
    catch { return Response.json({error:"Invalid accession"},{status:400}); }
    if (mode !== "dataset" && mode !== "samples") return Response.json({error:"Invalid mode"},{status:400});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(researchEndpoint(accession, mode), {signal:controller.signal, headers:{Accept:"application/json"}, redirect:"error"});
      if (!response.ok) return Response.json({error:"NASA API unavailable", upstreamStatus:response.status},{status:502});
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_BYTES) return Response.json({error:"NASA response exceeds preview limit"},{status:413});
      const reader = response.body?.getReader();
      if (!reader) return Response.json({error:"Empty NASA response"},{status:502});
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) {await reader.cancel();return Response.json({error:"NASA response exceeds preview limit"},{status:413});} chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const data:unknown = JSON.parse(new TextDecoder().decode(bytes));
      return Response.json({accession,mode,retrievedAt:new Date().toISOString(),data},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
    } catch { return Response.json({error:"NASA API request failed or timed out"},{status:502}); }
    finally {clearTimeout(timeout);}
  }}}},
});
