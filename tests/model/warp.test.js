// Cloudflare WARP: the JSON warp-cli prints for status, settings, tunnel stats
// and registration, and the rows built from them. Payloads are real warp-cli
// 2026.7.1377 output; identifiers in the registration are zeroed.
const { test, eq, Warp } = require("../harness.js")

const CONNECTED = '{  "status": "Connected",  "reason": "NetworkHealthy"}'

const CONNECTING_EYEBALLS = '{"status":"Connecting","reason":{"PerformingHappyEyeballs":["162.159.198.2:443","[2606:4700:103::2]:443"]}}'
const CONNECTING_ESTABLISHING = '{"status":"Connecting","reason":{"EstablishingConnection":"162.159.198.2:443"}}'
const CONNECTING_CHECKS = '{"status":"Connecting","reason":"PerformingConnectivityChecks"}'

const DISCONNECTED_MANUAL = '{"status":"Disconnected","reason":"Manual"}'

// What `status` reports straight after `warp-cli disconnect`: the reason is an
// object holding the whole settings diff. Shortened to its first keys here; the
// shape — a one-key object under `reason` — is what matters.
const DISCONNECTED_SETTINGS = '{"status":"Disconnected","reason":{"SettingsChanged":{"current":{"always_on":false,"switch_locked":false,"auto_connect":null,"operation_mode":"Warp"},"previous":{"always_on":true,"switch_locked":false,"auto_connect":null,"operation_mode":"Warp"}}}}'

const SETTINGS = `{
  "settings": {
    "always_on": true,
    "switch_locked": false,
    "operation_mode": "warp",
    "disable_for_wifi": false,
    "disable_for_ethernet": false,
    "onboarding": true,
    "split_tunnel_mode": "exclude",
    "split_tunnel_hosts": [],
    "split_tunnel_ips": [
      {
        "value": "10.0.0.0/8",
        "description": ""
      }
    ],
    "disable_auto_fallback": false,
    "lan_subnet_size": 24,
    "warp_tunnel_protocol": "masque",
    "post_quantum_config": "enabled_with_downgrades",
    "enable_pmtud": true
  }
}`

const STATS = `{
  "v4_endpoint": "162.159.198.2",
  "v6_endpoint": "::",
  "warp_is_on": true,
  "secs_since_last_handshake": 22289,
  "bytes_sent": 876162833,
  "bytes_received": 1261869238,
  "estimated_latency_ms": 56,
  "estimated_loss": 0.0002215079,
  "protocol": "MASQUE (HTTPS via UDP)",
  "tls": {
    "version": "TLSv1.3",
    "curve": "P256Kyber768Draft00",
    "cipher": "TLS_AES_256_GCM_SHA384",
    "post_quantum_enabled": true,
    "sni": "consumer-masque.cloudflareclient.com"
  },
  "edge": {
    "colo": "DEL",
    "metal": "678f17"
  }
}`

const STATS_DOWN = `{
  "code": "WarpNotConnected",
  "error": "WARP is not connected."
}`

const REGISTRATION = `{
  "id": "00000000-0000-0000-0000-000000000000",
  "device_id": "00000000-0000-0000-0000-000000000000",
  "public_key": "REDACTED",
  "managed": false,
  "account": {
    "type": "free",
    "id": "00000000000000000000000000000000",
    "license": "REDACTED"
  },
  "alternate_networks": []
}`

// Printed by every command, exit 1, when there is no TTY and the terms were
// never accepted.
const TOS = "Please accept the WARP Terms of Service by running this command in a TTY or by passing the --accept-tos flag."

test("parseWarpStatus reads a connected payload", () => {
  const status = Warp.parseWarpStatus(CONNECTED)
  eq(status.state, "connected")
  eq(status.connected, true)
  eq(status.reason, "NetworkHealthy")
  eq(status.reasonText, "Network healthy")
})

test("parseWarpStatus names an object reason by its key", () => {
  eq(Warp.parseWarpStatus(CONNECTING_EYEBALLS).reason, "PerformingHappyEyeballs")
  eq(Warp.parseWarpStatus(CONNECTING_ESTABLISHING).reason, "EstablishingConnection")
  eq(Warp.parseWarpStatus(CONNECTING_CHECKS).reason, "PerformingConnectivityChecks")
  const settingsChanged = Warp.parseWarpStatus(DISCONNECTED_SETTINGS)
  eq(settingsChanged.state, "disconnected")
  eq(settingsChanged.reason, "SettingsChanged")
  eq(settingsChanged.connected, false)
})

