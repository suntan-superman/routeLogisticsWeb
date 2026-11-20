# Route Logistics Web App

React web application for field service business administration.

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build
```

## Features

- ✅ Company setup and configuration
- ✅ Customer management dashboard
- ✅ Job tracking and management
- ✅ Estimate template management
- ✅ Calendar view with Syncfusion components
- ✅ Comprehensive reporting and analytics
- ✅ Team member management

## Appearance

Use the **Appearance** selector in the workspace header or on sign-in and public
pages to choose **System**, **Light**, or **Dark**. System is the default and
follows the device's appearance setting. An explicit choice is saved in this
browser on this device, survives reloads and sign-out, and applies independently
of the signed-in account or company. Other tabs in the same browser stay in sync.

Printed documents use a light background. This feature changes only the web
application; mobile appearance is unchanged and no mobile rebuild is required.

## Technology Stack

- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Storage)
- **State Management**: React Context API + TanStack Query
- **UI Components**: Heroicons + Syncfusion
- **Routing**: React Router DOM

## Project Structure

```
routeLogisticsWeb/
├── src/
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React Context providers
│   ├── pages/             # Application pages
│   ├── services/          # Firebase service wrappers
│   └── App.jsx           # Main application component
├── public/                # Static assets
└── package.json          # Dependencies and scripts
```

## Development

### Prerequisites
- Node.js 18+
- Yarn package manager
- Firebase CLI

### Environment Setup
1. Install dependencies: `yarn install`
2. Configure Firebase in `src/services/firebase.js`
3. Start development server: `yarn dev`
4. Access at `http://localhost:3000`

### Building for Production
```bash
# Build the application
yarn build

# Preview production build
yarn preview

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

# Admin access
https://route-logistics.com/platform-admin
sroy@worksidesoftware.com

## Syncfusion Integration

The web app uses Syncfusion components for advanced UI features:

- **Calendar**: Job scheduling and management
- **Charts**: Analytics and reporting
- **License**: Configured with production license key

## Documentation

- [Web App Documentation](../docs/web-app.md)
- [API Reference](../docs/api-reference.md)
- [Security Documentation](../docs/security.md)
- [Deployment Guide](../docs/deployment.md)

## Contributing

See [Development Guidelines](../docs/development.md) for setup and contribution instructions.

## License

Private - All rights reserved.
