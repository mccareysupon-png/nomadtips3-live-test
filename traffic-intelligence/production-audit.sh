#!/usr/bin/env bash
# Read-only Cloudflare production provenance audit. Never writes/deploys.
set -euo pipefail
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo 'BLOCKED: Cloudflare credentials are not configured'; exit 3
fi
base=https://api.cloudflare.com/client/v4
get(){ curl -fsS --retry 2 -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H 'Accept: application/json' "${base}${1}"; }
echo '=== Active ball46.com zone ==='
zone_json=$(get '/zones?name=ball46.com&status=active')
echo "$zone_json" | jq -r 'if .success != true then "BLOCKED: zone lookup denied" else (.result // [] | .[] | "ZONE id="+.id+" name="+.name+" status="+.status) end'
zone=$(echo "$zone_json" | jq -r '.result[]? | select(.name=="ball46.com") | .id' | head -1)
if [[ -z "$zone" ]]; then echo 'BLOCKED: No verified BALL46 zone'; exit 4; fi
echo '=== Cloudflare Worker routes for zone ==='
routes_json=$(get "/zones/${zone}/workers/routes")
echo "$routes_json" | jq -r 'if .success != true then "BLOCKED: routes lookup denied" else (.result // [] | .[] | select(.pattern | contains("ball46.com")) | "ROUTE pattern="+.pattern+" script="+(.script // "none")) end'
echo '=== Candidate Worker scripts ==='
workers_json=$(get "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts")
echo "$workers_json" | jq -r 'if .success != true then "BLOCKED: worker read denied" else (.result // [] | .[] | select((.id // .name // "") | test("ball46";"i")) | "WORKER id="+(.id // .name)) end'
echo 'AUDIT_ONLY: no Cloudflare changes were made.'
