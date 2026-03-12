import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const remoteUrl = process.env.OPENCODE_REMOTE_URL || "";
const remoteUsername = process.env.OPENCODE_REMOTE_USERNAME || "opencode";

function log(message) {
  process.stdout.write(`${message}\n`);
}

log(`Starting Vite dev server with browser auto-open...`);
if (remoteUrl) {
  log(`Use this remote OpenCode server in the setup form: ${remoteUrl}`);
} else {
  log("No remote OpenCode server URL configured.");
  log("Set OPENCODE_REMOTE_URL to the real backend endpoint, for example https://ai.example.com or https://api.opencode.zone");
  log("Your app domain https://opencode.zone is only the frontend origin, not the OpenCode server URL.");
}
log(`Suggested username: ${remoteUsername}`);

const child = spawn(npmCommand, ["run", "dev", "--", "--open"], {
  stdio: "inherit",
  env: process.env,
  shell: isWindows,
});

child.on("error", (error) => {
  log(`Failed to start Vite dev server: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
