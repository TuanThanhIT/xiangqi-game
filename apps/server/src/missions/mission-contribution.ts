import type { Piece, Side } from "@xiangqi/rules";
import type { OnlineGameResult } from "../rooms/room-game";
import type { ContributionSummary } from "./mission.service";

export function contributionSummaries(result:Exclude<OnlineGameResult,{status:"playing"}>,accounts:Record<Side,string>,
  captureHistory:Piece[],itemHistory:Array<{side:Side}>):ContributionSummary[] {
  const itemCounts:Record<Side,number>={red:0,black:0};for(const usage of itemHistory)itemCounts[usage.side]++;
  const captures:Record<Side,number>={red:0,black:0},cannons:Record<Side,number>={red:0,black:0};
  for(const piece of captureHistory){const side=piece.side==="red"?"black":"red";captures[side]++;if(piece.type==="cannon")cannons[side]++;}
  const winner=result.status==="finished"?result.winner:null;
  const full=(result.status==="finished"&&["checkmate","stalemate","total_timeout","turn_timeout"].includes(result.reason))||result.status==="draw";
  const resigned=result.status==="finished"&&result.reason==="resignation";
  return (["red","black"] as const).map(side=>{const eligible=full||(resigned&&winner===side),won=winner===side&&(full||resigned);
    return {accountId:accounts[side],completedMatches:eligible?1:0,wins:won?1:0,captures:eligible?captures[side]:0,
      cannonCaptures:eligible?cannons[side]:0,itemUsages:eligible?itemCounts[side]:0,wonWithoutItem:won&&itemCounts[side]===0?1:0};});
}
