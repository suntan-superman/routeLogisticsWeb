# Route Logistics Mobile App

React Native mobile application for field service technicians.

## Quick Start

```bash
# Install dependencies
npm ci

# Start development server
npm start

# Run on specific platform
npm run android
npm run ios
```

## Features

- ✅ User authentication and profile management
- ✅ Customer management (CRUD operations)
- ✅ Job scheduling and tracking
- ✅ Estimate creation with templates
- ✅ Multi-language support (English/Spanish)
- ✅ Calendar view for job management
- ✅ Offline-first data synchronization

## Technology Stack

- **Framework**: React Native with Expo SDK 54
- **Backend**: Firebase (Auth, Firestore, Storage)
- **State Management**: React Context API
- **Navigation**: React Navigation v7
- **Storage**: AsyncStorage + Expo SecureStore

## Project Structure

```
routeLogisticsMobile/
├── App.js                 # Main application component
├── constants/             # App constants and configuration
├── contexts/              # React Context providers
├── screens/               # Application screens
├── services/              # Firebase service wrappers
└── assets/                # Images and static assets
```

## Development

### Prerequisites
- Node.js 22 LTS and npm (use the committed `package-lock.json`)
- iOS Simulator (macOS) or Android Emulator
- For native iOS builds: Xcode, its command-line tools, and CocoaPods

### Firebase configuration

The app uses the Firebase JavaScript SDK, not React Native Firebase.
`constants/firebase.js` initializes the app, Auth with AsyncStorage persistence,
Firestore, Storage, and Functions. It and `app.config.js` use the same public
client configuration from `constants/firebaseConfig.js`.

The checked-in client defaults were verified against the existing Firebase
registration. A fresh Mac checkout needs **no Firebase environment variables**:

| Setting | Existing value |
| --- | --- |
| Firebase project | `mi-factotum-field-service` |
| Auth domain | `mi-factotum-field-service.firebaseapp.com` |
| Storage bucket | `mi-factotum-field-service.firebasestorage.app` |
| Messaging sender ID | `1030013411579` |
| Firebase JS app ID | `1:1030013411579:web:37cdb1ce1e57c1e75c505e` |
| Measurement ID | `G-VS61WKSG39` (Analytics is not initialized) |
| iOS bundle identifier | `com.workside.routelogistics` |
| EAS project ID | `a6b5d885-dd99-4435-bef0-b7ffe09a2890` |

The existing Firebase-generated public client API key is retained. There is no
new key to obtain. `GoogleService-Info.plist` is not required by this JS SDK
integration. Do not add Firebase Admin credentials, a service-account JSON file,
or backend `.env` files to the mobile app.

Optional overrides are listed in `.env.example`. Expo reads `EXPO_PUBLIC_FIREBASE_*`
from the mobile folder's environment files or build environment and embeds them
in the native JavaScript bundle. They are public configuration, not secrets.
`app.config.js` exposes the same resolved values in `extra.firebase` for inspection.
The runtime uses the shared resolver directly.

If the Mac already has a `.env`, `.env.local`, `.env.production`, or shell/EAS
environment overrides, remove stale `YOUR_*` Firebase values so the defaults can
apply, or replace them with this project's registered web-app client values.
Do not replace unrelated settings. The resolver rejects placeholders and
cross-project identifiers before building. Restart Metro or rebuild the app
after changing environment variables; a previously built app does not pick up
new values automatically.

### First native iOS build on the Mac mini

In the existing repository checkout (the folder may be named `routeLogisticsWeb`):

```bash
# Run from the repository root
git switch main
git pull --ff-only origin main
cd routeLogisticsMobile

# Use Node.js 22 LTS; do not mix Yarn with the npm lockfile
node --version
npm ci
npm test
npx expo install --check
npx expo-doctor
npx expo config --type public

# Confirm the Firebase project, bundle identifier, and EAS ID above.
# Build the production iOS JavaScript bundle before generating the native project.
npx expo export --platform ios --max-workers 2

# Generate/update the native iOS project and install its CocoaPods dependencies.
npx expo prebuild --platform ios
open ios/*.xcworkspace
```

If Xcode or CocoaPods is missing, install it first. In Xcode, select the existing
Apple development team under Signing & Capabilities, retain
`com.workside.routelogistics`, and select a simulator or connected device to run.
For distribution, select a generic iOS device and use **Product > Archive**.
An Apple signing identity and provisioning profile are needed for device and
distribution builds; Firebase server credentials are not.

The command above intentionally omits `--clean`. Preserve any existing native
customizations on the Mac before regenerating the native project. Xcode's build
phase bundles the JS client configuration; a separate Firebase native plist
does not configure this app.

The existing EAS configuration is also retained if a cloud build is preferred:

```bash
npx eas-cli build --platform ios --profile production
```

Do not run `eas init` or create/link another EAS project. Any optional EAS
environment overrides must use the same Firebase project as the defaults.

### Company access, sign-in, and appearance

Email verification and company invitation acceptance are separate steps. A
verified account with a pending invitation sees **Join your company**, with no
personal-business management fallback. Open the **Join Acme Pest Control on
Route Logistics** invitation email and press **Accept invitation** on the web,
or paste the complete invitation link into the mobile acceptance screen and
press **Accept invitation** there. The app never accepts invitations automatically.
If acceptance happens in the browser, return to the app and refresh.

`syncClaims` supplies a server-resolved workspace status alongside signed Firebase
claims. Pending, unavailable, and unresolved workspaces cannot open operational
screens. Active technicians see their assigned schedule and work completion/photo
controls. Customer, estimate, and scheduling management require an owner, admin,
or manager role; company settings remain owner-only. Firestore rules and existing
Cloud Functions enforce company and role permissions independently of the UI.

Home and Settings read business information and the service catalog from the
active company document. Legacy service objects are displayed by their `name`;
their accounting metadata is preserved. Staff personal profiles do not replace
the shared company catalog. Company business edits open the existing web screen
for the owner; technicians can edit their personal contact/preferences only.

Login supports passwords and six-digit email codes through the existing
`rlRequestStaffOTP` / `rlVerifyStaffOTP` functions. Codes expire after ten minutes,
are single-use, and retain the server's retry limits. OTP does not verify an
unverified email, accept an invitation, or grant a role. Passwords, codes, and
invitation links are never saved by these screens. Remembered email and the
System/Light/Dark appearance preference are stored locally with AsyncStorage.

The Home, Settings, and Login screens use rounded glass cards, gradients, and
theme colors inspired by the Merxus mobile components. iOS uses native blur with
an opaque fallback when Reduce Transparency is enabled; Android uses translucent
surfaces. The theme also applies to work status, job dialogs, and verification.

**Rebuild the native app after pulling this update.** The new Expo blur, gradient,
and system-UI modules require `npm ci`, `npx expo prebuild --platform ios`, and a
new Xcode build. A JavaScript reload of the older installed app is insufficient.

Validation on November 13, 2026 used unit/screen tests, Auth/Firestore/Functions
emulators, Expo Doctor, and iOS/Android bundle exports. Native rendering, signing,
and device testing still run on the Mac. The production audit found Acme's 15
services and all 507 customers already present; Luis's invitation was pending.
The audit and implementation do not accept invitations or alter customer records.

## Documentation

- [Mobile App Documentation](../docs/mobile-app.md)
- [API Reference](../docs/api-reference.md)
- [Security Documentation](../docs/security.md)
- [Deployment Guide](../docs/deployment.md)

## Contributing

See [Development Guidelines](../docs/development.md) for setup and contribution instructions.

## License

Private - All rights reserved.
