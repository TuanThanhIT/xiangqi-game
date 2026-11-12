/** Only active board effects are passed by the authoritative match engine. */
export interface BoardEffect { effectCode: "shield" | "seal"; targetPieceId: string }
export function hasEffect(effects: readonly BoardEffect[], pieceId: string, code: BoardEffect["effectCode"]): boolean {
  return effects.some(effect => effect.targetPieceId === pieceId && effect.effectCode === code);
}
