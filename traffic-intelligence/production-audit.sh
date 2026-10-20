#!/usr/bin/env bash
# Read-only Cloudflare production provenance audit. Never writes/deploys.
set -euo pipefail
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo 'BLOCKED: Cloudflare credentials not configured'; exit 3
fi
base=https://api.cloudflare.com/client/v4
get(){ curl -sS --max-time 15 -w '\n%{http_code}' -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H 'Accept: application/json' "${base}${1}"; }
show(){
 local url="$1" label="$2" response http body
 response=$(get "$url") || { echo "BLOCKED_READ ${label}: network failure"; return 0; }
 http="${response##*$'\n'}"; body="${response%$'\n'*}"
 if [[ "$http" != "200" ]]; then echo "BLOCKED_READ ${label}: HTTP ${http}"; return 0; fi
 case "$label" in
  ROUTES) echo "$body" | jq -r '.result[]? | select(.pattern | contains("ball46.com")) | "ROUTE pattern="+.pattern+" script="+(.script // "none")';;
  WORKERS) echo "$body" | jq -r '.result[]? | select((.id // .name // "") | test("ball46";"i")) | "WORKER id="+(.id // .name)';;
  DEPLOYS) echo "$body" | jq -r '(.result.deployments // .deployments // .result // []) | if type=="array" then .[0:3][] | "DEPLOY id="+(.id // "n/a")+" created="+(.created_on // "n/a")+" version="+((.versions // [])[0].version_id // "n/a") else "DEPLOY: response format unexpected" end';;
  DOMAINS) echo "$body" | jq -r '.result[]? | select((.hostname // "") | contains("ball46.com")) | "DOMAIN host="+.hostname+" service="+(.service // .script // "none")';;
 esac
}
echo '=== Active ball46.com zone ==='
r=$(get '/zones?name=ball46.com&status=active')
http="${r##*$'\n'}"; body="${r%$'\n'*}"
if [[ "$http" != "200" ]]; then echo "BLOCKED: Zone HTTP $http"; exit 4; fi
zone=$(echo "$body" | jq -r '.result[]? | select(.name=="ball46.com") | .id' | head -1)
if [[ -z "$zone" ]]; then echo 'BLOCKED: No verified BALL46 zone'; exit 4; fi
echo 'ZONE confirmed active (zone ID not printed)'
show "/zones/${zone}/workers/routes" ROUTES
show "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts" WORKERS
show "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains" DOMAINS
show "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/ball46-production/deployments?per_page=3" DEPLOYS
echo 'AUDIT_ONLY: no Cloudflare changes made.'
