# QUEST iOS App — Product Requirements Document

**Version:** 0.1.0
**Last Updated:** March 2026
**Status:** Draft — MVP scoping

---

## Overview

Native Swift iOS app for QUEST — the social challenge protocol on Solana. The app delivers the core loop (Post → Claim → Prove → Collect) with native camera integration, wallet management, and a feed-first experience optimized for mobile.

**Target:** iOS 17+, iPhone only (iPad later)
**Language:** Swift, SwiftUI
**Auth:** Privy iOS SDK (embedded wallets)
**Backend:** Existing Cloudflare Workers API (`/api/*`)

---

## Why Native

- Camera is the core interaction — native AVFoundation gives us full control over recording, frame extraction, and compression
- Push notifications for quest lifecycle events (claimed, verified, approved)
- Smoother scrolling and video playback in the feed
- Haptic feedback on key moments (claim, approve, reward received)
- Wallet interactions feel more trustworthy in a native context
- App Store distribution for mainstream users who won't visit a website

---

## Design Direction

### Visual Identity

Based on initial prototypes, the iOS app uses a **fantasy/RPG-inspired aesthetic** distinct from the web app's dark minimal look:

- **Illustrated onboarding** — rich medieval/fantasy artwork for each step (Create Wallet, Set Up Profile, Walkthrough, Complete Quest)
- **Earth tone palette** — warm greens, deep browns, parchment textures alongside the core brand colors
- **Quest branding** — serif-style "Quest" wordmark with a subtle medieval feel
- Navigation uses clean, modern iOS patterns — the fantasy layer lives in illustrations and accents, not in the chrome

### Core Brand Colors (carried from web)

| Token | Value | Usage |
|-------|-------|-------|
| Quest Purple | `#7B5CFF` | Primary actions, links, active states |
| Quest Gold | `#FFD700` | Rewards, earnings, success highlights |
| Background | `#0A0A0A` | App background (dark mode only) |
| White | `#FFFFFF` | Primary text |
| Success | `#22C55E` | Approved, completed |
| Error | `#EF4444` | Rejected, failed |
| Warning | `#F59E0B` | Pending review, expiring |

### Typography

| Role | Font | Notes |
|------|------|-------|
| Display / Headlines | SF Pro Display Bold | System font, consistent with iOS |
| Body / UI | SF Pro Text Regular/Medium | Clean readability |
| Stats / Numbers | SF Pro Rounded Bold | Achievement energy on reward amounts |

### iOS-Specific Patterns

- Dark mode only (matches web, works with OLED)
- Native blur materials for overlays (`UIBlurEffect.Style.dark`)
- SF Symbols for icons (replacing Lucide from web)
- Standard iOS navigation (tab bar, navigation stack, sheets)
- Haptics: light impact on tap, medium on claim, success notification on reward
- Pull-to-refresh on all feeds
- Swipe actions on quest cards (swipe to claim)

---

## Screens & Flows

### 1. Onboarding (First Launch Only)

4-screen illustrated walkthrough based on initial prototypes:

| Screen | Title | Content |
|--------|-------|---------|
| 1 | Create Wallet | Explains wallet creation, escrow safety. Illustrated: adventurer preparing for journey. |
| 2 | Set Up Profile | Identity setup, trust building. Illustrated: hooded figure establishing presence. |
| 3 | Walkthrough | Core loop explanation (create/claim/prove/collect). Illustrated: figure studying a quest map. |
| 4 | Complete Quest | How proof + verification works. Illustrated: adventurer claiming victory. |

**Behavior:**
- Horizontal page swipe with dot indicators
- "Skip" button top-right on all screens
- Final screen CTA: "Start Questing" → triggers Privy auth
- Only shown once; subsequent launches go straight to feed

### 2. Auth (Privy)

**Trigger:** First launch after onboarding, or any auth-gated action while logged out.

**Methods (via Privy iOS SDK):**
- Email (magic link / OTP)
- Apple Sign-In
- Google Sign-In
- Connect existing Solana wallet (Phantom, Solflare)

**Behavior:**
- Privy handles the full auth modal natively
- On first auth → embedded Solana wallet auto-created
- Users with external wallets connect directly
- After auth → redirect to intended action (no re-navigation)
- JWT stored securely in Keychain

### 3. Tab Bar (Main Navigation)

4 tabs, always visible:

| Tab | Icon (SF Symbol) | Screen |
|-----|-------------------|--------|
| Home | `house.fill` | Quest Feed |
| Discover | `magnifyingglass` | Search / Filter quests |
| Post | `plus.circle.fill` | Create Quest (prominent, center-ish) |
| Profile | `person.fill` | User profile + history |

