# Ball46 Production Deployment Firewall

Effective 2026-10-06.

Protected targets: `ball46-production` and `nomadtips3-engine-343`.

Legacy Ball46 and Engine 3.43 deploy/restore rails are retired. A current Production change must lock the exact live source/version, use current assets only, stop on ambiguity, verify protected surfaces before and after deploy, and retain rollback to the exact pre-deploy version.

Forbidden production assembly sources include historical `KNOWN_GOOD_UI`, `OLD_WRAPPER_REF`, frozen historical commits, and old `nomad-live-343` overlays.

Legacy rails replaced by this firewall contain no Cloudflare credentials and terminate before any deploy command.
