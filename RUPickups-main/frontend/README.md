# RU Pickups Frontend

## Overview

The RU Pickups frontend is built with **React Native**, **Expo**, and **Expo Router**. It provides the user interface for authentication, profile completion, browsing lobbies, creating games, and accessing the main features of the platform.

The frontend communicates with two primary external services:

* the **RU Pickups FastAPI backend** for application data
* **Supabase Auth** for user authentication and session management

The project is organized to separate routing, screens, reusable components, API utilities, and shared configuration so the codebase remains maintainable as the application grows.

---

# Frontend Architecture

The frontend follows a **screen-driven architecture** centered around Expo Router.

High-level flow:

Client Interface
↓
Expo Router Screens
↓
API Utility Layer
↓
Supabase Auth and FastAPI Backend

This means:

* **screens** handle user interaction and rendering
* **layout files** control navigation structure and route protection
* **API utilities** handle backend and authentication connections
* **components** provide reusable UI elements across the app

---

# Project Structure

```
frontend/
│
├── app/
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── signup.tsx
│   ├── complete-profile.tsx
│   ├── view-profile.tsx
│   ├── contact-us.tsx
│   ├── user-guide.tsx
│   ├── lobby/
│   │   └── [id].tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── lobbies.tsx
│       ├── leaderboard.tsx
│       ├── my-games.tsx
│       └── explore.tsx
│
├── api/
│   ├── backend.ts
│   └── supabase.ts
│
├── components/
│   ├── sidebar.tsx
│   ├── haptic-tab.tsx
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   └── ui/
│
├── constants/
│   └── theme.ts
│
├── hooks/
├── assets/
├── package.json
└── tsconfig.json
```

---

# Entry Point and Root Layout

## `app/_layout.tsx`

This file acts as the root layout for the entire application. Since the project uses **Expo Router**, it serves as the top-level controller for routing, theming, and authentication-aware navigation.

Its responsibilities include:

* wrapping the app in `SafeAreaProvider`
* applying light or dark theme support
* retrieving the current Supabase session
* listening for authentication state changes
* checking whether a user has a completed backend profile
* redirecting users to the correct screen based on authentication and profile state

This file controls the overall access flow of the app and ensures that users are sent to login, complete-profile, or the main tab area when appropriate.

---

# Navigation System

The project uses **Expo Router**, which provides file-based routing. Routes are defined by the folder and file structure inside the `app/` directory.

This makes navigation easier to organize and scale because each screen is represented directly by a file.

---

## Tab Navigation

## `app/(tabs)/_layout.tsx`

This file defines the navigation structure for the authenticated portion of the application.

It is responsible for:

* rendering the bottom tab navigator
* configuring the tab screens
* displaying the top app bar
* displaying the RU Pickups logo
* providing access to the sidebar drawer
* managing the open and close behavior of the custom side menu

The tab area represents the main application shell after the user has successfully logged in and completed their profile.

---

# Authentication and Onboarding Flow

The authentication flow is separated across dedicated screens.

## `app/login.tsx`

Responsible for:

* email and password login
* input validation
* displaying authentication errors
* verifying that the authenticated user has a backend profile
* routing the user into the main app after successful login

## `app/signup.tsx`

Responsible for:

* email and password sign-up through Supabase
* client-side input validation
* displaying success and error feedback
* redirecting newly registered users into the profile completion flow

## `app/complete-profile.tsx`

Responsible for:

* collecting application-specific profile data
* saving the user profile to the backend
* finalizing onboarding before the user enters the main tab area

Together, these screens implement a two-step identity flow:

1. authentication through Supabase
2. application profile creation through the RU Pickups backend

---

# API Layer

The `api/` folder contains the files responsible for external service communication.

## `api/backend.ts`

This file manages communication with the FastAPI backend.

Its responsibilities include:

* resolving the correct backend base URL depending on platform
* supporting separate backend URLs for web and Android development
* retrieving the current access token from Supabase
* providing an authenticated fetch helper for protected backend endpoints

This keeps backend communication centralized and prevents repeated authentication logic across screens.

## `api/supabase.ts`

This file initializes the Supabase client used throughout the frontend.

Its responsibilities include:

* connecting the app to Supabase
* enabling sign-up and login
* handling session access
* supporting authentication state tracking

This allows the rest of the application to reuse a single auth client rather than re-creating it in different screens.

---

# Screen Layer

The `app/` directory contains the user-facing screens of the application.

These screens are responsible for:

* rendering the visual interface
* collecting form input
* displaying loading and error states
* calling API utilities
* navigating between routes

The screen layer is divided into:

* authentication and onboarding screens
* main tab screens
* detail screens
* secondary information screens

This structure keeps the app organized around user workflows.

---

# Reusable Components

Reusable UI elements are stored in the `components/` and `components/ui/` directories.

These components support consistency across the app and reduce repeated code by centralizing shared interface elements such as:

* sidebar behavior
* tab interactions
* themed wrappers
* icons
* utility UI components

This allows screens to focus on feature behavior rather than duplicating shared visual logic.

---

# Theme and Hooks

Cross-cutting frontend logic is separated into the `constants/` and `hooks/` folders.

These files support:

* shared theme values
* color scheme detection
* theme-based styling behavior
* reusable UI state logic

This keeps styling concerns and shared behavior modular rather than embedding them directly into each screen.

---

# Environment Variables

The frontend uses the following environment variables:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

EXPO_PUBLIC_API_BASE_URL_WEB=http://localhost:8000
EXPO_PUBLIC_API_BASE_URL_ANDROID=http://10.0.2.2:8000
```

These variables allow the frontend to connect to Supabase and the FastAPI backend across different platforms and development environments.

---

# Running the Frontend

Install dependencies:

```
npm install
```

Start the Expo development server:

```
npm run start
```

Run on Android:

```
npm run android
```

Run on iOS:

```
npm run ios
```

Run on web:

```
npm run web
```

---

# Frontend Testing

Install dependencies and run tests:

```
npm install
npm run test
```

Run with coverage:

```
npm run coverage
```

Run in watch mode while developing:

```
npm run test:watch
```

Target a single test file:

```
npm test -- layout-auth-routing.test.tsx
```

What these tests cover first:

* auth/session routing guard behavior in `app/_layout.tsx`
* login validation + success path in `app/login.tsx`
* authenticated backend fetch helpers and private-lobby unlock token handling in `api/`

Coverage notes:

* Jest coverage output is written to `frontend/coverage/`
* The suite enforces a global minimum threshold (70% for lines/statements/functions)

---

# Technology Stack

Frontend framework
React Native

App platform
Expo

Routing
Expo Router

Authentication
Supabase Auth

Navigation
React Navigation / Expo Router Tabs

Language
TypeScript

Backend communication
Fetch API

---

# Design Goals

The frontend architecture was designed to:

* separate routing from screen logic
* centralize backend and authentication setup
* keep onboarding and authenticated flows clear
* support reusable UI components
* make feature screens easier to maintain and extend
* support multiple development platforms through environment-based configuration

This structure provides a scalable foundation for continued growth of the RU Pickups application.