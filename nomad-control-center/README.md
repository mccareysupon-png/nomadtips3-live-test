# NOMAD CONTROL CENTER

Read-only executive operations dashboard.

## Safety contract
- Does not write Signal, Scout, odds, config, scheduler, D1, or engine state.
- Reads public health/status endpoints only.
- Website probes are reachability-only from the browser.
- Incident history is browser-local (`localStorage`) only.
- Components without live telemetry are explicitly shown as inventory/unlinked/legacy rather than healthy.

## Refresh
- Automatic dashboard refresh: 10 seconds.
- Visibility return triggers an immediate refresh.
- Per-request timeout: 8 seconds.

## Workload
Workload is shown only when a usable activity counter exists. It is normalized against an explicit planning/configured cap displayed on each card; otherwise workload is shown as `—`.

## Rollback
This feature is isolated to `nomad-control-center/`. Rollback is simply removal of this folder. No existing NOMAD Live or Production engine file was modified by the initial implementation.
