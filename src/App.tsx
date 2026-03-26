/// <reference types="vite/client" />
import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Plane, Train, Navigation, Trash2, Map as MapIcon, ChevronRight, Loader2, Maximize2, ArrowLeft, Clock, Gauge, Sparkles, Hotel, Palmtree, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import { BrowserRouter as Router, Routes, Route, useNavigate, Link } from 'react-router-dom';
import L from 'leaflet';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Fix Leaflet marker icon issue
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Waypoint {
  id: string;
  type: 'start' | 'airport' | 'station' | 'hotel' | 'resort' | 'restaurant' | 'destination';
  label: string;
  value: string;
  description?: string;
  day?: number;
  coords?: [number, number];
}

// Component to handle map view updates
function MapUpdater({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

export default function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { id: '1', type: 'start', label: 'Starting Point', value: 'Empire State Building, New York', day: 1 },
    { id: 'airport-test', type: 'airport', label: 'Airport Station', value: 'JFK Airport, New York', day: 1 },
    { id: '2', type: 'destination', label: 'Final Destination', value: 'Central Park, New York', day: 1 }
  ]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [tripStats, setTripStats] = useState<{ 
    distance: number; 
    duration: number;
    segments: { from: string; to: string; duration: number; distance: number; isFlight: boolean; coords: [number, number][] }[]
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [isAiPlanning, setIsAiPlanning] = useState(false);

  const handleAiPlan = async (prompt: string) => {
    setIsAiPlanning(true);
    try {
      // 1. Get current location if possible
      let currentLocation = "My Current Location";
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const revResponse = await fetch(`/api/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
        const revData = await revResponse.json();
        currentLocation = revData.display_name || `${pos.coords.latitude}, ${pos.coords.longitude}`;
      } catch (e) {
        console.warn("Could not get current location, using default", e);
      }

      // 2. Call Gemini to plan the route
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Plan a travel route based on this request: "${prompt}". 
        Use "${currentLocation}" as the starting point UNLESS the request specifies a different origin.
        
        If the trip spans multiple days:
        1. Plan the route day by day.
        2. For every day EXCEPT the final day of travel, the day MUST end with the person returning to their hotel or resort.
        3. Include activities like dining, sightseeing (parks, museums), and transit.
        
        Include ALL necessary transit hubs (airports, train stations), accommodations, dining, and major stops. 
        If it's a multi-leg trip, include all intermediate stops.
        For international travel, always include the departure airport and arrival airport.
        
        Return a JSON array of waypoints. Each waypoint should have:
        - day: The day number (starting from 1).
        - type: "start", "airport", "station", "hotel", "resort", "restaurant", or "destination"
        - label: A short descriptive label (e.g., "Home", "JFK Airport", "Lunch at Sushi Dai", "Stay at Hilton Tokyo", "Eiffel Tower")
        - value: The full address or name of the place for geocoding.
        - latitude: The precise latitude of the location.
        - longitude: The precise longitude of the location.
        - description: A brief explanation of why this stop was chosen or what to do there.
        
        The first waypoint MUST be type "start" and the last MUST be type "destination".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                type: { type: Type.STRING, enum: ["start", "airport", "station", "hotel", "resort", "restaurant", "destination"] },
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                latitude: { type: Type.NUMBER },
                longitude: { type: Type.NUMBER },
                description: { type: Type.STRING }
              },
              required: ["day", "type", "label", "value", "latitude", "longitude", "description"]
            }
          }
        }
      });

      const plan = JSON.parse(response.text);
      const newWaypoints = plan.map((p: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        day: p.day,
        type: p.type,
        label: p.label,
        value: p.value,
        description: p.description,
        coords: [p.latitude, p.longitude]
      }));

      setWaypoints(newWaypoints);
      handleGenerate(newWaypoints);
    } catch (error) {
      console.error("AI Planning error:", error);
      alert("Magic Planner encountered an error. Please try again.");
    } finally {
      setIsAiPlanning(false);
    }
  };

  const geocode = async (query: string): Promise<[number, number] | undefined> => {
    if (!query.trim()) return undefined;
    try {
      // Call our Express proxy instead of Nominatim directly to avoid CORS and User-Agent issues
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Geocoding failed: ${errorData.error || response.statusText || response.status}`);
      }
      const data = await response.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      // Optional: Show a toast or alert if this is a critical failure
    }
    return undefined;
  };

  const handleGenerate = useCallback(async (currentWaypoints: Waypoint[]) => {
    setIsGeocoding(true);
    const updatedWaypoints: Waypoint[] = [];
    
    // 1. Geocode all waypoints
    for (const w of currentWaypoints) {
      if (w.value && !w.coords) {
        const coords = await geocode(w.value);
        updatedWaypoints.push({ ...w, coords });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        updatedWaypoints.push(w);
      }
    }
    
    setWaypoints(updatedWaypoints);
    const validWaypoints = updatedWaypoints.filter(w => w.coords);
    
    if (updatedWaypoints.some(w => w.value && !w.coords)) {
      alert("Some locations could not be found. Please check the addresses and try again.");
    }

    if (validWaypoints.length > 1) {
      let totalDistance = 0;
      let totalDuration = 0;
      let allCoords: [number, number][] = [];
      const segments: { from: string; to: string; duration: number; distance: number; isFlight: boolean; coords: [number, number][] }[] = [];

      // Calculate route in segments
      for (let i = 0; i < validWaypoints.length - 1; i++) {
        const start = validWaypoints[i].coords!;
        const end = validWaypoints[i+1].coords!;
        const fromLabel = validWaypoints[i].label || validWaypoints[i].value;
        const toLabel = validWaypoints[i+1].label || validWaypoints[i+1].value;
        const isFlight = validWaypoints[i].type === 'airport' && validWaypoints[i+1].type === 'airport';
        
        if (isFlight) {
          // Use straight line for flights but exclude from ground trip stats
          const segmentCoords: [number, number][] = [start, end];
          allCoords = [...allCoords, ...segmentCoords];
          const dist = L.latLng(start).distanceTo(L.latLng(end));
          segments.push({
            from: fromLabel,
            to: toLabel,
            duration: (dist / 1000) / 800 * 3600,
            distance: dist,
            isFlight: true,
            coords: segmentCoords
          });
        } else {
          // Attempt OSRM routing for land segments
          try {
            const coordsString = `${start[1]},${start[0]};${end[1]},${end[0]}`;
            const response = await fetch(`/api/route?coords=${coordsString}`);
            
            if (response.ok) {
              const data = await response.json();
              if (data.routes && data.routes.length > 0) {
                const segmentCoords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                allCoords = [...allCoords, ...segmentCoords];
                const dist = data.routes[0].distance;
                const dur = data.routes[0].duration;
                totalDistance += dist;
                totalDuration += dur;
                segments.push({
                  from: fromLabel,
                  to: toLabel,
                  duration: dur,
                  distance: dist,
                  isFlight: false,
                  coords: segmentCoords
                });
              } else {
                throw new Error('No route found');
              }
            } else {
              throw new Error('Routing failed');
            }
          } catch (error) {
            // Fallback to straight line if OSRM fails
            console.warn(`Segment ${i} routing failed, using straight line:`, error);
            const segmentCoords: [number, number][] = [start, end];
            allCoords = [...allCoords, ...segmentCoords];
            const dist = L.latLng(start).distanceTo(L.latLng(end));
            const dur = (dist / 1000) / 80 * 3600; // 80 km/h estimate
            totalDistance += dist;
            totalDuration += dur;
            segments.push({
              from: fromLabel,
              to: toLabel,
              duration: dur,
              distance: dist,
              isFlight: false,
              coords: segmentCoords
            });
          }
        }
      }

      setRouteCoords(allCoords);
      setTripStats({
        distance: totalDistance,
        duration: totalDuration,
        segments
      });
    } else {
      setRouteCoords(validWaypoints.map(w => w.coords!));
      setTripStats(null);
    }
    
    setIsGeocoding(false);
  }, []);

  // Initial generation on mount
  useEffect(() => {
    handleGenerate(waypoints);
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/20">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
        </div>

        <Routes>
          <Route path="/" element={
            <Home 
              waypoints={waypoints} 
              setWaypoints={setWaypoints}
              isGeocoding={isGeocoding}
              isAiPlanning={isAiPlanning}
              routeCoords={routeCoords}
              tripStats={tripStats}
              handleGenerate={handleGenerate}
              handleAiPlan={handleAiPlan}
            />
          } />
          <Route path="/route" element={
            <FullRoute 
              waypoints={waypoints}
              tripStats={tripStats}
            />
          } />
        </Routes>
      </div>
    </Router>
  );
}

function Home({ waypoints, setWaypoints, isGeocoding, isAiPlanning, routeCoords, tripStats, handleGenerate, handleAiPlan }: any) {
  const navigate = useNavigate();
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedSummaryDay, setSelectedSummaryDay] = useState<number>(1);

  const days = Array.from(new Set(waypoints.map((w: any) => w.day || 1))).sort((a: number, b: number) => a - b);

  const dayStats = useMemo(() => {
    if (!tripStats) return null;
    
    const daySegments = tripStats.segments.filter((_: any, idx: number) => {
      // Segment i is between waypoints[i] and waypoints[i+1]
      // We attribute the segment to the day of the destination waypoint
      return (waypoints[idx + 1]?.day || 1) === selectedSummaryDay;
    });

    const distance = daySegments.reduce((acc: number, s: any) => acc + (s.isFlight ? 0 : s.distance), 0);
    const duration = daySegments.reduce((acc: number, s: any) => acc + (s.isFlight ? 0 : s.duration), 0);

    return {
      distance,
      duration,
      segments: daySegments
    };
  }, [tripStats, selectedSummaryDay, waypoints]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const calculateSpeed = (distance: number, duration: number) => {
    // distance is in meters, duration in seconds
    // km/h = (m / 1000) / (s / 3600)
    const speed = (distance / 1000) / (duration / 3600);
    return Math.round(speed);
  };

  const addWaypoint = (type: Waypoint['type']) => {
    const labels: Record<string, string> = {
      airport: 'Airport',
      station: 'Station',
      hotel: 'Hotel',
      resort: 'Resort',
      restaurant: 'Dining'
    };
    const newWaypoint: Waypoint = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      label: labels[type] || (type.charAt(0).toUpperCase() + type.slice(1)),
      value: '',
      description: '',
      day: waypoints[waypoints.length - 1]?.day || 1
    };
    const newWaypoints = [...waypoints];
    newWaypoints.splice(newWaypoints.length - 1, 0, newWaypoint);
    setWaypoints(newWaypoints);
  };

  const removeWaypoint = (id: string) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((w: any) => w.id !== id));
  };

  const updateWaypoint = (id: string, value: string) => {
    setWaypoints(waypoints.map((w: any) => w.id === id ? { ...w, value, coords: undefined } : w));
  };

  const getIcon = (type: Waypoint['type']) => {
    switch (type) {
      case 'start': return <MapPin className="w-4 h-4" />;
      case 'airport': return <Plane className="w-4 h-4" />;
      case 'station': return <Train className="w-4 h-4" />;
      case 'hotel': return <Hotel className="w-4 h-4" />;
      case 'resort': return <Palmtree className="w-4 h-4" />;
      case 'restaurant': return <Utensils className="w-4 h-4" />;
      case 'destination': return <Navigation className="w-4 h-4" />;
      default: return <MapPin className="w-4 h-4" />;
    }
  };

  return (
    <main className="relative z-10 flex flex-col items-center min-h-screen">
      {/* Waypoints Section - Top */}
      <div className="w-full max-w-2xl px-6 pt-24 pb-12">
        <div className="bg-black/40 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl overflow-hidden">
          <header className="p-8 border-b border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <MapIcon className="w-4 h-4 text-black" />
              </div>
              <h1 className="text-2xl font-light tracking-tight italic serif">Voyageur</h1>
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-medium">Open Source Travel Planner</p>
          </header>

          {/* Magic AI Planner Section */}
          <div className="p-8 bg-white/5 border-b border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/60">Magic AI Planner</h3>
            </div>
            <div className="relative">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Where do you want to go? (e.g., 'I want to go to Tokyo for a week')"
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-white/40 transition-colors placeholder:text-white/10 min-h-[100px] resize-none"
              />
              <button
                onClick={() => {
                  handleAiPlan(aiPrompt);
                  setAiPrompt("");
                }}
                disabled={isAiPlanning || !aiPrompt.trim()}
                className="absolute bottom-4 right-4 p-2 rounded-full bg-white text-black hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isAiPlanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="mt-3 text-[10px] text-white/20 italic">
              AI will automatically detect your current location and plan transit hubs if needed.
            </p>
          </div>

          <div className="p-8 space-y-8">
            <div className="space-y-8">
              <AnimatePresence initial={false}>
                {Array.from(new Set(waypoints.map(w => w.day || 1))).sort((a: number, b: number) => a - b).map(day => (
                  <div key={`day-${day}`} className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/20">Day {day}</span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    {waypoints.filter(w => (w.day || 1) === day).map((waypoint: any, idx: number) => {
                      const globalIndex = waypoints.findIndex(w => w.id === waypoint.id);
                      return (
                        <motion.div
                          key={waypoint.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="relative group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center gap-1">
                              <div className="relative">
                                <div className={`w-8 h-8 rounded-full border border-white/20 flex items-center justify-center bg-black transition-colors group-focus-within:border-white/60 ${waypoint.coords ? 'border-emerald-500/50 text-emerald-400' : ''}`}>
                                  {getIcon(waypoint.type)}
                                </div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-black text-[8px] font-bold flex items-center justify-center shadow-lg">
                                  {idx + 1}
                                </div>
                              </div>
                              {globalIndex < waypoints.length - 1 && (
                                <div className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent" />
                              )}
                            </div>
                            
                            <div className="flex-1 space-y-1">
                              <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                                {waypoint.label}
                              </label>
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  value={waypoint.value}
                                  onChange={(e) => updateWaypoint(waypoint.id, e.target.value)}
                                  placeholder={`Enter ${waypoint.type}...`}
                                  className="w-full bg-transparent border-b border-white/10 py-2 text-sm focus:outline-none focus:border-white/40 transition-colors placeholder:text-white/10"
                                />
                                {globalIndex !== 0 && globalIndex !== waypoints.length - 1 && (
                                  <button
                                    onClick={() => removeWaypoint(waypoint.id)}
                                    className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {waypoint.description && (
                                <p className="text-[10px] text-white/40 italic mt-1 leading-relaxed">
                                  {waypoint.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
              </AnimatePresence>
            </div>

            <div className="pt-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-2">Add Transit & Stay</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => addWaypoint('airport')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Plane className="w-3 h-3 text-white/60 group-hover:text-white" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Airport</span>
                </button>
                <button
                  onClick={() => addWaypoint('station')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Train className="w-3 h-3 text-white/60 group-hover:text-white" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Station</span>
                </button>
                <button
                  onClick={() => addWaypoint('hotel')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Hotel className="w-3 h-3 text-white/60 group-hover:text-white" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Hotel</span>
                </button>
                <button
                  onClick={() => addWaypoint('resort')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Palmtree className="w-3 h-3 text-white/60 group-hover:text-white" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Resort</span>
                </button>
                <button
                  onClick={() => addWaypoint('restaurant')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Utensils className="w-3 h-3 text-white/60 group-hover:text-white" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Dining</span>
                </button>
              </div>
            </div>

            <button 
              onClick={() => handleGenerate(waypoints)}
              disabled={isGeocoding || !waypoints[0].value || !waypoints[waypoints.length-1].value}
              className="w-full py-5 rounded-full bg-white text-black font-semibold text-sm tracking-tight hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl"
            >
              {isGeocoding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Geocoding...
                </>
              ) : (
                <>
                  Generate Itinerary
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            {tripStats && !isGeocoding && dayStats && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-4"
              >
                <div className="p-6 rounded-[24px] bg-white/5 border border-white/10 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Navigation className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-white/60">Ground Trip Summary</h4>
                    </div>
                    {days.length > 1 && (
                      <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
                        {days.map((day: any) => (
                          <button
                            key={day}
                            onClick={() => setSelectedSummaryDay(day)}
                            className={`px-3 py-1 rounded-full text-[9px] uppercase tracking-widest font-bold transition-all ${
                              selectedSummaryDay === day 
                                ? 'bg-white text-black' 
                                : 'text-white/40 hover:text-white'
                            }`}
                          >
                            D{day}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-8">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-white/30">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Ground Time</span>
                      </div>
                      <p className="text-2xl font-light italic serif text-white">{formatDuration(dayStats.duration)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-white/30">
                        <Gauge className="w-3 h-3" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Speed</span>
                      </div>
                      <p className="text-2xl font-light italic serif text-white">{calculateSpeed(dayStats.distance, dayStats.duration)} <span className="text-xs italic opacity-40">km/h</span></p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-white/30">
                        <MapIcon className="w-3 h-3" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Ground Dist</span>
                      </div>
                      <p className="text-2xl font-light italic serif text-white">{(dayStats.distance / 1000).toFixed(1)} <span className="text-xs italic opacity-40">km</span></p>
                    </div>
                  </div>

                  {dayStats.segments.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/20">Day {selectedSummaryDay} Segments</p>
                      <div className="space-y-3">
                        {dayStats.segments.map((segment: any, idx: number) => (
                          <div key={idx} className="flex items-start justify-between gap-4 group/seg">
                            <div className="flex-1">
                              <p className="text-[11px] text-white/60 leading-relaxed">
                                <span className="text-white font-medium">{segment.from}</span>
                                <span className="mx-2 text-white/20">→</span>
                                <span className="text-white font-medium">{segment.to}</span>
                              </p>
                              {segment.isFlight && (
                                <span className="text-[8px] uppercase tracking-widest font-bold text-emerald-500/60 mt-1 block">Flight Segment</span>
                              )}
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <p className="text-xs font-medium text-white">{formatDuration(segment.duration)}</p>
                              <p className="text-[9px] text-white/20">{(segment.distance / 1000).toFixed(1)} km</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Map Section - Bottom */}
      <div className="w-full flex flex-col items-center py-24 bg-gradient-to-b from-transparent to-black/40">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.4em] text-white/20 font-bold mb-2">Visualized Journey</p>
          <h2 className="text-4xl font-light italic serif">Your Route Preview</h2>
        </div>

        <div className="relative flex items-center gap-8">
          {/* Map Bubble Block */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="w-[600px] h-[600px] rounded-[60px] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)] bg-black/40 backdrop-blur-sm relative group"
          >
            <MapContainer 
              center={[40.7128, -74.0060]} 
              zoom={12} 
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
              className="w-full h-full grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-1000"
              style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {waypoints.map((w: any, index: number) => w.coords && (
                <Marker key={w.id} position={w.coords}>
                  <Tooltip 
                    permanent 
                    direction={index % 2 === 0 ? "top" : "bottom"} 
                    offset={index % 2 === 0 ? [0, -10] : [0, 10]}
                    className="!bg-black/80 !border-white/10 !text-white !rounded-full !px-3 !py-1 !text-[9px] !uppercase !tracking-widest !font-bold !shadow-xl !backdrop-blur-md !border-0"
                  >
                    {(w.label || w.value).length > 12 ? (w.label || w.value).substring(0, 10) + '..' : (w.label || w.value)}
                  </Tooltip>
                </Marker>
              ))}
              {routeCoords.length > 1 && (
                <Polyline 
                  positions={routeCoords} 
                  color="#10b981" 
                  weight={3} 
                  opacity={0.6} 
                  dashArray="10, 10"
                />
              )}
              <MapUpdater coords={routeCoords} />
            </MapContainer>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-12 left-12">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40 font-bold mb-1">Interactive</p>
              <h3 className="text-2xl font-light italic serif">Live Journey Map</h3>
            </div>
          </motion.div>

          {/* Action Button Beside It */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            onClick={() => navigate('/route')}
            className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform shadow-2xl group"
          >
            <Maximize2 className="w-10 h-10 group-hover:rotate-12 transition-transform" />
          </motion.button>
        </div>
      </div>
    </main>
  );
}

function FullRoute({ waypoints, tripStats }: any) {
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const days = Array.from(new Set(waypoints.map((w: any) => w.day || 1))).sort((a: number, b: number) => a - b);
  
  const dayRouteCoords = useMemo(() => {
    if (!tripStats) return [];
    const daySegments = tripStats.segments.filter((_: any, idx: number) => {
      return (waypoints[idx + 1]?.day || 1) === selectedDay;
    });
    return daySegments.flatMap((s: any) => s.coords);
  }, [tripStats, selectedDay, waypoints]);

  const filteredWaypoints = waypoints.filter((w: any) => (w.day || 1) === selectedDay);

  return (
    <div className="relative h-screen w-full bg-[#0a0a0a]">
      <Link 
        to="/"
        className="absolute top-8 left-8 z-[1000] flex items-center gap-3 px-6 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-black/60 transition-all group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs uppercase tracking-widest font-bold">Back to Planner</span>
      </Link>

      {/* Day Selector */}
      {days.length > 1 && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 p-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
          {days.map((day: any) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.2em] font-bold transition-all ${
                selectedDay === day 
                  ? 'bg-white text-black shadow-lg' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              Day {day}
            </button>
          ))}
        </div>
      )}

      <MapContainer 
        center={[40.7128, -74.0060]} 
        zoom={12} 
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ height: '100%', width: '100%', minHeight: '100vh', background: '#0a0a0a' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredWaypoints.map((w: any, index: number) => w.coords && (
          <Marker 
            key={w.id} 
            position={w.coords}
            icon={L.divIcon({
              className: 'custom-div-icon',
              html: `
                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black border-2 border-emerald-500 shadow-2xl font-bold text-[11px] tracking-tighter">
                  ${index + 1}
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
          >
            <Tooltip 
              permanent 
              direction={index % 2 === 0 ? "top" : "bottom"} 
              offset={index % 2 === 0 ? [0, -20] : [0, 20]}
              className="!bg-black/80 !border-white/10 !text-white !rounded-full !px-3 !py-1 !text-[9px] !uppercase !tracking-widest !font-bold !shadow-xl !backdrop-blur-md !border-0"
            >
              {(w.label || w.value).length > 15 ? (w.label || w.value).substring(0, 12) + '..' : (w.label || w.value)}
            </Tooltip>
            <Popup>
              <div className="text-black font-sans">
                <p className="font-bold text-xs uppercase tracking-wider">{w.label}</p>
                <p className="text-sm">{w.value}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {dayRouteCoords.length > 1 && (
          <Polyline 
            positions={dayRouteCoords} 
            color="#10b981" 
            weight={4} 
            opacity={0.8} 
            dashArray="10, 10"
          />
        )}
        <MapUpdater coords={dayRouteCoords.length > 0 ? dayRouteCoords : (filteredWaypoints.filter((w: any) => w.coords).map((w: any) => w.coords!) as [number, number][])} />
      </MapContainer>
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.7)] z-[999]" />
    </div>
  );
}