test("parseWarpStatus treats a connecting tunnel as not connected yet", () => {
  const status = Warp.parseWarpStatus(CONNECTING_ESTABLISHING)
  eq(status.state, "connecting")
  eq(status.connected, false)
  eq(Warp.warpSummary(status, null, null), "Connecting…")
})

test("parseWarpStatus treats unparseable output as no idea", () => {
  // Not as disconnected: a tunnel reported down on an unreadable answer is the
  // wrong direction to guess in.
  eq(Warp.parseWarpStatus("").state, "")
  eq(Warp.parseWarpStatus(TOS).state, "")
  eq(Warp.parseWarpStatus("[1,2]").state, "")
  eq(Warp.parseWarpStatus('{"reason":"Manual"}').state, "")
  eq(Warp.warpSummary(Warp.parseWarpStatus(""), null, null), "Checking…")
})

test("parseWarpStatus keeps an unfamiliar status visible rather than guessing", () => {
  const status = Warp.parseWarpStatus('{"status":"Paused","reason":"TrustedNetwork"}')
  eq(status.state, "unknown")
  eq(status.connected, false)
  eq(Warp.warpSummary(status, null, null), "Paused")
})

test("warpSummary says what the unable state is about", () => {
  const missing = Warp.parseWarpStatus('{"status":"Unable","reason":{"RegistrationMissing":"DaemonStartup"}}')
  eq(missing.state, "unable")
  eq(Warp.warpSummary(missing, null, null), "Not registered")
  const bound = Warp.parseWarpStatus('{"status":"Unable","reason":{"Port53Bound":{"offending_processes":[]}}}')
  eq(Warp.warpSummary(bound, null, null), "Port53 bound")
})

test("warpSummary names the data centre while connected", () => {
  const status = Warp.parseWarpStatus(CONNECTED)
  eq(Warp.warpSummary(status, Warp.parseWarpStats(STATS), null), "Cloudflare · DEL")
  eq(Warp.warpSummary(status, Warp.parseWarpStats(STATS_DOWN), null), "Connected")
  eq(Warp.warpSummary(Warp.parseWarpStatus(DISCONNECTED_MANUAL), null, null), "Not connected")
})

test("parseWarpSettings reads the mode and protocol", () => {
  const settings = Warp.parseWarpSettings(SETTINGS)
  eq(settings.loaded, true)
  eq(settings.mode, "warp")
  eq(settings.protocol, "masque")
  eq(settings.switchLocked, false)
  eq(Warp.parseWarpSettings(TOS).loaded, false)
  eq(Warp.parseWarpSettings('{"code":"x"}').loaded, false)
})

test("parseWarpStats reads the edge and rejects the not-connected answer", () => {
  const stats = Warp.parseWarpStats(STATS)
  eq(stats.loaded, true)
  eq(stats.colo, "DEL")
  eq(stats.protocol, "MASQUE (HTTPS via UDP)")
  eq(stats.latencyMs, 56)
  eq(stats.endpoint, "162.159.198.2")
  eq(Warp.parseWarpStats(STATS_DOWN).loaded, false)
})

test("parseWarpRegistration reads the account type", () => {
  const registration = Warp.parseWarpRegistration(REGISTRATION)
  eq(registration.registered, true)
  eq(registration.accountType, "free")
  eq(registration.managed, false)
  eq(Warp.warpAccountLabel("free"), "Free")
  eq(Warp.warpAccountLabel("limited"), "WARP+")
  eq(Warp.parseWarpRegistration(TOS).registered, false)
  eq(Warp.parseWarpRegistration("{}").registered, false)
})

test("warpDetails shows the tunnel only while connected", () => {
  const settings = Warp.parseWarpSettings(SETTINGS)
  const stats = Warp.parseWarpStats(STATS)
  const registration = Warp.parseWarpRegistration(REGISTRATION)
  eq(Warp.warpDetails(Warp.parseWarpStatus(CONNECTED), settings, stats, registration), [
    { label: "Data centre", value: "DEL" },
    { label: "Mode", value: "WARP" },
    { label: "Protocol", value: "MASQUE (HTTPS via UDP)" },
    { label: "Latency", value: "56 ms" },
    { label: "Account", value: "Free" }
  ])
  eq(Warp.warpDetails(Warp.parseWarpStatus(DISCONNECTED_MANUAL), settings, stats, registration), [])
})

