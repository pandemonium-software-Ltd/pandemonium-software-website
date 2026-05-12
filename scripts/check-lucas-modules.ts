import { getProspectByToken } from "../src/lib/notion-prospects";
async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  console.log({
    moduleSelections: lucas?.moduleSelections,
    phase2Modules: lucas?.phase2Data?.modulesInterest,
  });
}
main().catch(console.error);
