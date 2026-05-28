// k6 perf gate for the stock report endpoint (STOCK-08).
//
// Required threshold: p95 latency < 1500ms under 100 RPS warm-cache load.
//
// Usage (one-shot, locally):
//   API_BASE=http://localhost:3001 \
//   API_AUTH_TOKEN=$(jq -r .accessToken < /tmp/finsight-test-jwt.json) \
//   TICKERS=RELIANCE,TCS,INFY,ITC,HDFCBANK \
//   k6 run perf/report-load.js
//
// CI integration is deferred — this script is the local proof gate.
// Phase 4 SUMMARY documents the runbook for re-running it before release.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE ?? "http://localhost:3001";
const TOKEN = __ENV.API_AUTH_TOKEN ?? "";
const TICKER_LIST = (__ENV.TICKERS ?? "RELIANCE,TCS,INFY,ITC,HDFCBANK").split(",");

export const options = {
  scenarios: {
    warm_cache: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  // Warm the cache by hitting each ticker once before the timed run.
  for (const ticker of TICKER_LIST) {
    http.get(`${BASE}/reports/stock/${ticker}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  }
  return { tickers: TICKER_LIST };
}

export default function (data) {
  const ticker = data.tickers[Math.floor(Math.random() * data.tickers.length)];
  const response = http.get(`${BASE}/reports/stock/${ticker}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    tags: { endpoint: "stock-report" },
  });
  check(response, {
    "status is 200": (r) => r.status === 200,
    "has score": (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.score?.value === "number";
      } catch (_err) {
        return false;
      }
    },
  });
  sleep(0.1);
}
