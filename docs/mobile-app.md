# Mobile App Documentation

## Overview

The Route Logistics mobile app is built with React Native and Expo, designed for field technicians to manage jobs, customers, and estimates on the go.

## Project Structure

```
routeLogisticsMobile/
├── App.js                 # Main application component
├── app.json              # Expo configuration
├── app.config.js         # Environment configuration
├── eas.json              # EAS Build configuration
├── package.json          # Dependencies and scripts
├── constants/            # App constants and configuration
│   ├── colors.js         # Color palette
│   ├── firebase.js       # Firebase configuration
│   └── responsiveSizes.js # Responsive sizing utilities
├── contexts/             # React Context providers
│   ├── AuthContext.js    # Authentication state management
│   └── LanguageContext.js # Multi-language support
├── screens/              # Application screens
│   ├── SplashScreen.js   # App launch screen
│   ├── LoginScreen.js    # User authentication
│   ├── SignUpScreen.js  # User registration
│   ├── EmailVerificationScreen.js # Email verification
│   ├── ServiceSelectionScreen.js # Service category selection
│   ├── HomeScreen.js     # Main dashboard
│   └── SettingsScreen.js # User settings
├── services/             # Business logic and API calls
│   └── firebase.js       # Firebase service wrappers
└── assets/               # Images and static assets
```

## Key Features

### Authentication & User Management
- Email/password authentication via Firebase Auth
- User registration with service category selection
- Profile management and settings
- Multi-language support (English/Spanish)

### Customer Management
- Add, edit, and delete customers
- Customer search and filtering
- Contact information management
- Customer status tracking (active/inactive)

### Job Management
- Schedule new jobs with customer selection
- Job status tracking (scheduled, in-progress, completed, cancelled)
- Time tracking and duration estimation
- Job notes and photo attachments (placeholder)
- Job completion workflow with confirmation

### Estimate System
- Create estimates with customer and service details
- Pre-defined estimate templates
- Estimate number generation
- Cost calculation and validation
- Estimate status tracking

### Calendar Integration
- View scheduled jobs in calendar format
- Filter by date ranges (day, week, month)
- Job details on tap
- Status-based color coding

## Technical Implementation

### State Management
Uses React Context API for global state:
- **AuthContext**: User authentication and profile data
- **LanguageContext**: Multi-language support with AsyncStorage persistence

### Navigation
React Navigation v7 with stack-based navigation:
- Splash → Login/SignUp → Email Verification → Home
- Modal-based navigation for forms and details
- Deep linking support for job details

### Data Persistence
- **Firebase Firestore**: Primary data storage
- **AsyncStorage**: Local caching and offline support
- **Expo SecureStore**: Secure credential storage

### Responsive Design
Custom responsive sizing system:
- Device-agnostic sizing with `react-native-responsive-screen`
- Consistent spacing and typography
- Adaptive layouts for different screen sizes

## Firebase Integration

### Authentication
```javascript
// Firebase Auth configuration
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
```

### Firestore Collections
- **users**: User profiles and preferences
- **customers**: Customer information
- **jobs**: Job scheduling and tracking
- **estimates**: Project estimates and quotes
- **appointments**: Calendar events

### Security Rules
All collections enforce user-specific access:
```javascript
// Example security rule
match /customers/{customerId} {
  allow read, write: if request.auth != null && 
    request.auth.uid == resource.data.userId;
}
```

## Service Layer

### Firebase Service Wrapper
Centralized service layer (`services/firebase.js`) provides:
- **AuthService**: Authentication operations
- **CustomerService**: Customer CRUD operations
- **JobService**: Job management and scheduling
- **EstimateService**: Estimate creation and management

### Error Handling
- Comprehensive error handling with user-friendly messages
- Network error detection and offline mode support
- Validation error display with specific field highlighting

## UI/UX Design

### Design System
- **Color Palette**: Green-based theme with professional appearance
- **Typography**: Consistent font sizing with responsive scaling
- **Spacing**: Standardized spacing system for consistent layouts
- **Components**: Reusable UI components with consistent styling

### User Experience
- **Offline-First**: Local data caching with sync when online
- **Loading States**: Professional loading indicators
- **Error States**: Clear error messages with recovery options
- **Empty States**: Helpful guidance when no data is present

## Build and Deployment

### Development
```bash
# Install dependencies
yarn install

# Start development server
yarn start

# Run on specific platform
yarn android
yarn ios
```

### Production Builds
Uses EAS Build for production builds:
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build for production
eas build --platform ios
eas build --platform android
```

### Environment Configuration
Environment variables managed through `app.config.js`:
- Firebase configuration
- API endpoints
- Feature flags
- Build-specific settings

## Performance Optimizations

### Bundle Optimization
- Code splitting for screen components
- Lazy loading of non-critical features
- Image optimization and caching
- Tree shaking for unused code removal

### Runtime Performance
- Memoization of expensive calculations
- Optimized re-renders with React.memo
- Efficient list rendering with FlatList
- Background task management

### Memory Management
- Proper cleanup of event listeners
- Image memory optimization
- Component unmounting cleanup
- Efficient state updates

## Testing Strategy

### Unit Testing
- Service layer testing with mocked Firebase
- Utility function testing
- Component testing with React Native Testing Library

### Integration Testing
- Firebase integration testing
- Navigation flow testing
- Authentication flow testing

### Manual Testing
- Device-specific testing (iOS/Android)
- Network condition testing
- Offline mode testing
- Performance testing on low-end devices

## Known Issues and Limitations

### Current Limitations
- Photo upload functionality is placeholder only
- Offline sync has basic implementation
- Push notifications not implemented
- Advanced reporting features limited

### Platform-Specific Issues
- iOS date picker modal layering issues (workaround implemented)
- Android keyboard avoidance in modals
- Different behavior between platforms for some components

## Future Enhancements

### Planned Features
- [ ] Photo upload and management
- [ ] Push notifications for job updates
- [ ] Offline sync improvements
- [ ] Advanced search and filtering
- [ ] Invoice generation
- [ ] Payment processing integration
- [ ] GPS tracking and route optimization
- [ ] Voice notes and dictation

### Technical Improvements
- [ ] TypeScript migration for type safety
- [ ] Performance monitoring integration
- [ ] Automated testing pipeline
- [ ] Code splitting improvements
- [ ] Bundle size optimization
- [ ] Accessibility improvements

## Development Guidelines

### Code Style
- Use functional components with hooks
- Implement proper error boundaries
- Follow React Native best practices
- Use consistent naming conventions

### Git Workflow
- Feature branches for new development
- Pull request reviews required
- Automated testing on PR creation
- Semantic versioning for releases

### Documentation
- JSDoc comments for complex functions
- README updates for new features
- API documentation maintenance
- User guide updates
