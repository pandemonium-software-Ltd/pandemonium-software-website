// Diagnostic — Lucas's offer state + most-recent change requests.
import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken(
    "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9",
  );
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as {
    content?: {
      offers?: { current?: unknown; history?: unknown[] };
    };
  };
  console.log("Status:", lucas.status);
  console.log("\ncontent.offers.current:");
  console.log(JSON.stringify(ob.content?.offers?.current ?? null, null, 2));
  console.log("\ncontent.offers.history count:", ob.content?.offers?.history?.length ?? 0);
  console.log("\nMost recent change-requests:");
  for (const r of lucas.changeRequests.slice(0, 3)) {
    console.log(
      `  ${r.id.slice(0, 8)} ${r.status} "${r.message.slice(0, 80)}…" patches=${r.coworkPatches?.length ?? 0} appliedAt=${r.coworkPatchAppliedAt ?? "(none)"}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
