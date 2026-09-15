# 3.41 UI Clone for 5USD

This branch is a clean UI-first clone of NOMAD Live 3.41.

Rules:
- Preserve 3.41 visual structure, layout, responsive behavior, settings surfaces, statistics surfaces, cards, expanded views, and UX.
- Do not reuse the 3.41 live engine, legacy provider adapters, polling loops, signal detection logic, price judge logic, or provider-specific workers.
- The clone must be able to render from mock/normalized data without a live API.
- 5DollarFootballAPI will be connected later through a dedicated adapter/data-core layer.
- Original 3.41 branches remain untouched.

Architecture target:

UI (3.41 clone) -> normalized view model -> 5USD adapter -> 5USD data core

No legacy 3.41 engine is allowed in the runtime path.
