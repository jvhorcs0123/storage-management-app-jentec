import { rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const cwd = process.cwd();

function stopProjectNodeProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const psCommand = `
$project = '${cwd.replace(/'/g, "''")}'
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.ProcessId -ne ${process.pid} -and
    $_.CommandLine -like ('*' + $project + '*')
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
`;

  spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
    { stdio: "inherit" }
  );
}

function clearNextArtifacts() {
  try {
    rmSync(".next/dev/lock", { force: true });
  } catch {}

  try {
    rmSync(".next", { recursive: true, force: true });
  } catch {}
}

stopProjectNodeProcesses();
clearNextArtifacts();

const forwardArgs = process.argv.slice(2);
const npmExecPath = process.env.npm_execpath;
const npmArgs = ["run", "dev", ...(forwardArgs.length ? ["--", ...forwardArgs] : [])];
const dev = npmExecPath
  ? spawn(process.execPath, [npmExecPath, ...npmArgs], { stdio: "inherit" })
  : spawn("npm", npmArgs, { stdio: "inherit", shell: true });

dev.on("exit", (code) => {
  process.exit(code ?? 0);
});
