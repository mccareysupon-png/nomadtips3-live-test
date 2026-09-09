# NOMAD Shot Public Shield

Standalone public guard for the 5Dollar shot sidecar. It does not modify NOMAD 3.41 or 3.42 code.

Public behavior:
- `/snapshot` and `/status` are forwarded through a Cloudflare Service Binding.
- any `force` query parameter is rejected with HTTP 403.
- `/probe` is hidden and returns HTTP 404.
- public reads are limited to 30 requests per minute per client key.
- `/health` reports shield status only.

Important: this Worker is intentionally deployed as a separate endpoint. The existing 3.42 sidecar remains unchanged until an explicit routing decision is made.
