import { notFound } from "next/navigation";
import XiangqiBoard from "@/components/XiangqiBoard";
import { createEndgameFixture } from "@/dev/endgame-fixtures";

export default async function EndgamePage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { scenario } = await params;
  if (scenario !== "checkmate" && scenario !== "stalemate") notFound();

  return (
    <main>
      <h1>Kiểm tra {scenario === "checkmate" ? "chiếu bí" : "hết nước không bị chiếu"}</h1>
      <XiangqiBoard key={scenario} initialGame={createEndgameFixture(scenario)} />
    </main>
  );
}
