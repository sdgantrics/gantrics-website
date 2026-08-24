# Gantrics Website

Static replacement for the Lovable-hosted gantrics.com. Repositions Gantrics as a construction media company (Construction Conversations, Construction Briefs, Reviewed as Noted, Tech to Watch) with sponsorship as the primary conversion and advisory as a quiet secondary page.

- `site/` is the deployable output. No build step.
- `site/index.html` home (shows, audience, sponsorship incl. value-adds, about, CTA)
- `site/advisory.html` fractional CMO / marketing advisor page
- `site/assets/site.css` brand system per the Gantrics Brand Kit (Deep Navy #212C4A, Signal Yellow #EEE40A, Space Grotesk / Inter / JetBrains Mono)
- Logos/favicon copied from `~/Documents/Professional/Gantrics/Gantrics Brand Kit/Logos`

Preview: launch.json config `gantrics-website` (port 8742), or `python3 -m http.server 8742 --directory site`.

Content rules (from the sponsor kit): no total follower counts, impressions stat only (15K/mo), no pricing, sponsor renewals anonymized, no em dashes, no buzzwords.
