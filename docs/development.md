# Development Guidelines

## Development Environment Setup

### Prerequisites
- **Node.js**: Version 18+ (LTS recommended)
- **Yarn**: Package manager
- **Git**: Version control
- **Firebase CLI**: `npm install -g firebase-tools`
- **Expo CLI**: `npm install -g @expo/cli`
- **EAS CLI**: `npm install -g eas-cli`

### Local Development Setup

#### 1. Clone Repository
```bash
git clone <repository-url>
cd mifactotum
```

#### 2. Install Dependencies
```bash
# Mobile app
cd routeLogisticsMobile
yarn install

# Web app
cd routeLogisticsWeb
yarn install
```

#### 3. Firebase Setup
```bash
# Login to Firebase
firebase login

# Install Firebase emulators
firebase init emulators

# Start emulators
firebase emulators:start
```

#### 4. Environment Configuration
```bash
# Mobile app - app.config.js
# Web app - .env.local (create if needed)
```

## Code Style Guidelines

### JavaScript Standards
- **ES6+**: Use modern JavaScript features
- **Functional Components**: Prefer functional components with hooks
- **Async/Await**: Use async/await over promises
- **Destructuring**: Use object and array destructuring
- **Template Literals**: Use template literals for string concatenation

### Naming Conventions
- **Files**: kebab-case for files (`user-profile.js`)
- **Components**: PascalCase (`UserProfile.js`)
- **Functions**: camelCase (`getUserData`)
- **Variables**: camelCase (`userName`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **CSS Classes**: kebab-case (`user-profile-card`)

### Code Organization
```javascript
// File structure example
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';

// Constants
const DEFAULT_TIMEOUT = 5000;

// Component
const UserProfile = ({ userId }) => {
  // State
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Effects
  useEffect(() => {
    loadUser();
  }, [userId]);
  
  // Functions
  const loadUser = async () => {
    try {
      setLoading(true);
      const userData = await UserService.getUser(userId);
      setUser(userData);
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Render
  if (loading) return <LoadingSpinner />;
  
  return (
    <View>
      <Text>{user?.name}</Text>
    </View>
  );
};

export default UserProfile;
```

## Git Workflow

### Branch Strategy
- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/**: Feature development branches
- **hotfix/**: Critical bug fixes
- **release/**: Release preparation branches

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

#### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Test additions/changes
- **chore**: Build process or auxiliary tool changes

#### Examples
```
feat(auth): add multi-factor authentication
fix(mobile): resolve iOS date picker modal issue
docs(api): update API documentation
refactor(services): extract common service patterns
```

### Pull Request Process
1. **Create Feature Branch**: `git checkout -b feature/new-feature`
2. **Develop Feature**: Make changes with proper commits
3. **Push Branch**: `git push origin feature/new-feature`
4. **Create PR**: Submit pull request with description
5. **Code Review**: Address reviewer feedback
6. **Merge**: Merge after approval and tests pass

## Testing Guidelines

### Testing Strategy
- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test service integrations
- **E2E Tests**: Test complete user workflows
- **Manual Testing**: Device-specific and UX testing

### Test Structure
```javascript
// Example test file
import { render, screen } from '@testing-library/react-native';
import UserProfile from '../UserProfile';

describe('UserProfile', () => {
  it('renders user name correctly', () => {
    const mockUser = { name: 'John Doe', email: 'john@example.com' };
    render(<UserProfile user={mockUser} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
  
  it('handles loading state', () => {
    render(<UserProfile loading={true} />);
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
});
```

### Testing Commands
```bash
# Mobile app testing
cd routeLogisticsMobile
yarn test

# Web app testing
cd routeLogisticsWeb
yarn test
```

## Firebase Development

### Emulator Usage
```bash
# Start all emulators
firebase emulators:start

# Start specific emulators
firebase emulators:start --only firestore,auth

# Emulator UI
# Access at http://localhost:4000
```

### Firestore Rules Testing
```bash
# Test security rules
firebase emulators:exec --only firestore "npm test"
```

### Data Seeding
```javascript
// Example seed script
const seedData = async () => {
  const db = getFirestore();
  
  // Seed users
  await setDoc(doc(db, 'users', 'test-user'), {
    name: 'Test User',
    email: 'test@example.com',
    // ... other fields
  });
  
  // Seed customers
  await setDoc(doc(db, 'customers', 'test-customer'), {
    userId: 'test-user',
    name: 'Test Customer',
    // ... other fields
  });
};
```

## Performance Guidelines

### Mobile App Performance
- **Image Optimization**: Use appropriate image sizes
- **List Performance**: Use FlatList for large lists
- **Memory Management**: Proper cleanup in useEffect
- **Bundle Size**: Monitor and optimize bundle size

### Web App Performance
- **Code Splitting**: Use React.lazy() for route-based splitting
- **Caching**: Implement proper caching strategies
- **Bundle Analysis**: Regular bundle size analysis
- **Lighthouse**: Regular performance audits

### Database Performance
- **Indexing**: Create proper Firestore indexes
- **Pagination**: Implement cursor-based pagination
- **Query Optimization**: Minimize read operations
- **Caching**: Cache frequently accessed data

## Security Guidelines

### Authentication
- **Token Management**: Proper JWT token handling
- **Session Security**: Secure session management
- **Password Policy**: Enforce strong passwords
- **MFA**: TODO: Implement multi-factor authentication

### Data Protection
- **Input Validation**: Validate all user inputs
- **SQL Injection**: Use parameterized queries
- **XSS Prevention**: Proper output encoding
- **CSRF Protection**: Implement CSRF tokens

### API Security
- **Rate Limiting**: Implement API rate limiting
- **Authentication**: Require authentication for all APIs
- **Authorization**: Implement proper authorization checks
- **Error Handling**: Secure error messages

## Documentation Standards

### Code Documentation
```javascript
/**
 * Creates a new customer in the database
 * @param {Object} customerData - Customer information
 * @param {string} customerData.name - Customer name
 * @param {string} customerData.email - Customer email
 * @param {string} customerData.phone - Customer phone
 * @returns {Promise<Object>} Result object with success status
 */
const createCustomer = async (customerData) => {
  // Implementation
};
```

### README Files
Each major component should have a README with:
- Purpose and functionality
- Installation instructions
- Usage examples
- API documentation
- Troubleshooting guide

### API Documentation
- **OpenAPI/Swagger**: For REST APIs
- **JSDoc**: For JavaScript functions
- **Type Definitions**: For TypeScript (future)
- **Examples**: Code examples for common use cases

## Error Handling

### Error Handling Patterns
```javascript
// Service layer error handling
class CustomerService {
  static async getCustomers() {
    try {
      const userId = this.getCurrentUserId();
      const q = query(
        collection(db, 'customers'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });
      
      return { success: true, customers };
    } catch (error) {
      console.error('Error getting customers:', error);
      return { success: false, error: error.message };
    }
  }
}
```

### Error Boundaries
```javascript
// React Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    
    return this.props.children;
  }
}
```

## Debugging Guidelines

### Mobile App Debugging
```bash
# Start with debugging
expo start --dev-client