test("warpDetails reports a degraded network, not a healthy one", () => {
  const degraded = Warp.parseWarpStatus('{"status":"Connected","reason":{"NetworkDegraded":{"loss_percent":8,"rtt_ms":400}}}')
  const rows = Warp.warpDetails(degraded, null, null, null)
  eq(rows, [{ label: "Network", value: "Network degraded" }])
})

test("warpTargets offers only the modes that tunnel traffic", () => {
  const targets = Warp.warpTargets()
  eq(targets.map(t => t.key), ["mode:warp", "mode:warp+doh"])
  eq(targets[0].args, ["warp"])
  // Plain WARP already tunnels DNS; the DoH row must not claim to be what encrypts it.
  eq(targets[1].detail, "Same tunnel, plus DNS over HTTPS")
  eq(Warp.warpIsTunnelMode("doh"), false)
  eq(Warp.warpIsTunnelMode("proxy"), false)
  eq(Warp.warpIsTunnelMode("warp+doh"), true)
})

test("warpCurrentKey ticks the connected mode", () => {
  const settings = Warp.parseWarpSettings(SETTINGS)
  eq(Warp.warpCurrentKey(Warp.parseWarpStatus(CONNECTED), settings), "mode:warp")
  eq(Warp.warpCurrentKey(Warp.parseWarpStatus(DISCONNECTED_MANUAL), settings), "")
  eq(Warp.warpCurrentKey(Warp.parseWarpStatus(CONNECTED), Warp.parseWarpSettings("")), "")
  // A mode the list does not offer ticks nothing rather than the wrong row.
  eq(Warp.warpCurrentKey(Warp.parseWarpStatus(CONNECTED), { loaded: true, mode: "doh" }), "")
})

test("warpNeedsModeChange skips the mode call when it already matches", () => {
  const settings = Warp.parseWarpSettings(SETTINGS)
  const targets = Warp.warpTargets()
  eq(Warp.warpNeedsModeChange(settings, targets[0]), false)
  eq(Warp.warpNeedsModeChange(settings, targets[1]), true)
  // Settings not read yet: set the mode rather than connect in an unknown one.
  eq(Warp.warpNeedsModeChange(Warp.parseWarpSettings(""), targets[0]), true)
})

test("warpSetupHint says what stops the backend from appearing", () => {
  eq(Warp.warpSetupHint({ present: false }), "")
  eq(Warp.warpSetupHint({ present: true, needsTos: true }),
    "Cloudflare WARP: accept its terms once by running warp-cli registration show in a terminal")
  eq(Warp.warpSetupHint({ present: true, daemonDown: true }),
    "Cloudflare WARP: start its service with sudo systemctl enable --now warp-svc")
  eq(Warp.warpSetupHint({ present: true, registered: false }),
    "Cloudflare WARP: register this device with warp-cli registration new")
  eq(Warp.warpSetupHint({ present: true, registered: true }), "")
})

test("warpSetupCommand runs what the hint names, and nothing once set up", () => {
  eq(Warp.warpSetupCommand({ present: false }), "")
  eq(Warp.warpSetupCommand({ present: true, needsTos: true }), "warp-cli registration show")
  eq(Warp.warpSetupCommand({ present: true, daemonDown: true }), "sudo systemctl enable --now warp-svc")
  eq(Warp.warpSetupCommand({ present: true, registered: false }), "warp-cli registration new")
  eq(Warp.warpSetupCommand({ present: true, registered: true }), "")
  // The hint and the command always describe the same case, in the same order.
  for (const probe of [{ present: true, needsTos: true, daemonDown: true }, { present: true, daemonDown: true, registered: false }]) {
    const hint = Warp.warpSetupHint(probe)
    const command = Warp.warpSetupCommand(probe)
    eq(hint.indexOf(command.replace(/^sudo /, "")) !== -1, true)
  }
})

test("warp failures are recognised from warp-cli's own messages", () => {
  eq(Warp.warpNeedsTos(TOS), true)
  eq(Warp.warpDaemonUnreachable("Unable to connect to the CloudflareWARP daemon: Connection refused (os error 111)"), true)
  eq(Warp.warpDaemonUnreachable("Error communicating with daemon: broken pipe"), true)
  eq(Warp.warpDaemonUnreachable("error: invalid value 'bogus' for '<MODE>'"), false)
  eq(Warp.describeWarpFailure(TOS, "x"), "Accept the WARP terms once: run warp-cli registration show in a terminal")
  eq(Warp.describeWarpFailure("", "WARP command failed"), "WARP command failed")
})
