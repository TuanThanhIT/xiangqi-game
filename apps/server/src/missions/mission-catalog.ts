export const MISSION_DEFINITIONS = [
  ["daily_complete_1","daily","completed_matches","Hoàn thành 1 trận","Hoàn thành một trận hợp lệ.",1,5,1],
  ["daily_complete_3","daily","completed_matches","Hoàn thành 3 trận","Hoàn thành ba trận hợp lệ.",3,10,2],
  ["daily_win_1","daily","wins","Thắng 1 trận","Thắng một trận hợp lệ.",1,10,3],
  ["daily_capture_5","daily","captures","Ăn 5 quân","Ăn năm quân trong các trận hợp lệ.",5,5,4],
  ["daily_capture_cannon","daily","cannon_captures","Ăn Pháo","Ăn ít nhất một quân Pháo.",1,5,5],
  ["daily_use_item","daily","item_usages","Dùng vật phẩm","Dùng thành công một vật phẩm.",1,5,6],
  ["daily_win_without_item","daily","win_without_item","Thắng không dùng vật phẩm","Thắng mà bản thân không dùng vật phẩm thành công.",1,10,7],
  ["weekly_complete_10","weekly","completed_matches","Hoàn thành 10 trận","Hoàn thành mười trận hợp lệ trong tuần.",10,25,1],
  ["weekly_complete_20","weekly","completed_matches","Hoàn thành 20 trận","Hoàn thành hai mươi trận hợp lệ trong tuần.",20,40,2],
  ["weekly_win_5","weekly","wins","Thắng 5 trận","Thắng năm trận trong tuần.",5,30,3],
  ["weekly_win_10","weekly","wins","Thắng 10 trận","Thắng mười trận trong tuần.",10,50,4],
  ["weekly_capture_40","weekly","captures","Ăn 40 quân","Ăn bốn mươi quân trong tuần.",40,25,5],
  ["weekly_capture_100","weekly","captures","Ăn 100 quân","Ăn một trăm quân trong tuần.",100,50,6],
  ["weekly_use_item_10","weekly","item_usages","Dùng 10 vật phẩm","Dùng thành công mười vật phẩm trong tuần.",10,30,7],
  ["weekly_win_no_item_3","weekly","win_without_item","Thắng 3 trận không dùng vật phẩm","Thắng ba trận mà bản thân không dùng vật phẩm.",3,30,8],
  ["achievement_first_win","achievement","wins","Chiến thắng đầu tiên","Thắng trận đầu tiên.",1,20,1],
  ["achievement_complete_10","achievement","completed_matches","Hoàn thành 10 trận","Hoàn thành mười trận.",10,30,2],
  ["achievement_complete_50","achievement","completed_matches","Hoàn thành 50 trận","Hoàn thành năm mươi trận.",50,80,3],
  ["achievement_complete_100","achievement","completed_matches","Hoàn thành 100 trận","Hoàn thành một trăm trận.",100,150,4],
  ["achievement_win_10","achievement","wins","Thắng 10 trận","Thắng mười trận.",10,50,5],
  ["achievement_win_50","achievement","wins","Thắng 50 trận","Thắng năm mươi trận.",50,120,6],
  ["achievement_win_100","achievement","wins","Thắng 100 trận","Thắng một trăm trận.",100,250,7],
  ["achievement_capture_100","achievement","captures","Ăn 100 quân","Ăn một trăm quân.",100,50,8],
  ["achievement_capture_500","achievement","captures","Ăn 500 quân","Ăn năm trăm quân.",500,200,9],
  ["achievement_use_item_50","achievement","item_usages","Dùng 50 vật phẩm","Dùng thành công năm mươi vật phẩm.",50,100,10],
] as const;

export type MissionCategory="daily"|"weekly"|"achievement";
export type MissionMetric=typeof MISSION_DEFINITIONS[number][2];
export const MISSION_CONTRIBUTION_VERSION=1;
export const MISSION_TIMEZONE="Asia/Ho_Chi_Minh";
