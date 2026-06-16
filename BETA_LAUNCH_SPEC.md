# Mobile-App Beta Launch Spec

What to add to the Expo / React Native app to match the legal posture
in `docs/legal/` and the backend endpoint in `backend/main_simple_nlp.py`.

This document is the implementation spec; apply it in the relevant
worktree (`integra-markets-2`'s `app/` tree, or the dedicated mobile
worktree, depending on which is most active).

## Constants

Pin these in a single shared module — for example
`app/constants/legal.ts`:

```ts
export const LEGAL = {
  termsVersion: "1.0-beta",
  privacyVersion: "1.0-beta",
  termsUrl: "https://integramarkets.app/legal/terms",
  privacyUrl: "https://integramarkets.app/legal/privacy",
  ccpaUrl: "https://integramarkets.app/legal/ccpa",
  contactEmail: "contact@integramarkets.app",
} as const;
```

When the versions in `docs/legal/*.mdx` change, bump these. Bumping
forces a re-acknowledgement at next launch (logic below).

## What to add

### 1. Beta Disclaimer Modal — first-launch + on version change

`app/components/BetaDisclaimerModal.tsx` — a full-screen modal that
shows when the user has not yet acknowledged the current
`(termsVersion, privacyVersion)` pair.

Behaviour:

- Renders on first launch after sign-in, before any other screen
- Renders again if either `termsVersion` or `privacyVersion` changes
  vs. the value stored locally in AsyncStorage
- Cannot be dismissed by tapping outside; the user must either tap
  **I agree** (proceeds, records acknowledgement, stores versions in
  AsyncStorage and calls the backend) or **Cancel** (signs the user
  out)
- Links to the Terms and Privacy Policy open the URLs in an in-app
  browser (`expo-web-browser`)

Copy:

> **Welcome to Integra Markets — Beta**
>
> Integra is in active development. The sentiment labels we show are
> informational analyses of public news, not financial advice. They
> are right about 70% of the time on a standard finance benchmark —
> useful for reading the news faster, not a substitute for your own
> research or a qualified professional.
>
> By tapping **I agree**, you accept our [Beta Terms of Service] and
> our [Privacy Policy]. You can review them anytime in Profile.
>
> Available in the United States and Canada only.
>
> [Cancel]        [I agree]

### 2. Beta acknowledgement persistence

Wire **I agree** to two things:

```ts
// 1. Store locally — guards future launches from re-showing the modal
await AsyncStorage.setItem("legal_terms_version", LEGAL.termsVersion);
await AsyncStorage.setItem("legal_privacy_version", LEGAL.privacyVersion);
await AsyncStorage.setItem("legal_acknowledged_at", new Date().toISOString());

// 2. Record server-side — survives device loss, gives us audit proof
await fetch(`${API_URL}/api/account/beta-acknowledgment`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_id: session.user.id,
    terms_version: LEGAL.termsVersion,
    privacy_version: LEGAL.privacyVersion,
    device_identifier: await getHashedDeviceId(),
    locale: Localization.locale, // from expo-localization
  }),
});
```

If the server call fails (e.g. offline), do **not** block the user.
Store a `pending_acknowledgment` flag in AsyncStorage and retry on the
next foregrounded launch.

### 3. Profile → Privacy section

Add a `PrivacySection` group inside `ProfileScreen.js`:

```
Privacy
├── About the sentiment engine          → opens AccuracyDisclosureSheet
├── Improve the model (toggle, OFF)     → controls model-training opt-in
├── Download my data                    → calls GET /api/account/export
├── Beta Terms of Service              → opens LEGAL.termsUrl
├── Privacy Policy                      → opens LEGAL.privacyUrl
└── Do Not Sell or Share (CCPA)         → opens LEGAL.ccpaUrl
```

**Critical:** the "Improve the model" toggle's initial value must be
**`false`**. This is the load-bearing legal commitment. Hard-code
the default; do not read from a server-side setting that might be true
elsewhere:

