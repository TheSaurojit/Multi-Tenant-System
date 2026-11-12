import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

// Custom metrics
const dashboardDuration = new Trend("dashboard_duration", true);
const dashboardLast7Duration = new Trend("dashboard_last7_duration", true);
const exportDuration = new Trend("export_duration", true);
const successfulRequests = new Counter("successful_requests");
const failedRequests = new Counter("failed_requests");

export const options = {
  stages: [
    { duration: "20s", target: 50 }, // Ramp-up to 50 concurrent users
    { duration: "2m", target: 50 },  // Hold 50 VUs for at least 2 minutes
    { duration: "10s", target: 0 },  // Cool-down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<3000"],
    dashboard_last7_duration: ["p(95)<2000", "p(99)<3000"],
    dashboard_duration: ["p(95)<2000", "p(99)<3000"],
    export_duration: ["p(95)<2500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TARGET_PATH = __ENV.TARGET_PATH || "/dashboard?range=last7";
const EXPORT_PATH = __ENV.EXPORT_PATH || "/api/workspace/export?range=last7";
const SESSION_TOKEN = __ENV.SESSION_TOKEN || "";
const ACTIVE_ORG = __ENV.ACTIVE_ORG || "";
const ACTIVE_WORKSPACE = __ENV.ACTIVE_WORKSPACE || "";

export default function () {
  const cookieHeaders = [];
  if (SESSION_TOKEN) {
    cookieHeaders.push(`saas_auth_token=${SESSION_TOKEN}`);
  }
  if (ACTIVE_ORG) {
    cookieHeaders.push(`saas_active_org=${ACTIVE_ORG}`);
  }
  if (ACTIVE_WORKSPACE) {
    cookieHeaders.push(`saas_active_workspace=${ACTIVE_WORKSPACE}`);
  }

  // Realistic request mix: 10% CSV exports, 90% dashboard page requests
  const isExport = Math.random() < 0.1;
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

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "not redirected": (r) => r.status !== 307 && r.status !== 302,
  });

  if (ok) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
  }

  sleep(0.05);
}