### 4. Home / Quest Feed

**Purpose:** Browse available quests, see activity.

**Layout:**
- Vertical scrolling feed of quest cards
- Segmented control at top: "Open Quests" (default) | "My Quests"
- Pull-to-refresh
- Infinite scroll with pagination (`GET /api/feed`, `GET /api/feed/mine`)

**Quest Card Anatomy:**
```
┌─────────────────────────────────────┐
│  [Avatar] @username                 │
│           Quest Giver     [💰 50 QUEST] │
│                                     │
│  "Do 50 pushups in under 2 minutes" │
│                                     │
│  🕐 23h remaining   👥 0/3 claimed  │
│                                     │
│  [ ━━━━━━ Claim Quest ━━━━━━━━ ]   │
└─────────────────────────────────────┘
```

**Card States:**
- `active` — purple CTA, full opacity
- `claimed` — muted "Quest Claimed", no action
- `completed` — green badge, proof video thumbnail
- `expired` — dimmed, "Expired" label
- `cancelled` — dimmed, strikethrough reward

**Interactions:**
- Tap card → push to Quest Detail
- Tap "Claim Quest" → claim confirmation sheet
- Swipe right on card → quick claim
- Long press → share sheet

**Content States:**
- Loading: 3 skeleton cards with shimmer
- Empty (Open): "No quests yet. Be the first to post one!" + CTA
- Empty (My): "You haven't posted or claimed any quests yet."
- Error: "Couldn't load quests. Pull to refresh."

### 5. Quest Detail

**Purpose:** Full quest view. Hub for claiming, proof, and review.

**Layout (scroll view):**
1. **Header** — quest description (large, bold), creator avatar + username
2. **Reward badge** — prominent gold pill with token amount and icon
3. **Status bar** — current state with progress dots
4. **Action section** — context-dependent CTA (see table below)
5. **Proof section** — native video player if proof exists, verification status
6. **Timeline** — chronological event list (created, claimed, submitted, verified)

**Context-Dependent Actions:**

| Viewer | Quest State | Action |
|--------|-------------|--------|
| Anyone | active | "Claim Quest" button |
| Claimer | claimed (no proof) | "Record Proof" + "Abandon" |
| Claimer | submitted | "Waiting for verification..." spinner |
| Creator | submitted (escalated) | "Approve" / "Reject" buttons |
| Anyone | completed | Play proof video |

### 6. Post Quest (Multi-Step)

**Purpose:** Create a new quest with funded escrow.

**Flow (native form sheets):**

**Step 1 — Describe**
- Text input, 280 char max, live counter
- Placeholder: "Dare someone to..."
- Blocklist check before proceeding

**Step 2 — Set Reward**
- Amount input (numeric keyboard)
- Token picker: $QUEST / SOL / USDC
- Show minimum reward hint
- Show approximate USD value
- Balance check against connected wallet

**Step 3 — Choose Type**
- Segmented control: Direct / Open
- Direct → user search field (search by username or wallet)
- Open → max claimers stepper (1-100, default 1)

**Step 4 — Options**
- Time limit toggle + hour picker (optional)
- Summary preview showing: description, reward, type, gas estimate

**Step 5 — Confirm**
- Full summary card
- Cost breakdown: reward + estimated gas
- "Post Quest" CTA → triggers wallet transaction (escrow lock)
- Loading state during tx confirmation
- Success → navigate to Quest Detail with toast "Your quest is live!"

**Validation:**
- Description: 1-280 chars, passes blocklist
- Reward: >= minimum (1 QUEST / 0.001 SOL)
- Direct: target must exist, cannot be self
- Wallet: sufficient balance for reward + gas

### 7. Record Proof

**Purpose:** Capture video evidence of quest completion.

**Layout:**
- Full-screen camera (AVCaptureSession)
- Quest description overlay at top (translucent bar so claimer remembers the task)
- Large record button, center bottom
- Timer: counts up from 0:00
- Front/back camera toggle
- Flash toggle

**Recording Rules:**
- Minimum: 15 seconds (stop button appears after 15s)
- Maximum: 60 seconds (auto-stops)
- Record button shows elapsed time ring

