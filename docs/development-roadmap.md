# Prioritized Development List

## Implementation update — November 12, 2026

The historical priorities below remain the backlog; their 2025 dates are not current commitments. See [migration progress and code review](migration-progress.md) for the two completed eight-phase batches, live Acme data audit, validation, deployment status, and remaining work. Checked items indicate implemented code; email-dependent features are deliberately inactive at the user's request.

Implemented in this run: explicit invitations and live membership authorization, role management, callable rate limits, verified mobile sessions, compressed mobile job photos, customer CSV import/export, recurring-job scheduling, isolated customer portal, email/reminder infrastructure, ownership transfer, notification history, privacy notice, route-level code splitting, and expanded CI/emulator coverage.

Partial items remain unchecked: full MFA/recovery, native push, background offline reconciliation, monitoring across both apps, custom invoice templates, bulk job operations, advanced reporting/search, and operational backup/alerting. Stripe, QuickBooks, directory/search, route optimization, and live location remain future work.

## High Priority (Q1 2025)

### Security & Compliance
- [ ] **Multi-Factor Authentication (MFA)**
  - Implement TOTP-based MFA for enhanced security
  - Add backup codes for account recovery
  - Priority: Critical for production deployment

- [x] **Role-Based Access Control (RBAC)**
  - Implement granular permissions system
  - Add role management for team members
  - Priority: Essential for multi-user environments

- [x] **API Rate Limiting**
  - Implement rate limiting for Firebase Functions
  - Add request throttling and abuse prevention
  - Priority: Prevent service abuse and ensure stability

### Core Functionality
- [x] **Photo Upload & Management**
  - Implement Firebase Storage integration
  - Add image compression and optimization
  - Implemented for web/mobile; native-device validation and offline upload retries remain separate work.
  - Priority: Critical for job documentation

- [ ] **Push Notifications**
  - Assignment/status FCM delivery and web notification history implemented; native token registration/device validation remain.
  - Implement Firebase Cloud Messaging
  - Add job status change notifications
  - Priority: Essential for real-time updates

- [ ] **Offline Sync Improvements**
  - Added offline guidance and web job-edit conflict detection; full background reconciliation remains.
  - Implement conflict resolution strategies
  - Add background sync capabilities
  - Priority: Critical for field technicians

### Performance & Reliability
- [ ] **Performance Monitoring**
  - Optional web Firebase Performance/custom trace implemented; native monitoring and real-user baseline remain.
  - Integrate Firebase Performance Monitoring
  - Add custom performance metrics
  - Priority: Essential for production monitoring

- [ ] **Error Tracking & Reporting**
  - Web Sentry privacy scrubbing improved; native coverage and production alerting remain.
  - Implement comprehensive error tracking
  - Add automated error reporting
  - Priority: Critical for debugging and stability

## Medium Priority (Q2 2025)

### Business Features
- [ ] **Invoice Generation**
  - Implement PDF invoice generation
  - Add invoice templates and customization
  - Priority: Important for business operations

- [ ] **Payment Processing Integration**
  - Integrate Stripe or similar payment processor
  - Add payment tracking and reconciliation
  - Priority: Important for revenue management

- [ ] **Advanced Reporting Dashboard**
  - Implement interactive charts and graphs
  - Add custom report builder
  - Priority: Important for business insights

### User Experience
- [x] **Customer Portal**
  - Create customer-facing web portal
  - Add job status tracking for customers
  - OTP portal and invoice views implemented/tested; sign-in remains inactive while email delivery is disabled.
  - Priority: Important for customer satisfaction

- [ ] **Advanced Search & Filtering**
  - Implement full-text search capabilities
  - Add advanced filtering options
  - Priority: Important for data management

- [ ] **Bulk Operations**
  - Customer CSV import/preview, deduplication, and paginated export implemented; bulk job actions remain.
  - Add bulk import/export functionality
  - Implement batch operations for jobs and customers
  - Priority: Important for efficiency

### Technical Improvements
- [ ] **TypeScript Migration**
  - Migrate JavaScript codebase to TypeScript
  - Add type safety and better IDE support
  - Priority: Important for code quality

- [x] **Automated Testing Pipeline**
  - Implement comprehensive test suite
  - Add CI/CD with automated testing
  - Priority: Important for code quality

## Lower Priority (Q3-Q4 2025)

### Advanced Features
- [ ] **GPS Tracking & Route Optimization**
  - Implement location tracking for jobs
  - Add route optimization algorithms
  - Priority: Nice to have for efficiency

