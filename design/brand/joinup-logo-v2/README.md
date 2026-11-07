# JoinUp logo v2

Replaces `../joinup-logo-kit` (ring + dot) in both apps. Source: Yair's stacked lockup, split into
an icon (five people, four green, one orange) and a wordmark ("Join" green, "Up" orange).

- `joinup-icon-1024.png` – icon alone: app icons, favicons, notification icon, splash.
- `joinup-wordmark.png` – wordmark alone (always LTR).
- `joinup-lockup-horizontal*.png` – icon left of wordmark, for headers / auth / marketing.
  Don't use the stacked original as a header logo; it's too tall.

Colours: light `#036E54` / `#F04C18` (sampled from the artwork); dark `#10B981` / `#F2672A`
(same dark palette as the old kit, since the brand green is too dim on dark backgrounds).

`generate.py <icon.png> <wordmark.png> <repo-root>` cleans the JPG white fringe (each pixel is
repainted with a flat brand colour, alpha un-blended from white) and writes every derived asset
into `next_app/public` and `mobile_app/assets/images`. If you change the lockup aspect ratio,
update `aspect` in `next_app/src/components/brand/JoinUpLogo.tsx` and
`mobile_app/src/components/BrandLogo.tsx`.