**Post-Recording:**
- Preview playback (AVPlayer)
- "Submit Proof" / "Retake" buttons
- On submit:
  1. Extract frames client-side (1fps via AVAssetImageGenerator)
  2. Upload video to R2 (`POST /api/media/upload`)
  3. Upload frames to R2 (`POST /api/media/upload-frame`)
  4. Submit proof (`POST /api/claims/:id/proof`)
  5. Show upload progress bar
  6. Success → navigate to Quest Detail with "submitted" status

### 8. Creator Review (Escalated)

**Purpose:** When AI verification is uncertain, creator reviews the proof.

**Layout:**
- Quest description reminder
- Auto-playing proof video (native player)
- AI analysis summary: confidence %, reasoning, detected actions
- Two CTAs: "Approve" (green) / "Reject" (red)
- Countdown: "Auto-approves in Xh"
- Warning: "If you don't respond, this will auto-approve."

**Interactions:**
- Approve → `POST /api/claims/:id/approve` → oracle signs on-chain
- Reject → `POST /api/claims/:id/reject` → oracle signs on-chain
- Haptic feedback on action

### 9. Profile

**Purpose:** User identity, stats, and quest history.

**Layout:**
- Avatar (tap to edit, photo picker) + username (tap to edit)
- Wallet address (truncated, tap to copy)
- Stats row: Completed | Posted | Active Claims (gold numbers)
- Segmented tabs: Posted | Completed | Claims
- Each tab is a filtered quest card list

### 10. Discover / Search

**Purpose:** Find specific quests or filter the feed.

**Layout:**
- Search bar at top
- Filter chips: reward range, quest type, status, token
- Results as quest card list
- Recent searches (local storage)

---

## API Integration

All endpoints hit the existing Cloudflare Workers API. The iOS app is a client — no backend changes needed.

### Networking Layer

- `URLSession`-based API client
- Base URL from config (`QUEST_API_URL`)
- Auth: `Authorization: Bearer <privy-jwt>` header on all authenticated requests
- JWT refresh handled by Privy SDK
- Retry logic: 1 retry on 5xx, exponential backoff
- Offline handling: show cached data with "offline" banner

### Endpoint Mapping

| Screen | Endpoints Used |
|--------|---------------|
| Auth | `POST /api/auth/verify` |
| Feed | `GET /api/feed`, `GET /api/feed/mine` |
| Quest Detail | `GET /api/quests/:id` |
| Post Quest | `POST /api/quests` |
| Claim | `POST /api/quests/:id/claim` |
| Record Proof | `POST /api/media/upload`, `POST /api/media/upload-frame`, `POST /api/claims/:id/proof` |
| Creator Review | `POST /api/claims/:id/approve`, `POST /api/claims/:id/reject` |
| Abandon | `DELETE /api/claims/:id` |
| Profile | `GET /api/users/me`, `PATCH /api/users/me` |
| Other User | `GET /api/users/:pubkey` |

### Data Models

Reuse the same data models from the main PRD (User, Quest, Claim, Proof). Swift Codable structs mapping 1:1 with API JSON responses.

---

## Wallet Integration

### Privy iOS SDK

- Handles wallet creation, key management, and transaction signing
- Embedded wallets for users who don't have crypto wallets
- External wallet connection for Phantom / Solflare users
- Transaction signing for: create quest (escrow), claim quest (stake), cancel, abandon

### On-Chain Interactions (User-Signed)

| Action | What Happens |
|--------|-------------|
| Post Quest | User signs `create_quest` → funds locked in escrow PDA |
| Claim Quest | User signs `claim_quest` → stake deposited |
| Cancel Quest | User signs `cancel_quest` → escrow returned (before claimed) |
| Abandon Claim | User signs `abandon_claim` → stake forfeited |
| Submit Proof | User signs `submit_proof` → proof hash stored on-chain |

### Oracle-Signed (Backend)
- `approve_completion`, `reject_completion`, `expire_claim`, `auto_approve`
- These happen server-side — the iOS app just polls for status updates

---

## Push Notifications (APNs)

### Events to Notify

| Event | Notification |
|-------|-------------|
| Quest claimed | "Someone claimed your quest!" |
| Proof submitted | "Proof submitted for your review" |
| Quest approved | "Your proof was approved! X QUEST sent!" |
| Quest rejected | "Your proof was rejected. Reason: ..." |
| Review needed | "Creator review needed — auto-approves in 12h" |
| Claim expiring | "Your claim expires in 2h — submit proof now!" |
| Reward received | "You earned X QUEST! Check your wallet." |

### Implementation
- Register for APNs on first auth
- Send device token to API (new endpoint: `POST /api/users/me/device-token`)
- Backend sends push via APNs when lifecycle events occur
- Deep links: tap notification → navigate to relevant Quest Detail

