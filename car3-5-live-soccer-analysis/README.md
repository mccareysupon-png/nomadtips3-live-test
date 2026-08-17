# CAR 3.5 — Live Soccer Analysis

Public display name: `nomadtips3 live`

CAR 3.5 is a new read-only presentation layer for live football analysis. It does not replace or mutate CAR 3.1 logic, settlement, history or worker state.

## Product structure

1. **Live soccer analysis** — signal list + responsive Match center.
2. **Statistics** — long-range Win/Loss/Draw history, Winrate, Average odds, charts and 25-row pagination.
3. **Live alerts** — $20 alert plan plus $200 Custom live engine pre-order.

## Responsive contract

- Mobile-first, one codebase.
- Mobile: signal list -> tap -> full-screen Match center.
- Tablet: responsive single/split layout based on available width.
- Desktop: sticky signal rail on the left and Match center on the right.
- Fixed top brand bar and fixed bottom navigation with safe-area padding.

## Visual system

- Font: Arial; logo uses Arial Bold/Black and lowercase `nomadtips3 live`.
- Body copy uses sentence case.
- Background: charcoal; cards use soft depth and minimal borders.
- Brand accent: yellow; Live/Win: green; Loss: red; Draw: gray.

## Live data

Phase A reads the existing CAR 3.1 normalized Goaloo live feed in read-only mode. The adapter accepts the CAR 3.1 normalized contract and leaves a second engine slot for CAR 3.3 once its accessible feed/ref is confirmed.

The Match center renders event-driven pitch animation. It never claims exact tracking coordinates unless the upstream source actually supplies coordinates. Without coordinates, Goaloo events are mapped to approximate field zones (attack, dangerous attack, corner, goal kick, goal, card, substitution) and are labelled as an event visualization.

## Commercial integration

- Plan 1: `$20` Live alerts. Intended flow: Stripe checkout -> server-side webhook verification -> LINE connection -> alert entitlement.
- Plan 2: `$200` pre-order. Manual owner provisioning; account expiry is server-side and defaults to 30 days when implemented.

No Stripe key, LINE secret or customer credential is stored in this front-end scaffold.
