# Statistics live score mirror — implementation note

- FINAL remains settlement-owned when a record is settled.
- Pending rows may display a read-only 3.42 live score mirror as `H–A · minute'`.
- Match order: exact `matchId`, then exact normalized HOME+AWAY fallback only.
- Stale 3.42 matches are never mirrored.
- Feed errors restore pending FINAL cells to `—`.
- No settlement, P/L, WIN/LOSS/PUSH or entry data is mutated.