# View logs
expo logs

# Debug on device
expo start --tunnel
```

### Web App Debugging
```bash
# Development with debugging
yarn dev

# Build with source maps
yarn build --sourcemap

# Debug in browser
# Use React Developer Tools
```

### Firebase Debugging
```bash
# Enable debug logging
firebase functions:log

# View emulator logs
firebase emulators:start --debug
```

## Code Review Checklist

### Functionality
- [ ] Code works as expected
- [ ] Edge cases handled
- [ ] Error handling implemented
- [ ] Performance considerations addressed

### Code Quality
- [ ] Code follows style guidelines
- [ ] Functions are well-documented
- [ ] No code duplication
- [ ] Proper separation of concerns

### Security
- [ ] Input validation implemented
- [ ] Authentication/authorization checked
- [ ] Sensitive data protected
- [ ] Security best practices followed

### Testing
- [ ] Unit tests written
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Edge cases tested

## Release Process

### Version Management
- **Semantic Versioning**: MAJOR.MINOR.PATCH
- **Changelog**: Maintain detailed changelog
- **Release Notes**: Document new features and fixes
- **Rollback Plan**: Prepare rollback procedures

### Release Checklist
- [ ] All tests pass
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Version bumped
- [ ] Changelog updated
- [ ] Release notes prepared
- [ ] Deployment tested
- [ ] Monitoring configured

## Tools and Extensions

### Recommended VS Code Extensions
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Firebase**: Firebase integration
- **React Native Tools**: React Native development
- **GitLens**: Git integration
- **Thunder Client**: API testing

### Development Tools
- **React Developer Tools**: React debugging
- **Firebase Emulator Suite**: Local Firebase development
- **Expo Dev Tools**: Mobile app development
- **Chrome DevTools**: Web app debugging
- **Flipper**: Mobile app debugging

## Troubleshooting

### Common Issues

#### Mobile App Issues
- **Metro bundler errors**: Clear cache with `expo start -c`
- **iOS build failures**: Check Xcode and iOS SDK versions
- **Android build failures**: Verify Android SDK and build tools
- **Firebase connection issues**: Check network and configuration

#### Web App Issues
- **Build failures**: Check Node.js version and dependencies
- **Firebase errors**: Verify Firebase configuration
- **Routing issues**: Check React Router configuration
- **Styling issues**: Verify Tailwind CSS configuration

#### Firebase Issues
- **Permission denied**: Check Firestore security rules
- **Authentication errors**: Verify Firebase Auth configuration
- **Emulator issues**: Restart emulators and clear cache
- **Index errors**: Create required composite indexes

### Debug Commands
```bash
# Clear caches
expo start -c
yarn cache clean
firebase emulators:start --clear

# Check configurations
expo doctor
firebase projects:list
yarn list --depth=0
```

## Future Development

### Planned Improvements
- [ ] TypeScript migration
- [ ] Automated testing pipeline
- [ ] Performance monitoring
- [ ] Advanced error tracking
- [ ] Code quality gates
- [ ] Automated documentation
- [ ] Security scanning
- [ ] Dependency updates

### Technology Upgrades
- [ ] React 19 features
- [ ] Expo SDK updates
- [ ] Firebase SDK updates
- [ ] Build tool improvements
- [ ] Testing framework updates
- [ ] Development tool enhancements
