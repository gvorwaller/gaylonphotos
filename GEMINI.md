# Project: Gaylon Photos

This file provides a comprehensive overview of the Gaylon Photos project for Gemini.

## Project Overview

Gaylon Photos is a multi-collection photography showcase built with SvelteKit, featuring server-side rendering (SSR) via `@sveltejs/adapter-node`. The application is designed to display various types of photo collections, including `travel`, `wildlife`, and `action`, each with a unique, type-specific component set.

The project is currently in the initial development phase, with no production-ready source code yet. The architecture is well-documented, and the data structure is scaffolded with JSON files.

## Key Technologies & Architecture

- **Framework**: SvelteKit
- **Backend**: Node.js
- **Persistence**: JSON files for all data, including collections, photo metadata, and admin credentials.
- **Photo Storage**: Digital Ocean Spaces for cloud-based photo storage and CDN.
- **Authentication**: A simple, single-admin authentication system with session management.
- **Mapping**: Google Maps API for geotagging and displaying photo locations.

### Data Model

The data is organized into a series of JSON files located in the `data/` directory:
- `data/collections.json`: A registry of all photo collections.
- `data/{collection-slug}/photos.json`: Photo metadata for each collection.
- `data/{collection-slug}/itinerary.json`: Itinerary information for `travel` collections.
- `data/admin.json`: Stores the admin user's hashed password.

### Component-Driven UI

The frontend is designed to be highly component-based, with different component sets for each collection type. This allows for a tailored user experience for each photo collection.

## Building and Running the Project

The following commands are intended for building, running, and managing the application:

- **Development Server**: `npm run dev`
- **Production Build**: `npm run build` followed by `node build/index.js`
- **Admin Setup**: `node scripts/setup-admin.js` to create admin credentials.
- **Photo Ingestion**: `node scripts/ingest-photos.js <collection-slug> <folder-path>` for bulk photo imports.

## Development Conventions

- **Styling**: All CSS is hand-written and component-scoped using Svelte's `<style>` blocks. No CSS frameworks like Tailwind are used. The styling follows the "BTC Dashboard" pattern, which emphasizes clean, card-based layouts and a consistent color scheme.
- **Task Management**: The `td` command-line tool is used for task management. Run `td usage --new-session` at the beginning of each session to review the current work.

### Environment Variables

The project requires the following environment variables to be set in a `.env` file:

- `PUBLIC_GOOGLE_MAPS_API_KEY`: For Google Maps integration.
- `SPACES_KEY`, `SPACES_SECRET`, `SPACES_BUCKET`, `SPACES_REGION`, `SPACES_ENDPOINT`, `SPACES_CDN_URL`: For Digital Ocean Spaces.
- `AUTH_SECRET`: A secret key for signing authentication cookies.

## Important Project Documentation

- `docs/DESIGN_SPEC.md`: The primary design and implementation contract.
- `docs/ARCHITECTURE.md`: A summary of the project's architecture.
- `docs/PROJECT_VISION.md`: The project's high-level goals and user-facing requirements.
