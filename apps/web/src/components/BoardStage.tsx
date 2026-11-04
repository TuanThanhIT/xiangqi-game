import type { ReactNode } from "react";
import type { Piece } from "@xiangqi/rules";
import CapturedTrays from "./CapturedTrays";

export default function BoardStage({ pieces, showCaptured = true, children }: { pieces: readonly Piece[] | null; showCaptured?: boolean; children: ReactNode }) {
  return <div className="xq-board-stage" data-captures={showCaptured || undefined}>{children}{showCaptured && <CapturedTrays pieces={pieces} />}</div>;
}
