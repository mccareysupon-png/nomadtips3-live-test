# Ball46 UI Semantic Color Fix Playbook

Date: 2026-10-13

Use this workflow whenever a UI color refuses to change or keeps reverting.

1. Start from the actual active Production version.
2. Identify the rendered DOM element and its real selector.
3. Inspect loaded stylesheets in cascade order.
4. Find the semantic owner of the unwanted color, including CSS variables and any `!important` rules.
5. Remove or narrow the legacy owner rule first.
6. Only then apply the requested new color at the correct semantic layer.
7. Avoid stacking new `!important` overrides on top of old semantic rules.
8. Dry-run before deploy.
9. Verify the active Production version has not moved during the operation.
10. After deploy, verify the computed style in a browser, not only the source CSS.
11. Confirm unrelated assets, Worker source, settings, bindings and cron are unchanged.
12. If browser verification fails, rollback immediately and inspect the actual winning CSS rule before retrying.

Current Featured Signal example:
- Unwanted away-team owner: `[data-featured-away]{color:var(--b46-away)!important}`
- Legacy variable value: `--b46-away:#8a6a00`
- Correct approach: remove the specific Featured away-team legacy owner, then apply the requested away-team color in the semantic stylesheet.
