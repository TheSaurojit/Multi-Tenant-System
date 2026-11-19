import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const TARGET_VUS = Number(__ENV.VUS || 50);
const RAMP_DURATION = __ENV.RAMP_DURATION || "20s";
const HOLD_DURATION = __ENV.DURATION || "2m";
const COOLDOWN_DURATION = __ENV.COOLDOWN_DURATION || "10s";

// Custom metrics
const dashboardDuration = new Trend("dashboard_duration", true);
const dashboardLast7Duration = new Trend("dashboard_last7_duration", true);
const exportDuration = new Trend("export_duration", true);
const successfulRequests = new Counter("successful_requests");
const failedRequests = new Counter("failed_requests");

export const options = {
  stages: [
    { duration: RAMP_DURATION, target: TARGET_VUS }, // Ramp-up to the target concurrent users
    { duration: HOLD_DURATION, target: TARGET_VUS },  // Hold the target VUs for at least 2 minutes
    { duration: COOLDOWN_DURATION, target: 0 },  // Cool-down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<3000"],
    dashboard_last7_duration: ["p(95)<2000", "p(99)<3000"],
    dashboard_duration: ["p(95)<2000", "p(99)<3000"],
    export_duration: ["p(95)<2000"],
    failed_requests: ["count==0"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TARGET_PATH = __ENV.TARGET_PATH || "/dashboard?range=last7";
const EXPORT_PATH = __ENV.EXPORT_PATH || "/api/workspace/export?range=last30";

let SESSION_TOKENS = [];
try {
  if (__ENV.SESSION_TOKENS) {
    SESSION_TOKENS = JSON.parse(__ENV.SESSION_TOKENS);
  } else if (__ENV.SESSION_TOKENS_FILE) {
    SESSION_TOKENS = JSON.parse(open(__ENV.SESSION_TOKENS_FILE));
  } else {
    try {
      SESSION_TOKENS = JSON.parse(open("./loadtest-tokens.json"));
    } catch {
      try {
        SESSION_TOKENS = JSON.parse(open("../loadtest-tokens.json"));
      } catch {
        SESSION_TOKENS = [];
      }
    }
  }
} catch (err) {
  throw new Error("SESSION_TOKENS must be a valid JSON array or point to a valid tokens JSON file.");
}

let ACTIVE_ORG = __ENV.ACTIVE_ORG || "";
let ACTIVE_WORKSPACE = __ENV.ACTIVE_WORKSPACE || "";

if (!ACTIVE_ORG || !ACTIVE_WORKSPACE) {
  try {
    const cfg = JSON.parse(open("./loadtest-config.json"));
    if (!ACTIVE_ORG) ACTIVE_ORG = cfg.activeOrg || "";
    if (!ACTIVE_WORKSPACE) ACTIVE_WORKSPACE = cfg.activeWorkspace || "";
  } catch {
    try {
      const cfg = JSON.parse(open("../loadtest-config.json"));
      if (!ACTIVE_ORG) ACTIVE_ORG = cfg.activeOrg || "";
      if (!ACTIVE_WORKSPACE) ACTIVE_WORKSPACE = cfg.activeWorkspace || "";
    } catch {
      // Configuration file is optional
    }
  }
}

if (
  !Number.isInteger(TARGET_VUS) ||
  TARGET_VUS < 1 ||
  !Array.isArray(SESSION_TOKENS) ||
  SESSION_TOKENS.length < TARGET_VUS ||
  new Set(SESSION_TOKENS).size < TARGET_VUS ||
  SESSION_TOKENS.slice(0, TARGET_VUS).some((token) => typeof token !== "string" || token.length === 0)
) {
  throw new Error(
    `Set SESSION_TOKENS to a JSON array of at least ${TARGET_VUS} distinct, non-empty session tokens.`
  );
}

export default function () {
  const cookieHeaders = [];
  const sessionToken = SESSION_TOKENS[(__VU - 1) % SESSION_TOKENS.length];
  cookieHeaders.push(`saas_auth_token=${sessionToken}`);
  if (ACTIVE_ORG) {
    cookieHeaders.push(`saas_active_org=${ACTIVE_ORG}`);
  }
  if (ACTIVE_WORKSPACE) {
    cookieHeaders.push(`saas_active_workspace=${ACTIVE_WORKSPACE}`);
  }

  // Realistic request mix: 10% CSV exports, 90% dashboard page requests
  const isExport = (__ITER + __VU) % 10 === 0;
  const path = isExport ? EXPORT_PATH : TARGET_PATH;

  const params = {
    headers: {
      Cookie: cookieHeaders.join("; "),
      "User-Agent": "k6-loadtest/1.0",
      Accept: isExport
        ? "text/csv,text/plain,*/*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirects: 0,
  };

  const res = http.get(`${BASE_URL}${path}`, params);

  if (isExport) {
    exportDuration.add(res.timings.duration);
  } else {
    dashboardDuration.add(res.timings.duration);
    dashboardLast7Duration.add(res.timings.duration);
  }

  const checks = {
    "status is 200": (r) => r.status === 200,
    "not redirected": (r) => r.status !== 307 && r.status !== 302,
  };
  if (isExport) {
    checks["CSV content type"] = (r) => r.headers["Content-Type"]?.includes("text/csv");
    checks["CSV body received"] = (r) => typeof r.body === "string" && r.body.startsWith("Date,");
  }
  const ok = check(res, checks);

  if (ok) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
  }

  sleep(0.05);
}
