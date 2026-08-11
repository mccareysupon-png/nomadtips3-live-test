# UI Style Guide

## Visual direction

All pages in this project should use a clean, compact dark interface visually consistent with the main NOMADTIPS3 website.

Use a near-black dark gray page background, with slightly lighter gray content layers. Avoid pure black where possible.

The interface should be inspired by the compact information hierarchy of modern live sports dashboards such as bet365, but must not copy logos, proprietary assets, exact layouts, or brand identity.

## Core rules

- Use as few visible borders and divider lines as possible.
- Prefer spacing, tonal contrast, and subtle background transitions instead of boxes.
- Keep surfaces flat and clean.
- Avoid strong shadows, neon effects, glossy buttons, and decorative elements that do not improve readability.
- Use subtle gradients only to separate depth levels.
- Keep the layout compact enough for live information but visually calm.
- Match the NOMADTIPS3 dark/green visual family.

## Suggested color roles

- Page background: #151718 to #191B1C
- Primary surface: #1E2122
- Secondary surface: #242728
- Active surface: #2A2E2F
- Primary text: #F1F3F3
- Secondary text: #A8AFAD
- Muted text: #737B78
- Primary accent: reuse the existing NOMADTIPS3 green token
- Positive state: restrained green
- Waiting / warning state: restrained amber
- Error / negative state: restrained red

When existing NOMADTIPS3 production color tokens are available, reuse them instead of creating new ones.

## Layout hierarchy

Use tonal hierarchy in this order:

Page Background -> Section Surface -> Active Row -> Important State

Do not put every section inside a bordered card.

## Header

- Keep the header compact.
- Align NOMADTIPS3 identity with the main website.
- Avoid oversized titles.
- Small system state labels may appear beside the title.
- Keep top navigation visually consistent with the main site.

## Summary area

Use a compact horizontal summary on desktop and stacked responsive summary on mobile.

Do not create a separate outlined card for every metric. Use spacing or subtle surface differences instead.

## Data rows

Rows should be compact and easy to scan.

- Use consistent column alignment on desktop.
- Use two-line stacking on mobile instead of shrinking text too far.
- Important numbers should use tabular alignment where supported.
- Use text emphasis and restrained color for important states.
- Secondary technical details should be muted or collapsible.

## Status styling

Status must always include text and must never depend on color alone.

Use restrained accent colors rather than large colored blocks.

## Gradients

Allowed:
- near-black to dark-gray background transitions
- slightly lighter active-row transitions
- subtle green tint for positive or active states

Avoid:
- bright multi-color gradients
- neon gradients
- glossy effects
- large saturated color panels

## Controls

- Flat compact controls
- Primary control may use NOMADTIPS3 green
- Secondary controls use gray tonal surfaces
- Destructive controls use restrained red only when necessary
- Avoid excessive outlined buttons and oversized pill controls

## Typography

- Use a clean sans-serif system stack.
- Keep headings compact.
- Avoid excessive bold text.
- Use clear hierarchy through size, weight, spacing, and contrast.
- Align numeric data consistently.

## Responsive rules

Desktop:
- prioritize information density
- use aligned columns
- keep rows compact

Mobile:
- preserve the most important information first
- allow secondary details to wrap below
- avoid horizontal scrolling for standard rows
- align top and bottom navigation with the main NOMADTIPS3 visual language

## Accessibility

- Maintain readable contrast.
- Do not rely on color alone for meaning.
- Keep touch targets practical on mobile.
- Avoid excessively small body text.

## Project rule

All future HTML/CSS/UI created under this project should follow this style guide unless the Owner explicitly overrides it.
