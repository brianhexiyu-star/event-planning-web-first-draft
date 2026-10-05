# Voyageur Travel Planner

An AI-assisted travel planning web application built with React, TypeScript, Vite, Express, Gemini, Leaflet, and OpenStreetMap-based services.

The project combines natural-language trip planning with interactive maps. A user can describe a trip, generate structured waypoints with Gemini, geocode locations, calculate routes, and visualize the journey.

## Features

- Natural-language AI travel planning
- Gemini-generated itineraries
- Multi-day waypoint planning
- Browser geolocation support
- Forward and reverse geocoding
- Interactive Leaflet map
- Route visualization
- Distance and duration calculations
- Airport and flight segment handling
- Hotel, restaurant, station, and destination waypoint types
- Animated React interface
- Express proxy for map services

## Tech Stack

- React 19
- TypeScript
- Vite
- Express
- Google Gemini API
- Leaflet and React Leaflet
- OpenStreetMap / Nominatim
- OSRM
- React Router
- Tailwind CSS
- Motion
- Lucide React

## How It Works

~~~text
User request
    ↓
Gemini travel planner
    ↓
Structured waypoints
    ↓
Geocoding
    ↓
Route calculation
    ↓
Interactive map and trip statistics
~~~

Gemini is asked to return structured waypoint data containing the day, type, label, location, coordinates, and description.

## Map Services

The Express server provides:

~~~text
GET /api/geocode
GET /api/reverse
GET /api/route
~~~

These proxies keep external map requests behind the local server and handle Nominatim request requirements.

## Running Locally

~~~bash
npm install
npm run dev
~~~

Provide a Gemini API key through a local environment file or deployment secret.

The development server runs on port 3000.

Build and preview:

~~~bash
npm run build
npm run preview
~~~

## Development Notes

Airport-to-airport segments are handled differently from ordinary ground routes so flight legs can be represented visually without treating them as road journeys.

## Status

Prototype / first draft.