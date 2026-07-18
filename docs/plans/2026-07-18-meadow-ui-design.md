# MEADOW UI Design

- Date: 2026-07-18
- Status: Implemented and adversarially reviewed
- Scope: Social-app client presentation and multiplicity affordances
- Supersedes: No protocol or behavior documents

## Product Direction

MEADOW is a familiar Bluesky-style client with a restrained botanical identity.
The feed, navigation, post layout, and action controls must remain immediately
recognizable. The garden metaphor belongs in the palette, brand mark, language,
and compact multiplicity indicators rather than in literal flowerbeds or novel
content-card layouts.

The memorable interaction is a small bloom beside an action when the viewer has
liked or reposted the same subject more than once. It makes multiplicity visible
without replacing the standard icon, aggregate count, or removal controls.

## Visual System

- Replace the saturated blue accent with a deep moss green.
- Warm the light canvas and neutral surfaces slightly toward cream.
- Keep dark and dim themes structurally unchanged, with moss as their accent.
- Use a restrained MEADOW wordmark with a small five-petal mark in existing
  shell branding slots.
- Keep ordinary application typography everywhere except the wordmark.
- Rename the desktop trending heading to "What's growing" while preserving the
  existing topics, options, loading state, and analytics.

Flowers must occupy only a small fraction of the interface. Do not add soil,
pressed-flower cards, garden plots, decorative feed backgrounds, or new content
containers.

## Multiplicity Bloom

When the viewer owns two or more like or repost records for a post, show a small
inline bloom after the ordinary aggregate count. The bloom contains a compact
petal mark and the viewer-owned multiplier, such as `x3`.

The indicator must:

- Never appear for zero or one viewer-owned record.
- Preserve the aggregate count as the primary statistic.
- Use the action's active color and remain readable in light, dark, and dim
  themes.
- Be excluded from the accessibility tree because the parent control's label
  already describes the action; update that label to include the viewer-owned
  record count when multiplicity is present.
- Render on web, iOS, and Android without web-only style assumptions.
- Reuse the existing optimistic multiplicity state so rapid taps update the
  bloom without a second query or local state.

## Shell Integration

Desktop navigation gains a MEADOW wordmark in the normal brand position. The
account switcher remains available and moves to the bottom of the existing nav,
which matches the familiar desktop social-client hierarchy. Compact navigation
uses only the flower mark.

The home header uses the flower mark in the same dimensions and interaction slot
as the current logo. Mobile and desktop retain their existing reset/debug action,
feed-settings affordance, sticky behavior, and responsive layout.

No routes, tabs, labels, post-card geometry, moderation behavior, feed selection,
or composer behavior change in this work.

## Protected Behavior

- A normal like or repost press still adds exactly one native record.
- Long press and accessibility actions still expose removal controls.
- Aggregate counts continue to come from the multiplicity overlay with AppView
  fallback.
- Logged-out controls, blocked-user handling, quote behavior, haptics, analytics,
  and optimistic rollback remain unchanged.
- Existing responsive breakpoints and all three supported platforms remain
  supported.
- Moderation, missing-feed handling, configured-feed behavior, and account-scoped
  caching remain unchanged.

## Verification

- Unit-test bloom visibility and multiplier clamping.
- Test repeated-like and repeated-repost rendering through the post-control
  integration where practical.
- Run focused Jest tests, lint for changed files, and web/iOS/Android type checks.
- Inspect a web build at desktop and mobile widths.
- Run independent adversarial reviews for product restraint/accessibility and
  cross-platform correctness/regression risk.