- [ ] **Voice Notes & Dictation**
  - Add voice recording capabilities
  - Implement speech-to-text functionality
  - Priority: Nice to have for convenience

- [ ] **Advanced Analytics**
  - Implement machine learning insights
  - Add predictive analytics for business
  - Priority: Nice to have for business intelligence

### Integration & Extensibility
- [ ] **Third-Party Integrations**
  - Integrate with accounting software (QuickBooks)
  - Add CRM integrations (Salesforce)
  - Priority: Nice to have for business integration

- [ ] **API Development**
  - Create public API for third-party integrations
  - Add webhook support for external systems
  - Priority: Nice to have for extensibility

- [ ] **Mobile App Enhancements**
  - Add barcode scanning capabilities
  - Implement offline map functionality
  - Priority: Nice to have for field operations

## Technical Debt & Maintenance

### Code Quality
- [ ] **Code Refactoring**
  - Refactor legacy code patterns
  - Improve code organization and structure
  - Priority: Ongoing maintenance

- [ ] **Documentation Updates**
  - Maintain comprehensive documentation
  - Add API documentation
  - Priority: Ongoing maintenance

- [ ] **Dependency Updates**
  - Regular dependency updates and security patches
  - Monitor for security vulnerabilities
  - Priority: Ongoing maintenance

### Infrastructure
- [ ] **Monitoring & Alerting**
  - Implement comprehensive monitoring dashboard
  - Add automated alerting for critical issues
  - Priority: Ongoing maintenance

- [ ] **Backup & Recovery**
  - Implement automated backup strategies
  - Add disaster recovery procedures
  - Priority: Ongoing maintenance

- [ ] **Scalability Improvements**
  - Optimize database queries and indexes
  - Implement caching strategies
  - Priority: Ongoing maintenance

## Assumptions & Dependencies

### External Dependencies
- **Firebase**: Continued Firebase service availability and pricing
- **Syncfusion**: License renewal and component updates
- **Apple/Google**: App store approval processes
- **Payment Processors**: Integration requirements and fees

### Resource Requirements
- **Development Team**: 2-3 developers for full implementation
- **Timeline**: 12-18 months for complete feature set
- **Budget**: Consider licensing costs for third-party services
- **Infrastructure**: Firebase scaling costs as user base grows

### Risk Factors
- **Technology Changes**: Framework and library updates
- **Security Vulnerabilities**: Regular security audits required
- **Regulatory Compliance**: Data protection and privacy regulations
- **Market Competition**: Feature parity with competitors

## Success Metrics

### Technical Metrics
- **Uptime**: 99.9% availability target
- **Performance**: < 3 second page load times
- **Error Rate**: < 0.1% error rate
- **Security**: Zero critical security vulnerabilities

### Business Metrics
- **User Adoption**: 80% feature adoption rate
- **Customer Satisfaction**: 4.5+ star rating
- **Revenue Growth**: 25% year-over-year growth
- **Operational Efficiency**: 30% reduction in administrative time

## Recommendations

### Immediate Actions (Next 30 Days)
1. **Security Audit**: Conduct comprehensive security review
2. **Performance Baseline**: Establish current performance metrics
3. **User Feedback**: Gather feedback on current features
4. **Technical Debt Assessment**: Identify critical technical debt

### Short-term Goals (Next 90 Days)
1. **MFA Implementation**: Complete multi-factor authentication
2. **Photo Upload**: Implement basic photo upload functionality
3. **Push Notifications**: Add essential notification features
4. **Error Tracking**: Implement comprehensive error monitoring

### Long-term Vision (Next 12 Months)
1. **Complete Feature Set**: Implement all high and medium priority features
2. **Market Leadership**: Achieve feature parity with leading competitors
3. **Scalability**: Prepare for 10x user growth
4. **Ecosystem**: Build comprehensive third-party integration ecosystem

## P1 status (complete)
- Offline cache (Firestore persistent multi-tab cache)
- Job photos (compressed upload, Storage rules)
- Invoices (draft/sent/paid/void, print)
- Pest-control: service plans with visit scheduling, application logs with CSV export
- Push notifications on job assignment (functions:routelogistics notifyJobAssigned). Requires VITE_FIREBASE_VAPID_KEY in .env and Netlify.

Deploy functions ONLY with: firebase deploy --only functions:routelogistics (never plain --only functions; it would delete another codebase's functions).

## Remaining
- Mobile job screens/photo capture, Stripe payments, PDF/email invoices, MFA, rate limiting, performance monitoring.
