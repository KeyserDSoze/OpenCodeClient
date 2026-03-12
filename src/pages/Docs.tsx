import { useState } from "react";

type DocsTab = "general" | "azure-linux" | "azure-windows";

interface DocsPageProps {
  onBack: () => void;
}

export function DocsPage({ onBack }: DocsPageProps) {
  const [tab, setTab] = useState<DocsTab>("general");

  return (
    <main className="docs-shell">
      <button className="docs-back-btn" type="button" onClick={onBack}>
        ← Back
      </button>

      <div>
        <h1 className="docs-title">How to create the OpenCode server and connect the client</h1>
        <p>
          Quick guide to start <code>opencode serve</code>, protect access with a username and
          password, and correctly configure CORS for the <code>opencode.zone</code> origin or
          your local environment.
        </p>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="docs-tabs" role="tablist">
        <button
          className={`docs-tab ${tab === "general" ? "docs-tab-active" : ""}`}
          role="tab"
          aria-selected={tab === "general"}
          type="button"
          onClick={() => setTab("general")}
        >
          General
        </button>
        <button
          className={`docs-tab ${tab === "azure-linux" ? "docs-tab-active" : ""}`}
          role="tab"
          aria-selected={tab === "azure-linux"}
          type="button"
          onClick={() => setTab("azure-linux")}
        >
          Azure VM — Linux
        </button>
        <button
          className={`docs-tab ${tab === "azure-windows" ? "docs-tab-active" : ""}`}
          role="tab"
          aria-selected={tab === "azure-windows"}
          type="button"
          onClick={() => setTab("azure-windows")}
        >
          Azure VM — Windows Server
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: General
         ══════════════════════════════════════════════════════════════ */}
      {tab === "general" && (
        <div className="docs-tab-panel">
          <section className="docs-section">
            <h2 className="docs-section-title">1. Installation</h2>
            <p>Install OpenCode globally on the server or PC that will host the backend.</p>
            <div className="docs-code-block"><pre><code>{`npm install -g opencode`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">2. Key concepts</h2>
            <article className="docs-note">
              <strong>Web app</strong> — <code>https://opencode.zone</code> is the frontend published on GitHub Pages.
            </article>
            <article className="docs-note">
              <strong>OpenCode server</strong> — <code>https://ai.example.com</code> or <code>https://api.opencode.zone</code> is the real backend.
            </article>
            <article className="docs-note">
              <strong>CORS</strong> — The server must allow the origin <code>https://opencode.zone</code>.
            </article>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">3. Start with username, password and CORS</h2>
            <p>
              The client connects via HTTP Basic Auth. The default username is <code>opencode</code>, but
              you can set a custom one with <code>OPENCODE_SERVER_USERNAME</code>.
            </p>
            <div className="docs-code-block"><pre><code>{`OPENCODE_SERVER_USERNAME=opencode \\
OPENCODE_SERVER_PASSWORD=a-strong-password \\
opencode serve \\
  --hostname 0.0.0.0 \\
  --port 4096 \\
  --cors https://opencode.zone \\
  --cors http://localhost:5173`}</code></pre></div>
            <p>
              In production keep <code>https://opencode.zone</code> among the allowed origins. During
              development also keep <code>http://localhost:5173</code> if you use Vite locally.
            </p>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">4. Windows PowerShell example</h2>
            <div className="docs-code-block"><pre><code>{`$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "a-strong-password"
opencode serve --hostname 0.0.0.0 --port 4096 --cors https://opencode.zone --cors http://localhost:5173`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">5. How to fill in the connection form</h2>
            <article className="docs-note">
              <strong>Server URL</strong> — <code>https://ai.example.com</code>, <code>https://api.opencode.zone</code> or <code>http://IP:4096</code>
            </article>
            <article className="docs-note">
              <strong>Username</strong> — Same value as <code>OPENCODE_SERVER_USERNAME</code> or <code>opencode</code>
            </article>
            <article className="docs-note">
              <strong>Password</strong> — Same value as <code>OPENCODE_SERVER_PASSWORD</code>
            </article>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">6. Useful checks</h2>
            <p>Verify the server is responding before opening the client.</p>
            <div className="docs-code-block"><pre><code>{`GET /global/health
GET /doc
GET /event`}</code></pre></div>
            <p>
              Open <code>/doc</code> to see the OpenAPI spec and <code>/global/health</code> to check
              if the server is healthy.
            </p>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">7. Important CORS notes</h2>
            <article className="docs-note">
              The browser blocks requests if the client domain is not listed in <code>--cors</code>.
              Always add every real origin from which you will use the client.
            </article>
            <article className="docs-note">
              For this app: <code>https://opencode.zone</code> in production and{" "}
              <code>http://localhost:5173</code> in development.
            </article>
            <article className="docs-note">
              If you use a separate subdomain for the backend (e.g. <code>https://api.opencode.zone</code>),
              the <strong>Server URL</strong> in the form must be that, not <code>https://opencode.zone</code>.
            </article>
          </section>

          <section className="docs-section">
            <h2 className="docs-section-title">8. Public access</h2>
            <p>
              If the server runs at home or on a private network, you must expose it securely: HTTPS
              reverse proxy, tunnel, or a private network like Tailscale. Avoid publishing the server
              without a strong password and TLS.
            </p>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: Azure VM — Linux (Ubuntu)
         ══════════════════════════════════════════════════════════════ */}
      {tab === "azure-linux" && (
        <div className="docs-tab-panel">
          <section className="docs-section">
            <h2 className="docs-section-title">Azure VM — Linux (Ubuntu 24.04)</h2>
            <p>
              Full walkthrough: provision an Ubuntu VM on Azure, open the right NSG ports, install
              OpenCode, set up a reverse proxy (nginx or Caddy) for HTTPS, and run OpenCode as a
              systemd service.
            </p>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">1 — Create the VM (Azure CLI)</h3>
            <p>Run these commands in Azure CLI (or follow the same steps in the Azure Portal).</p>
            <div className="docs-code-block"><pre><code>{`# Create a resource group
az group create \\
  --name opencode-rg \\
  --location eastus

# Create the VM (Ubuntu 24.04 LTS, Standard_B2s)
az vm create \\
  --resource-group opencode-rg \\
  --name opencode-vm \\
  --image Ubuntu2404 \\
  --size Standard_B2s \\
  --admin-username azureuser \\
  --generate-ssh-keys \\
  --public-ip-sku Standard

# Note the publicIpAddress printed in the output`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">2 — Open ports in the NSG</h3>
            <p>
              You need port <strong>22</strong> (SSH), <strong>80</strong> (HTTP → Let's Encrypt
              challenge), and <strong>443</strong> (HTTPS). Port 4096 does <em>not</em> need to be
              public — the reverse proxy handles that internally.
            </p>
            <div className="docs-code-block"><pre><code>{`az vm open-port --resource-group opencode-rg --name opencode-vm --port 22  --priority 900
az vm open-port --resource-group opencode-rg --name opencode-vm --port 80  --priority 901
az vm open-port --resource-group opencode-rg --name opencode-vm --port 443 --priority 902`}</code></pre></div>
            <article className="docs-note">
              Never open port 4096 to the internet. The proxy forwards traffic internally on localhost.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">3 — Install Node.js + OpenCode</h3>
            <div className="docs-code-block"><pre><code>{`# SSH in
ssh azureuser@<YOUR-VM-PUBLIC-IP>

# Install Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install OpenCode
sudo npm install -g opencode

# Verify
opencode --version`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">4 — Reverse proxy option A: nginx + Certbot</h3>
            <div className="docs-code-block"><pre><code>{`sudo apt-get install -y nginx certbot python3-certbot-nginx

# Create site config (replace api.example.com with your domain)
sudo tee /etc/nginx/sites-available/opencode <<'EOF'
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass         http://127.0.0.1:4096;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/opencode /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtain a free TLS certificate (DNS must already point to the VM)
sudo certbot --nginx -d api.example.com`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">4 — Reverse proxy option B: Caddy (auto-HTTPS)</h3>
            <p>Caddy provisions and renews TLS certificates automatically — no Certbot needed.</p>
            <div className="docs-code-block"><pre><code>{`sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo tee /etc/caddy/Caddyfile <<'EOF'
api.example.com {
    reverse_proxy 127.0.0.1:4096
}
EOF

sudo systemctl reload caddy`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">5 — Run OpenCode as a systemd service</h3>
            <div className="docs-code-block"><pre><code>{`sudo tee /etc/systemd/system/opencode.service <<'EOF'
[Unit]
Description=OpenCode server
After=network.target

[Service]
Type=simple
User=azureuser
WorkingDirectory=/home/azureuser
Environment="OPENCODE_SERVER_USERNAME=opencode"
Environment="OPENCODE_SERVER_PASSWORD=a-strong-password-here"
ExecStart=/usr/bin/opencode serve --hostname 127.0.0.1 --port 4096 --cors https://opencode.zone
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now opencode
sudo systemctl status opencode`}</code></pre></div>
            <article className="docs-note">
              Use <code>--hostname 127.0.0.1</code> so OpenCode only listens locally; the proxy bridges
              to it. Add <code>--cors</code> for every origin — at minimum <code>https://opencode.zone</code>.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">6 — Connect the web client</h3>
            <article className="docs-note"><strong>Server URL</strong> — <code>https://api.example.com</code></article>
            <article className="docs-note"><strong>Username</strong> — <code>opencode</code></article>
            <article className="docs-note"><strong>Password</strong> — the value set in the service file</article>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: Azure VM — Windows Server (GUI)
         ══════════════════════════════════════════════════════════════ */}
      {tab === "azure-windows" && (
        <div className="docs-tab-panel">
          <section className="docs-section">
            <h2 className="docs-section-title">Azure VM — Windows Server (with GUI)</h2>
            <p>
              This guide covers provisioning a Windows Server VM on Azure (with Desktop Experience so
              you have a full GUI), opening NSG ports, installing Node.js and OpenCode, setting up IIS
              as a reverse proxy with the ARR + URL Rewrite modules, obtaining a TLS certificate with
              Win-ACME, and running OpenCode as a Windows Service with NSSM. The GUI approach is ideal
              if you also want to install other software on the same machine.
            </p>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">1 — Create the VM (Azure CLI)</h3>
            <div className="docs-code-block"><pre><code>{`# Create a resource group
az group create \\
  --name opencode-rg \\
  --location eastus

# Create a Windows Server 2022 VM with Desktop Experience (GUI)
az vm create \\
  --resource-group opencode-rg \\
  --name opencode-win-vm \\
  --image Win2022AzureEditionCore \\
  --size Standard_B2s \\
  --admin-username azureuser \\
  --admin-password "YourStr0ngP@ssword!" \\
  --public-ip-sku Standard

# Note the publicIpAddress printed in the output`}</code></pre></div>
            <article className="docs-note">
              If you want the full Desktop Experience (GUI), use image{" "}
              <code>Win2022Datacenter</code> instead of <code>Win2022AzureEditionCore</code>.
              The Core edition has no GUI but is lighter; swap as needed.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">2 — Open ports in the NSG</h3>
            <p>
              You need <strong>3389</strong> (RDP to manage the VM), <strong>80</strong> (HTTP — needed
              for the ACME certificate challenge), and <strong>443</strong> (HTTPS). Port 4096 stays
              internal.
            </p>
            <div className="docs-code-block"><pre><code>{`az vm open-port --resource-group opencode-rg --name opencode-win-vm --port 3389 --priority 900
az vm open-port --resource-group opencode-rg --name opencode-win-vm --port 80  --priority 901
az vm open-port --resource-group opencode-rg --name opencode-win-vm --port 443 --priority 902`}</code></pre></div>
            <article className="docs-note">
              For production, restrict RDP (port 3389) to your own IP only via the NSG inbound rule, or
              use Azure Bastion instead of exposing RDP publicly.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">3 — Connect via RDP and install Node.js</h3>
            <p>
              Connect to the VM with Remote Desktop (mstsc on Windows, Microsoft Remote Desktop on
              macOS) using the public IP and the credentials you set above.
            </p>
            <p>
              Once logged in, open <strong>PowerShell as Administrator</strong> and run:
            </p>
            <div className="docs-code-block"><pre><code>{`# Install winget if not present (Windows Server 2022 usually has it)
# Then install Node.js LTS
winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements

# Close and reopen PowerShell so node/npm are in PATH, then verify
node --version
npm --version

# Install OpenCode globally
npm install -g opencode
opencode --version`}</code></pre></div>
            <article className="docs-note">
              If winget is not available, download the Node.js LTS installer from{" "}
              <code>https://nodejs.org</code> and run it via the GUI — it adds node and npm to PATH
              automatically.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">4 — Run OpenCode as a Windows Service (NSSM)</h3>
            <p>
              NSSM (Non-Sucking Service Manager) wraps any executable as a Windows Service so OpenCode
              starts automatically on boot and restarts on failure.
            </p>
            <div className="docs-code-block"><pre><code>{`# Download NSSM (run in PowerShell as Administrator)
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$env:TEMP\\nssm.zip"
Expand-Archive -Path "$env:TEMP\\nssm.zip" -DestinationPath "$env:TEMP\\nssm"
Copy-Item "$env:TEMP\\nssm\\nssm-2.24\\win64\\nssm.exe" "C:\\Windows\\System32\\nssm.exe"

# Find where opencode.cmd was installed (usually AppData\\Roaming\\npm)
where.exe opencode

# Create the service  (adjust the path if different)
nssm install OpenCode "C:\\Users\\azureuser\\AppData\\Roaming\\npm\\opencode.cmd"
nssm set OpenCode AppParameters "serve --hostname 127.0.0.1 --port 4096 --cors https://opencode.zone"
nssm set OpenCode AppEnvironmentExtra "OPENCODE_SERVER_USERNAME=opencode" "OPENCODE_SERVER_PASSWORD=a-strong-password-here"
nssm set OpenCode Start SERVICE_AUTO_START
nssm set OpenCode AppStdout "C:\\Logs\\opencode-stdout.log"
nssm set OpenCode AppStderr "C:\\Logs\\opencode-stderr.log"

# Create log directory and start the service
New-Item -ItemType Directory -Force -Path "C:\\Logs"
nssm start OpenCode

# Check status
nssm status OpenCode`}</code></pre></div>
            <article className="docs-note">
              You can also manage the service from the Windows Services GUI (<code>services.msc</code>):
              look for the entry named <strong>OpenCode</strong>.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">5 — Install IIS with ARR + URL Rewrite</h3>
            <p>
              IIS acts as the reverse proxy that forwards HTTPS traffic to OpenCode on port 4096.
              You need two Microsoft extensions: <strong>Application Request Routing (ARR)</strong> and{" "}
              <strong>URL Rewrite</strong>.
            </p>
            <div className="docs-code-block"><pre><code>{`# Enable IIS and the required features (PowerShell as Administrator)
Install-WindowsFeature -Name Web-Server, Web-WebSockets -IncludeManagementTools

# Download and install the Web Platform Installer CLI (WebpiCmd)
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/?LinkId=287166" -OutFile "$env:TEMP\\WebPlatformInstaller_amd64_en-US.msi"
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\\WebPlatformInstaller_amd64_en-US.msi /quiet" -Wait

# Use WebpiCmd to install ARR 3.0 and URL Rewrite 2.1
& "C:\\Program Files\\Microsoft\\Web Platform Installer\\WebpiCmd.exe" /Install /Products:"ARR30,UrlRewrite2" /AcceptEula`}</code></pre></div>
            <article className="docs-note">
              Alternatively, download the ARR and URL Rewrite MSI installers manually from the
              Microsoft IIS website and run them through the GUI.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">6 — Configure IIS reverse proxy</h3>
            <p>
              Enable proxy mode in ARR, then add a URL Rewrite rule that forwards all traffic to
              OpenCode. Run in PowerShell as Administrator:
            </p>
            <div className="docs-code-block"><pre><code>{`# Enable ARR proxy
& "$env:SystemRoot\\system32\\inetsrv\\appcmd.exe" set config -section:system.webServer/proxy /enabled:true /commit:apphost

# Create a new IIS site (replace api.example.com and the cert thumbprint later)
New-WebSite -Name "OpenCode" -Port 80 -HostHeader "api.example.com" -PhysicalPath "C:\\inetpub\\opencode" -Force
New-Item -ItemType Directory -Force -Path "C:\\inetpub\\opencode"

# Add URL Rewrite rule to web.config
$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="OpenCode Proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:4096/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <webSocket enabled="true" />
  </system.webServer>
</configuration>
'@
$webConfig | Set-Content "C:\\inetpub\\opencode\\web.config" -Encoding UTF8`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">7 — Obtain a free TLS certificate (win-acme)</h3>
            <p>
              win-acme is the easiest way to get a Let's Encrypt certificate on Windows and bind it
              to IIS automatically.
            </p>
            <div className="docs-code-block"><pre><code>{`# Download win-acme
Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.9.1701.x64.pluggable.zip" -OutFile "$env:TEMP\\wacs.zip"
Expand-Archive -Path "$env:TEMP\\wacs.zip" -DestinationPath "C:\\wacs"

# Run the interactive wizard — choose your IIS site and domain
# win-acme will request the cert, bind it to IIS, and schedule auto-renewal
C:\\wacs\\wacs.exe`}</code></pre></div>
            <p>
              In the wizard: choose <strong>IIS</strong> as the target, select the{" "}
              <strong>OpenCode</strong> site, confirm the domain (<code>api.example.com</code>), and
              let win-acme handle binding and renewal.
            </p>
            <article className="docs-note">
              Your DNS A record for <code>api.example.com</code> must point to the VM's public IP
              before running win-acme, otherwise the ACME challenge will fail.
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">8 — Add the HTTPS binding to IIS</h3>
            <p>
              If win-acme didn't create the HTTPS binding automatically, add it manually via{" "}
              <strong>IIS Manager</strong>:
            </p>
            <ol className="docs-ol">
              <li>Open <strong>IIS Manager</strong> → select the <strong>OpenCode</strong> site.</li>
              <li>In the right panel click <strong>Bindings…</strong> → <strong>Add</strong>.</li>
              <li>Type: <strong>https</strong>, Port: <strong>443</strong>, Host name: <code>api.example.com</code>.</li>
              <li>Select the SSL certificate issued by win-acme / Let's Encrypt.</li>
              <li>Click <strong>OK</strong> and restart the site.</li>
            </ol>
            <article className="docs-note">
              To redirect HTTP → HTTPS, add a second URL Rewrite rule with condition{" "}
              <code>HTTPS = off</code> and action <em>Redirect</em> to <code>https://{"{"}{"{"}HTTP_HOST{"}"}{"}"}{"{"}{"{"}REQUEST_URI{"}"}{"}"}.</code>
            </article>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">9 — Windows Firewall rules</h3>
            <p>
              The NSG rules opened ports at the Azure level, but Windows Firewall may still block
              them. Allow inbound traffic on 80 and 443:
            </p>
            <div className="docs-code-block"><pre><code>{`# Run in PowerShell as Administrator
New-NetFirewallRule -DisplayName "Allow HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "Allow HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow`}</code></pre></div>
          </section>

          <section className="docs-section">
            <h3 className="docs-subsection-title">10 — Connect the web client</h3>
            <article className="docs-note"><strong>Server URL</strong> — <code>https://api.example.com</code></article>
            <article className="docs-note"><strong>Username</strong> — <code>opencode</code></article>
            <article className="docs-note"><strong>Password</strong> — the value set in the NSSM service config</article>
          </section>
        </div>
      )}
    </main>
  );
}
