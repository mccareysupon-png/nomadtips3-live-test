BALL46 Statistics Read Model V2 — ISOLATED TEST ONLY

Five phases:
1. Baseline audit: previous CI measured ~54MB uncompressed all-history payload; owner reports 17–20s live. Local CI times do not prove live speed.
2. Preserve Ledger, WIN/LOSS/PUSH/HALF_WIN/HALF_LOSS, weighted Win Rate, 1-unit profit, London cutoff, Bangkok settlement date, market totals, Corners FT.
3. Build immutable full-Ledger-derived read model by contentRevision; no request-time Ledger write.
4. Serve complete verified KPI and market counts, exact 30/90D precomputed charts, 50-item pages. A page of 50 cannot replace the full denominator.
5. Verify recorded Ledger, parity, immutable snapshot, revision, client race/cancellation, PC/mobile with current captured UI.

This is an in-memory reference/prototype, NOT a production storage service. Before deployment implement persistent chunk-index/materialization, integrate current UI and service routes, prove actual cold/warm mobile timing and rollback. Production deployment requires separate authorization. Keep source/Engine/formulas and newest Work UI unchanged; no Bot/Cloudflare rule changes.
