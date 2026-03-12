import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const openBrowser = args.has("--open");

const serverHost = process.env.OPENCODE_SERVER_HOST || "127.0.0.1";
const serverPort = process.env.OPENCODE_SERVER_PORT || "4096";
const serverCors = process.env.OPENCODE_SERVER_CORS || "http://localhost:5173";
const serverUsername = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const serverPassword = process.env.OPENCODE_SERVER_PASSWORD || "localdev";

const opencodeCommand = isWindows ? "opencode.cmd" : "opencode";
const npmCommand = isWindows ? "npm.cmd" : "npm";

let shuttingDown = false;
let serverProcess = null;
let clientProcess = null;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, commandArgs, env) {
  return spawn(command, commandArgs, {
    stdio: "inherit",
    env,
  });
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log("\nStopping local stack...");
  killChild(clientProcess);
  killChild(serverProcess);

  setTimeout(() => {
    process.exit(code);
  }, 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

log(`Starting OpenCode server on http://${serverHost}:${serverPort}`);
log(`Basic auth -> ${serverUsername} / ${serverPassword}`);
log(`Allowed CORS origin -> ${serverCors}`);

serverProcess = run(
  opencodeCommand,
  [
    "serve",
    "--hostname",
    serverHost,
    "--port",
    serverPort,
    "--cors",
    serverCors,
  ],
  {
    ...process.env,
    OPENCODE_SERVER_USERNAME: serverUsername,
    OPENCODE_SERVER_PASSWORD: serverPassword,
  },
);

serverProcess.on("error", (error) => {
  log(`Failed to start OpenCode server: ${error.message}`);
  shutdown(1);
});

serverProcess.on("exit", (code) => {
  if (!shuttingDown) {
    log(`OpenCode server exited with code ${code ?? 0}`);
    shutdown(code ?? 1);
  }
});

if (!args.has("--server-only")) {
  setTimeout(() => {
    if (shuttingDown) {
      return;
    }

    log("Starting Vite dev server...");
    const clientArgs = ["run", "dev"];

    if (openBrowser) {
      clientArgs.push("--", "--open");
    }

    clientProcess = run(npmCommand, clientArgs, process.env);

    clientProcess.on("error", (error) => {
      log(`Failed to start Vite dev server: ${error.message}`);
      shutdown(1);
    });

    clientProcess.on("exit", (code) => {
      if (!shuttingDown) {
        log(`Vite dev server exited with code ${code ?? 0}`);
        shutdown(code ?? 1);
      }
    });
  }, 900);
}
