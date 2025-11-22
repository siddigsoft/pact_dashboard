# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed for managing Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Built with React and TypeScript, the platform provides role-based access control, real-time collaboration, and end-to-end workflow management for field operations teams.

**Core Capabilities:**
- Multi-tier user management with role-based permissions
- MMP file upload, validation, and approval workflows
- Site visit creation, assignment, and tracking
- Real-time location sharing for field teams
- Financial tracking and budget management
- Comprehensive reporting and analytics
- Mobile-responsive design for field use
- **NEW: Mission Control Dashboard** - Categorized zone-based layout with 6 focused zones (Operations, Team, Planning, Compliance, Performance) providing role-aware navigation and command center experience

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**Dashboard Reorganization (November 22, 2025):**
- Implemented mission control dashboard layout with 6 categorized zones
- Created DashboardCommandBar with persistent KPIs, status indicators, and quick actions
- Built zone navigation system (Operations, Team, Planning, Compliance, Performance)
- Implemented role-based default zone selection
- Organized 30+ scattered widgets into logical categories
- Added tabbed navigation within each zone for efficient access
- Maintained all existing functionality while improving organization

## System Architecture

### Frontend Architecture

**Framework Stack:**
- React 18 with TypeScript for type safety
- React Router DOM v6 for client-side routing
- Vite as the build tool and development server
- Tailwind CSS v3 for utility-first styling
- Shadcn UI component library built on Radix UI primitives

**Design System:**
- Dual-theme support (light/dark mode) via next-themes
- Custom color palette with blue-indigo primary and orange accent
- Typography system using Inter and Plus Jakarta Sans fonts
- Responsive breakpoint system for mobile, tablet, and desktop
- Component-based architecture with 50+ reusable UI components

**State Management:**
- React Context API for global state (user, projects, MMPs, site visits)
- TanStack Query for server state management and caching
- Local state management with React hooks
- Real-time subscriptions via Supabase Realtime

**Key Design Patterns:**
- Provider pattern for context distribution
- Custom hooks for reusable logic (authorization, reminders, location)
- Compound component pattern for complex UI elements
- Error boundary pattern for graceful error handling
- Progressive loading with animation utilities

### Backend Architecture

**Database:**
- PostgreSQL database via Supabase
- Row Level Security (RLS) policies for data protection
- Real-time subscriptions for live updates
- Schema includes 8+ core tables: profiles, user_roles, projects, mmp_files, site_visits, user_settings, data_visibility_settings, dashboard_settings

**Authentication:**
- Supabase Auth with email/password
- Session management with auto-refresh tokens
- Role-based access control at application and database levels
- Profile creation on signup with pending approval workflow

**Data Flow:**
- Domain-specific context providers handle CRUD operations
- Snake_case to camelCase transformation at data boundaries
- Optimistic updates with error rollback
- File storage in Supabase Storage buckets

**Key Tables:**
- `profiles`: User information, roles, location data
- `user_roles`: Role assignments with timestamps
- `projects`: Project metadata and team associations
- `mmp_files`: MMP documents with site entries and verification status
- `site_visits`: Visit records with assignment and completion tracking

### Authorization System

**Permission Model:**
- Resource-action based permissions (e.g., `mmp:read`, `site_visits:create`)
- Admin bypass for all permission checks
- Granular permissions: read, create, update, delete, approve, assign, archive
- Resources: users, roles, permissions, projects, mmp, site_visits, finances, reports, settings

**Enforcement:**
- Client-side: Conditional rendering of UI elements and route guards
- Server-side: RLS policies mirror application permissions
- Role hierarchy: admin > ict > fom > supervisor > coordinator > dataCollector > financialAdmin

### File Processing

**MMP Upload Workflow:**
- CSV file upload to Supabase Storage
- Zod schema validation with detailed error reporting
- Row-by-row parsing with progress tracking
- Database insertion with site entry relationships
- Rollback on failure with storage cleanup

**Validation Layers:**
- File format validation (CSV only)
- Schema validation (required fields, data types)
- Business rule validation (duplicate checks, data ranges)
- Cross-reference validation (project associations)

### Real-Time Features

**Live Dashboard:**
- Supabase Realtime channels for mmp_files, site_visits, projects tables
- Toast notifications on INSERT, UPDATE, DELETE events
- Automatic data refresh without page reload
- Connection status monitoring

**Location Sharing:**
- GPS coordinate capture via Geolocation API
- Real-time location updates for field team members
- Privacy controls with user-level toggles
- Location-based assignment logic

### Mobile Support

**Responsive Strategy:**
- Mobile-first CSS with Tailwind breakpoints
- Separate mobile/desktop view components where needed
- Touch-friendly UI elements and spacing
- Capacitor integration for native mobile app deployment
- Offline-capable design patterns

**Progressive Web App:**
- Service worker ready architecture
- App manifest for installability
- Optimized bundle sizes with code splitting
- Lazy loading for route-based components

## External Dependencies

### Third-Party Services

**Supabase (Primary Backend):**
- PostgreSQL database hosting
- Authentication and user management
- Real-time subscriptions
- File storage (mmp-files, uploads buckets)
- Row Level Security for authorization
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**GitHub Integration:**
- Octokit REST API for repository operations
- Replit Connectors for authentication
- Private repository hosting (siddigsoft/PACT-Siddig)

### UI Libraries

**Shadcn UI Components:**
- Radix UI primitives for accessibility
- 50+ pre-built components: Dialog, Dropdown, Tabs, Toast, Card, Table, Form, etc.
- Customizable via Tailwind CSS classes
- TypeScript support with proper typing

**Data Visualization:**
- Recharts for charts and graphs (Bar, Line, Pie charts)
- Chart.js integration option
- Custom progress indicators and metrics displays

**Icon Library:**
- Lucide React for consistent iconography
- Heroicons as alternative icon set
- SVG-based for scalability

### Development Tools

**Build & Dev Environment:**
- Vite for fast development server (port 5000)
- ESLint for code quality
- TypeScript compiler for type checking
- PostCSS with Autoprefixer

**Form Management:**
- React Hook Form for form state
- Zod for schema validation
- @hookform/resolvers for integration

**Utilities:**
- date-fns for date manipulation
- uuid for unique identifier generation
- clsx/class-variance-authority for conditional classes
- Leaflet for map components (site visit locations)

### Deployment

**Hosting:**
- Replit for development environment
- Vercel-ready configuration (vercel.json)
- Static asset hosting via public directory
- Environment variable management via .env files

**Mobile Deployment:**
- Capacitor for iOS/Android builds
- Native device API access (Camera, Geolocation)
- App configuration in capacitor.config.ts