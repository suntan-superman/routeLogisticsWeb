# Deployment Documentation

## Overview

This document covers deployment procedures for both the mobile and web applications in the mi Factotum platform.

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        DEV[Local Development<br/>Firebase Emulators]
    end
    
    subgraph "Staging"
        STAGE[Staging Environment<br/>Firebase Preview]
    end
    
    subgraph "Production"
        PROD[Production Environment<br/>Firebase Hosting]
        APPSTORE[App Store<br/>iOS]
        PLAYSTORE[Google Play<br/>Android]
    end
    
    DEV --> STAGE
    STAGE --> PROD
    DEV --> APPSTORE
    DEV --> PLAYSTORE
```

## Mobile App Deployment

### Prerequisites
- **EAS CLI**: `npm install -g eas-cli`
- **Expo Account**: Registered with Expo
- **Apple Developer Account**: For iOS deployment
- **Google Play Console**: For Android deployment

### EAS Build Configuration

#### eas.json
```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "autoIncrement": true
      },
      "android": {
        "autoIncrement": true
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### iOS Deployment

#### 1. Configure iOS Build
```bash
# Navigate to mobile app directory
cd routeLogisticsMobile

# Configure EAS build
eas build:configure

# Build for iOS
eas build --platform ios --profile production
```

#### 2. App Store Configuration
- **Bundle Identifier**: `com.prologixsa.mifactotum`
- **App Name**: mi Factotum
- **Version**: Auto-incremented via EAS
- **Build Number**: Auto-incremented via EAS

#### 3. App Store Connect Setup
1. Create app in App Store Connect
2. Configure app metadata and screenshots
3. Set up TestFlight for beta testing
4. Submit for App Store review

#### 4. Production Deployment
```bash
# Submit to App Store
eas submit --platform ios --profile production
```

### Android Deployment

#### 1. Configure Android Build
```bash
# Build for Android
eas build --platform android --profile production
```

#### 2. Google Play Configuration
- **Package Name**: `com.prologixsa.mifactotum`
- **App Name**: mi Factotum
- **Version Code**: Auto-incremented via EAS
- **Version Name**: Manual version management

#### 3. Google Play Console Setup
1. Create app in Google Play Console
2. Configure app metadata and screenshots
3. Set up internal testing track
4. Submit for production review

#### 4. Production Deployment
```bash
# Submit to Google Play
eas submit --platform android --profile production
```

### Environment Configuration

#### app.config.js
```javascript
export default {
  expo: {
    name: "Route Logistics",
    slug: "route-logistics",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.workside.routelogistics",
      buildNumber: "1",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "This app needs location access to show nearby jobs."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png"
      },
      package: "com.workside.routelogistics",
      versionCode: 1
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      eas: {
        projectId: "your-project-id"
      }
    }
  }
};
```

## Web App Deployment

### Prerequisites
- **Firebase CLI**: `npm install -g firebase-tools`
- **Firebase Account**: Registered with Firebase
- **Node.js**: Version 18+ required
- **Yarn**: Package manager

### Firebase Hosting Configuration

#### firebase.json
```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

### Build Process

#### 1. Install Dependencies
```bash
cd routeLogisticsWeb
yarn install
```

#### 2. Build for Production
```bash
# Build the application
yarn build

# Preview the build
yarn preview
```

#### 3. Deploy to Firebase
```bash
# Login to Firebase
firebase login

# Initialize Firebase project
firebase init hosting

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Environment Configuration

#### Development Environment
```bash
# Start development server
yarn dev

# Uses local Firebase emulators
# Firebase project: mi-factotum-field-service
```

#### Staging Environment
```bash
# Deploy to staging
firebase hosting:channel:deploy staging

# Access via: https://mi-factotum-field-service--staging.web.app
```

#### Production Environment
```bash
# Deploy to production
firebase deploy --only hosting

# Access via: https://mi-factotum-field-service.web.app
```

### Custom Domain Setup

#### 1. Configure Custom Domain
```bash
# Add custom domain
firebase hosting:sites:create your-domain.com

# Configure DNS records
# A record: 151.101.1.195
# A record: 151.101.65.195
```

#### 2. SSL Certificate
- Firebase automatically provisions SSL certificates
- HTTPS enforcement enabled by default
- Certificate renewal handled automatically

## Firebase Configuration

### Project Setup
- **Project ID**: `mi-factotum-field-service`
- **Region**: us-central1 (default)
- **Plan**: Blaze (pay-as-you-go)

### Services Configuration

#### Authentication
- **Providers**: Email/Password
- **Domain**: `mi-factotum-field-service.firebaseapp.com`
- **Settings**: Configured for both mobile and web

#### Firestore Database
- **Mode**: Native mode
- **Location**: us-central1
- **Security Rules**: Deployed via firestore-security-rules.txt

#### Storage
- **Location**: us-central1
- **Rules**: User-specific access control
- **Usage**: File uploads and document storage

#### Hosting
- **Domain**: `mi-factotum-field-service.web.app`
- **Custom Domain**: Configured separately
- **CDN**: Global content delivery

### Environment Variables

#### Mobile App
```javascript
// app.config.js
export default {
  expo: {
    extra: {
      firebaseApiKey: "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
      firebaseAuthDomain: "mi-factotum-field-service.firebaseapp.com",
      firebaseProjectId: "mi-factotum-field-service",
      firebaseStorageBucket: "mi-factotum-field-service.firebasestorage.app",
      firebaseMessagingSenderId: "1030013411579",
      firebaseAppId: "1:1030013411579:web:37cdb1ce1e57c1e75c505e"
    }
  }
};
```

#### Web App
```javascript
// src/services/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
  authDomain: "mi-factotum-field-service.firebaseapp.com",
  projectId: "mi-factotum-field-service",
  storageBucket: "mi-factotum-field-service.firebasestorage.app",
  messagingSenderId: "1030013411579",
  appId: "1:1030013411579:web:37cdb1ce1e57c1e75c505e",
  measurementId: "G-VS61WKSG39"
};
```

## CI/CD Pipeline

### GitHub Actions (TODO: Implement)

#### Mobile App Pipeline
```yaml
name: Mobile App CI/CD
on:
  push:
    branches: [main]
    paths: ['routeLogisticsMobile/**']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd routeLogisticsMobile && yarn install
      - name: Build for iOS
        run: cd routeLogisticsMobile && eas build --platform ios --non-interactive
      - name: Build for Android
        run: cd routeLogisticsMobile && eas build --platform android --non-interactive
```

#### Web App Pipeline
```yaml
name: Web App CI/CD
on:
  push:
    branches: [main]
    paths: ['routeLogisticsWeb/**']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd routeLogisticsWeb && yarn install
      - name: Build
        run: cd routeLogisticsWeb && yarn build
      - name: Deploy to Firebase
        run: cd routeLogisticsWeb && firebase deploy --only hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

## Monitoring and Analytics

### Firebase Analytics
- **Mobile App**: Automatic event tracking
- **Web App**: Custom event implementation
- **Metrics**: User engagement, feature usage, performance

### Error Monitoring
- **Firebase Crashlytics**: Mobile app crash reporting
- **Firebase Performance**: Performance monitoring
- **Custom Logging**: Application-specific metrics

### Uptime Monitoring
- **Firebase Status**: Service availability
- **Custom Monitoring**: Application health checks
- **Alert System**: Automated notifications

## Rollback Procedures

### Mobile App Rollback
```bash
# Rollback to previous version
eas build:list
eas build:rollback --platform ios --build-id <build-id>
eas build:rollback --platform android --build-id <build-id>
```

### Web App Rollback
```bash
# Rollback to previous deployment
firebase hosting:releases:list
firebase hosting:releases:rollback <release-id>
```

## Backup and Recovery

### Data Backup
- **Firestore**: Automatic backups enabled
- **Storage**: Firebase Storage backups
- **Configuration**: Version-controlled configuration

### Disaster Recovery
- **RTO**: 4 hours (Recovery Time Objective)
- **RPO**: 1 hour (Recovery Point Objective)
- **Backup Frequency**: Daily automated backups

## Security Considerations

### Deployment Security
- **API Keys**: Environment-specific configuration
- **Secrets Management**: Secure credential storage
- **Access Control**: Limited deployment access
- **Audit Logging**: Deployment activity tracking

### Production Security
- **HTTPS**: Enforced for all connections
- **Security Headers**: Implemented via Firebase Hosting
- **CSP**: Content Security Policy configured
- **Rate Limiting**: Firebase-imposed limits

## Performance Optimization

### Mobile App Performance
- **Bundle Size**: Optimized with EAS Build
- **Asset Optimization**: Compressed images and assets
- **Code Splitting**: Implemented for large features
- **Caching**: Local data caching strategies

### Web App Performance
- **CDN**: Firebase Hosting global CDN
- **Compression**: Gzip compression enabled
- **Caching**: Browser caching strategies
- **Bundle Optimization**: Vite's modern bundling

## Troubleshooting

### Common Deployment Issues

#### Mobile App Issues
- **Build Failures**: Check EAS build logs
- **Certificate Issues**: Verify Apple Developer account
- **Bundle Identifier**: Ensure consistency across configs
- **Dependencies**: Verify package compatibility

#### Web App Issues
- **Build Failures**: Check Vite build logs
- **Firebase Errors**: Verify Firebase configuration
- **Domain Issues**: Check DNS configuration
- **SSL Issues**: Verify certificate status

### Debug Commands
```bash
# Mobile app debugging
cd routeLogisticsMobile
expo doctor
eas build:list
eas build:view <build-id>

# Web app debugging
cd routeLogisticsWeb
yarn build --debug
firebase hosting:channel:list
firebase hosting:releases:list
```

## Future Enhancements

### Planned Improvements
- [ ] Automated CI/CD pipeline
- [ ] Blue-green deployments
- [ ] Canary releases
- [ ] Automated testing integration
- [ ] Performance monitoring dashboard
- [ ] Automated rollback triggers
- [ ] Multi-environment management
- [ ] Infrastructure as Code (IaC)
