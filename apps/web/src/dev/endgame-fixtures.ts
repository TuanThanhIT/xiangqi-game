import type { Piece } from "@xiangqi/rules";
import type { LocalGame } from "@/features/board/local-game";

export type EndgameScenario = "checkmate" | "stalemate";

// Dữ liệu từ packages/rules/tests/game-status.test.ts; không import node:test.
// Mỗi lần gọi tạo mới toàn bộ quân, position và state, chỉ chứa dữ liệu JSON.
export function createEndgameFixture(scenario: EndgameScenario): LocalGame {
  const pieces: Piece[] = [
    { id: "own", side: "black", type: "general", position: { row: 0, col: 4 } },
    { id: "enemy", side: "red", type: "general", position: { row: 9, col: 3 } },
    { id: "rook-1", side: "red", type: "rook", position: { row: 1, col: 0 } },
  ];
  if (scenario === "checkmate") {
    pieces.push({ id: "rook-0", side: "red", type: "rook", position: { row: 0, col: 0 } });
  } else {
    pieces.push(
      { id: "rook-3", side: "red", type: "rook", position: { row: 2, col: 3 } },
      { id: "rook-5", side: "red", type: "rook", position: { row: 2, col: 5 } },
    );
  }
  return { pieces, sideToMove: "black", selectedPieceId: null, lastMove: null, message: "" };
}
