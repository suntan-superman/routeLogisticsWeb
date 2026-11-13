# Route Logistics Mobile App

React Native mobile application for field service technicians.

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn start

# Run on specific platform
yarn android
yarn ios
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
- Node.js 18+
- Yarn package manager
- Expo CLI
- iOS Simulator (macOS) or Android Emulator

### Environment Setup
1. Install dependencies: `yarn install`
2. Configure Firebase in `constants/firebase.js`
3. Start development server: `yarn start`
4. Scan QR code with Expo Go app or run on simulator

### Building for Production
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build for production
eas build --platform ios
eas build --platform android
```

## Documentation

- [Mobile App Documentation](../docs/mobile-app.md)
- [API Reference](../docs/api-reference.md)
- [Security Documentation](../docs/security.md)
- [Deployment Guide](../docs/deployment.md)

## Contributing

See [Development Guidelines](../docs/development.md) for setup and contribution instructions.

## License

Private - All rights reserved.
