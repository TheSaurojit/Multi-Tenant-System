import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

// Custom metrics
const dashboardLast7Duration = new Trend('dashboard_last7_duration', true)
const successfulRequests = new Counter('successful_requests')
const failedRequests = new Counter('failed_requests')

export const options = {
  stages: [
    { duration: '20s', target: 1 },  // Concurrency 1
    { duration: '20s', target: 5 },  // Concurrency 5
    { duration: '30s', target: 50 }, // Concurrency 50
    { duration: '5s', target: 0 },   // Cool-down
  ],
  thresholds: {
    // Target: p95 under ~2s at 50 users
    'http_req_duration': ['p(95)<2000'],
    'dashboard_last7_duration': ['p(95)<2000'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const TARGET_PATH = __ENV.TARGET_PATH || '/dashboard?range=last7'
const SESSION_TOKEN = __ENV.SESSION_TOKEN || ''
const ACTIVE_ORG = __ENV.ACTIVE_ORG || ''
const ACTIVE_WORKSPACE = __ENV.ACTIVE_WORKSPACE || ''

export default function () {
  const cookieHeaders = []
  if (SESSION_TOKEN) {
    cookieHeaders.push(`saas_auth_token=${SESSION_TOKEN}`)
  }
  if (ACTIVE_ORG) {
    cookieHeaders.push(`saas_active_org=${ACTIVE_ORG}`)
  }
  if (ACTIVE_WORKSPACE) {
    cookieHeaders.push(`saas_active_workspace=${ACTIVE_WORKSPACE}`)
  }

  const params = {
    headers: {
      'Cookie': cookieHeaders.join('; '),
      'User-Agent': 'k6-loadtest/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirects: 0,
  }

  const res = http.get(`${BASE_URL}${TARGET_PATH}`, params)
  dashboardLast7Duration.add(res.timings.duration)

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'not redirected': (r) => r.status !== 307 && r.status !== 302,
  })

  if (ok) {
    successfulRequests.add(1)
  } else {
    failedRequests.add(1)
  }

  sleep(0.05)
}
