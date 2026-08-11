# Web UI Specification

This project has two web surfaces: a public read-only viewer and an owner-only settings page.

## 1. Public Viewer

Purpose: allow the owner or public viewers to see the current system state without being able to change settings.

Suggested route:

`/bot`

Display only:

- system online/offline
- last updated time
- active fixture count
- current watchlist / candidates
- current signal state
- match minute and score
- market/selection label when available
- current odds snapshot when available
- freshness/stale state
- recent signal history
- recent PAPER results
- short explanation/reason field

Public Viewer must be read-only.

It must never expose:

- API keys
- private owner settings
- secrets
- authentication tokens
- internal environment values
- admin actions

The public page reads normalized state from the shared backend/cache only. Opening or refreshing this page must not create new upstream football API requests.

## 2. Owner Settings

Purpose: private configuration page for the owner only.

Suggested route:

`/bot-owner`

Owner Settings may control the Live Scanner / PAPER workflow configuration, including:

- scanner enabled / disabled
- selected side
- minute range
- score-state rules
- goal-gap rules
- market selection
- odds min/max
- AH min/max
- live-stat thresholds
- momentum threshold
- confirmation rounds
- signal limit
- display preferences
- notification preferences

Every saved configuration must have a version number and updated timestamp so the scanner can detect changes safely.

## Access Control

Public Viewer: no login required unless the owner later decides to make it private.

Owner Settings: authenticated owner access only.

Owner controls must be enforced server-side. Hiding buttons in the browser is not sufficient security.

No secret should be embedded in frontend JavaScript.

## Shared Data Flow

API-Football -> Collector -> Shared Cache/D1 -> Condition Engine -> Stored State

Stored State -> Public Viewer
Stored State + Owner Config -> Owner Settings

The Public Viewer and Owner Settings should never call API-Football directly.

## Visual Design

Both pages must follow `UI_STYLE.md`:

- near-black dark gray background
- NOMADTIPS3 dark/green theme
- minimal borders
- use spacing and tonal hierarchy instead of boxed cards
- compact live-sports information layout
- subtle gradients only
- clean desktop and mobile presentation

The Owner Settings page should look like the same product as the Public Viewer, but controls may use a slightly lighter surface level to make editable areas obvious.

## Separation Rule

Public display and owner control are separate surfaces even when they read the same shared state.

A public user must never be able to mutate scanner configuration.

All future UI work under this project should preserve this separation unless the owner explicitly changes the requirement.