---

## Video Pipeline (Client-Side)

Since the backend can't run ffmpeg (Cloudflare Workers), frame extraction happens on-device:

1. Record video via AVCaptureSession (H.264, 720p, 30fps)
2. On submit, compress video (target: < 30MB)
3. Extract frames at 1fps using `AVAssetImageGenerator`
4. Convert frames to JPEG (quality: 0.7)
5. Upload video → R2
6. Upload frames → R2 (`frames/{claimId}/frame_XXX.jpg`)
7. Call `POST /api/claims/:id/proof` with video URL + frame URLs
8. Background upload support via `URLSession` background configuration

### Compression Settings
- Resolution: 720p max (1280x720)
- Codec: H.264
- Bitrate: 2 Mbps target
- Audio: AAC, 128 kbps
- Max file size: ~30MB for 60s

---

## Offline & Error Handling

| Scenario | Behavior |
|----------|----------|
| No network | Show cached feed, disable actions, "Offline" banner |
| Upload interrupted | Resume upload when connection restores (background URLSession) |
| API 500 | Retry once, then show error with "Try Again" button |
| Wallet tx failed | Show error with tx details, "Retry" button |
| JWT expired | Privy SDK auto-refreshes; if fails, prompt re-auth |
| Rate limited | Show "Too many requests. Try again in X seconds." |
| Insufficient funds | Disable CTA, show "Insufficient balance" label |

---

## Security

- Privy JWT stored in iOS Keychain (not UserDefaults)
- No private keys stored on device (Privy handles key management)
- Certificate pinning for API requests
- Biometric auth option for transaction signing (Face ID / Touch ID)
- No sensitive data in logs or crash reports
- App Transport Security enforced (HTTPS only)

---

## Analytics (MVP)

Track key funnel events:

| Event | Properties |
|-------|-----------|
| `app_opened` | source (notification, organic) |
| `onboarding_completed` | screens_viewed |
| `auth_completed` | method (email, apple, google, wallet) |
| `quest_viewed` | quest_id, source (feed, notification, deep_link) |
| `quest_created` | reward_amount, token, type |
| `quest_claimed` | quest_id, reward_amount |
| `proof_recorded` | duration_seconds |
| `proof_submitted` | quest_id, upload_time_seconds |
| `quest_completed` | quest_id, reward_amount, verification_method |

---

## MVP Scope

### In MVP

- Onboarding flow (4 illustrated screens)
- Privy auth (email, Apple, Google, wallet connect)
- Quest feed (Open Quests + My Quests)
- Quest detail view
- Post quest (full multi-step flow)
- Claim quest with stake
- Record + submit proof (native camera)
- Client-side frame extraction
- Creator review (approve/reject escalated claims)
- Profile (stats, history, edit)
- Push notifications for quest lifecycle
- Basic search / filter

### NOT in MVP

- iPad support
- Landscape orientation
- Social features (follow, comments, likes)
- In-app token swap
- Quest sharing to Instagram / TikTok (just share sheet)
- Offline quest drafts
- Video editing / filters
- Leaderboards
- Guild quests / Chain quests
- Arweave archival
- Widget / Live Activities
- Apple Watch companion

---

## App Store

### Metadata
- **Name:** QUEST
- **Subtitle:** Side Quests. Real Rewards.
- **Category:** Entertainment (primary), Social Networking (secondary)
- **Age Rating:** 17+ (user-generated content, in-app purchases via crypto)

### Review Considerations
- Crypto/wallet functionality requires clear disclosure
- User-generated video content requires content moderation documentation
- In-app currency (tokens) may trigger App Store payment policy review — need to clarify that tokens are blockchain-based, not IAP
- Content moderation policy and reporting mechanism required

---

## Open Questions

1. **Design system finalization** — The prototype illustrations are a strong starting point but need final art for all onboarding screens. Who handles illustration?
2. **Privy iOS SDK maturity** — Need to verify Privy's iOS SDK supports all required auth methods and embedded wallet signing. Fallback plan if gaps exist?
3. **App Store crypto policy** — Apple's evolving stance on crypto apps. Need legal review of NFT/token guidelines before submission.
4. **Push notification backend** — Current API doesn't have device token storage or APNs integration. This is a new backend requirement.
5. **TestFlight beta group** — Who gets early access? How many testers before public launch?

---

*This document is a draft. Prototypes in `product/screens.png` inform design direction but are not final.*
