# PACT Workflow Platform

## Overview

PACT (MMP Management System) is a comprehensive workflow platform designed for field operations management. It's a full-stack React application with enterprise-grade UI components, role-based access control, and real-time data synchronization. The platform manages monitoring management plans, field operations, user roles, and administrative workflows.

**Core Purpose:** Streamline field operations, employee management, and workflow tracking for organizations managing monitoring management plans (MMPs).

**Tech Stack:** React 18 + TypeScript, Vite build system, Shadcn UI component library, Tailwind CSS, React Router v6, TanStack Query for state management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Component-Based React Application**
- **Framework:** React 18 with TypeScript for type safety and modern React features (hooks, concurrent rendering)
- **Build System:** Vite for fast development builds and optimized production bundles
- **Routing:** React Router DOM v6 with protected route patterns for role-based access (50+ pages organized by user roles)
- **State Management:** React Context API for global state + TanStack Query for server state caching and synchronization

**UI Component Strategy**
- **Design System:** Shadcn UI (50+ components) built on Radix UI primitives for accessibility
- **Styling Approach:** Tailwind CSS v3 with custom utility classes and design tokens
- **Theme System:** next-themes library providing light/dark mode with persistent user preferences
- **Responsive Design:** Mobile-first approach with breakpoint-based layouts (desktop, tablet, mobile)
- **Icon Library:** Lucide React for consistent iconography

**Rationale:** Shadcn UI was chosen over pre-built component libraries (Material-UI, Ant Design) because it provides full component ownership—components are copied into the project rather than installed as dependencies. This allows complete customization while maintaining accessibility standards through Radix UI primitives.

### Authentication & Authorization

**Role-Based Access Control (RBAC)**
- **User Roles:** Admin, Manager, Field Staff, Viewer (each with distinct UI permissions)
- **Protected Routes:** React Router guards that redirect unauthorized users
- **Session Management:** Authentication state managed through React Context with persistent storage

**Login System Features**
- Real-time form validation with three-layer architecture (client-side, UI feedback, server-side)
- Password strength indicators and error messaging
- Remember me functionality for session persistence

**Pros:** Provides granular permission control suitable for enterprise field operations
**Cons:** Role definitions are currently frontend-based; backend authorization layer needed for production security

### Data Layer Architecture

**Backend Integration Strategy**
- **Database:** Supabase (PostgreSQL) integration referenced in `/supabase/` directory
- **Data Fetching:** TanStack Query (React Query) for caching, background updates, and optimistic UI patterns
- **Real-Time Features:** Supabase real-time subscriptions for live data updates

**Form Validation Architecture**
- Three-layer validation system:
  1. Client-side validation (TypeScript types + runtime checks)
  2. UI validation feedback (real-time error messages)
  3. Server-side validation (Supabase Row-Level Security policies)

**Rationale:** Supabase chosen for built-in authentication, real-time capabilities, and PostgreSQL reliability. TanStack Query reduces boilerplate and provides automatic request deduplication.

**Note:** While Supabase is currently referenced, the architecture supports adding PostgreSQL directly if needed.

### Design System

**Color Architecture**
- **Primary:** Blue-indigo spectrum (`hsl(221.2, 83%, 53.9%)`) for primary actions and branding
- **Secondary:** Orange accents for role badges and field operation features
- **Semantic Colors:** Separate color tokens for success, warning, error, and info states
- **Theme Support:** CSS custom properties enable light/dark mode switching with semantic color mappings

**Typography System**
- **Primary Font:** Inter (system UI font) for body text and UI elements
- **Accent Font:** Plus Jakarta Sans for headings and emphasis
- **Type Scale:** Consistent sizing using Tailwind's typography utilities

**Component Patterns**
- All form elements follow consistent padding, border radius, and focus state patterns
- Consistent spacing system using Tailwind's spacing scale (4px base unit)
- Reusable layout components for card containers, modals, and page shells

### Navigation Structure

**Multi-Level Navigation System**
- **Top Navigation:** Global actions, user profile, notifications
- **Sidebar Navigation:** Role-specific menu items with collapsible sections
- **Breadcrumbs:** Contextual navigation showing user location in app hierarchy
- **Mobile Navigation:** Responsive hamburger menu with slide-out drawer

**Page Organization (50+ Pages)**
- Authentication pages (login, password reset)
- Dashboard pages (role-specific overviews)
- Management pages (employees, operations, workflows)
- Administrative pages (settings, user management, system config)

## External Dependencies

### Third-Party Services

**Supabase Backend**
- **Purpose:** PostgreSQL database hosting, authentication, real-time subscriptions
- **Integration:** REST API + WebSocket connections for real-time features
- **Configuration:** Connection settings in `/supabase/` directory

### NPM Packages

**Core Dependencies**
- `react` + `react-dom` (v18): UI framework
- `react-router-dom` (v6): Client-side routing
- `@tanstack/react-query`: Server state management and caching
- `@radix-ui/*`: Accessible UI primitives (20+ packages for modals, dropdowns, etc.)
- `tailwindcss` (v3): Utility-first CSS framework
- `next-themes`: Theme management (light/dark mode)
- `lucide-react`: Icon library
- `@octokit/rest`: GitHub API integration for repository management

**Build Tools**
- `vite`: Development server and production bundler
- `typescript`: Type checking and compilation
- `@vitejs/plugin-react`: Vite React plugin with Fast Refresh

**Rationale for Key Choices:**
- **Vite over Create React App:** 10-100x faster development builds, native ESM support
- **TanStack Query over Redux:** Specialized for async data, less boilerplate, automatic caching
- **Shadcn UI over Material-UI:** Full component ownership, smaller bundle size, better customization

### Database Schema

**Supabase PostgreSQL Tables** (referenced in codebase)
- User management tables (authentication, roles, permissions)
- Employee records (field staff, managers)
- Operation tracking (MMPs, workflows, tasks)
- Audit logs (activity tracking, change history)

**Row-Level Security (RLS):** PostgreSQL policies enforce authorization at database level, ensuring frontend role checks are backed by server-side security.