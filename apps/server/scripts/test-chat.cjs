const { rmSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const root=resolve(__dirname,".."),output=resolve(root,".test-output");
rmSync(output,{recursive:true,force:true});
for(const args of [[require.resolve("typescript/bin/tsc"),"-p","tsconfig.test.json"],["--test",resolve(output,"tests/match-chat.test.js"),resolve(output,"tests/match-socket.test.js")]]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:"inherit"});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