```ts
const [improveModelEnabled, setImproveModelEnabled] = useState(false);
```

When the user toggles it on, send `true` to the backend (separate
endpoint, not the beta acknowledgement endpoint). When they toggle it
off, send `false` and stop including their votes in future training
runs. Do not retroactively delete past contributions; the privacy
policy is honest about this.

### 4. Sentiment badge accuracy disclosure

Wherever the app renders a `BULLISH` / `BEARISH` / `NEUTRAL` chip (look
in `app/components/NewsCard.tsx`), add a small `ⓘ` info icon next to
the chip. Tapping it opens `AccuracyDisclosureSheet`:

```
About these labels

Integra uses an AI sentiment engine trained on financial language.
It's right about 70% of the time on a standard finance benchmark —
about as often as two human analysts agree on the same headline.

The engine improves continuously from observed market moves. Your
explicit feedback can also improve it, if you turn that on in
Profile → Privacy → Improve the model.

Sentiment labels are informational only and not financial advice.

[Read the methodology]    [Close]
```

Where "Read the methodology" opens the docs portal's accuracy page
(future work — placeholder for now).

### 5. Geo-gate at sign-up

Block account creation from non-US / non-Canada IPs at the backend
sign-up endpoint. The mobile app does not need to enforce this
itself — the backend rejects the sign-up and the app displays:

> **Not available in your region**
>
> Integra Markets is currently available in the United States and
> Canada only. Follow us at integramarkets.app for international
> availability updates.

(Backend implementation deferred to a separate PR — see "Open work"
below.)

### 6. Footer disclaimer on every screen

Add a `<BetaFooter />` component to the bottom of `MainApp.js` or
each top-level screen:

```
Integra Markets · Beta · Not financial advice
```

Style: small (12pt), muted (`#6B7280`), centred, with a tappable area
that opens the disclaimer modal in a non-blocking way (user can
dismiss).

## Open work (separate follow-up PRs)

1. **Backend geo-gate** at `/auth/signup` using `ipinfo.io` or
   `MaxMind GeoIP2` lookup. Returns `403 Forbidden` for non-US/CA
   sign-ups with a `X-Integra-Region-Blocked: true` header.
2. **Right to Access / Download endpoint** at `GET /api/account/export`
   that returns a ZIP of the user's data per CCPA Right to Know.
3. **Model-training opt-in endpoint** at `PATCH
   /api/account/model-training` storing the setting in the user's
   profile.
4. **App Store metadata** updates:
   - Set availability to United States + Canada in App Store Connect
   - Update "What's New" copy to mention beta status
   - Privacy nutrition labels matching the disclosures in this policy
5. **Insurance**: Get quotes from Hiscox, Vouch, and Embroker for
   cyber + E&O coverage with an "AI training" rider. Activate when
   first dollar is taken.
6. **Lawyer pass**: Send `docs/legal/*.mdx` to a finance-SaaS
   specialist for a one-hour review before public launch. Memo from
   internal review is attached for context (see commit message of the
   PR that introduces these docs).

## Versioning protocol

When you change any text in `docs/legal/*.mdx` that affects user
rights or obligations, you must:

1. Bump the version constants in `app/constants/legal.ts`
2. Bump `INTEGRA_POLICY_VERSION` in `backend/main_simple_nlp.py`
3. Update the version line at the bottom of the affected MDX file
4. Update "Next scheduled review" in the MDX file if applicable
5. Ship via a PR titled `legal(...): bump <doc> to <version>`

Text changes that are purely typographical (typos, formatting, link
fixes, clarification of wording without changing meaning) do not need
a version bump.

## Quick contact lookup

All correspondence: **contact@integramarkets.app**

This single inbox handles privacy requests, security incident reports,
publisher takedown requests, support, and any other correspondence
referenced anywhere in `docs/legal/`. Filter and route internally
based on subject line patterns.
