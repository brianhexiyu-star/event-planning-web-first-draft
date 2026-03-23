/// <reference types="vite/client" />
import { useState, useEffect, useCallback } from 'react';
import { MapPin, Plane, Train, Navigation, Trash2, Map as MapIcon, ChevronRight, Loader2, Maximize2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import { BrowserRouter as Router, Routes, Route, useNavigate, Link } from 'react-router-dom';
import L from 'leaflet';

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
  type: 'start' | 'airport' | 'train' | 'subway' | 'destination';
  label: string;
  value: string;
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
    { id: '1', type: 'start', label: 'Starting Point', value: 'Empire State Building, New York' },
    { id: 'airport-test', type: 'airport', label: 'Airport Station', value: 'JFK Airport, New York' },
    { id: 'train-test', type: 'train', label: 'Train Station', value: 'Penn Station, New York' },
    { id: 'subway-test', type: 'subway', label: 'Subway Station', value: 'Times Square-42 St, New York' },
    { id: '2', type: 'destination', label: 'Final Destination', value: 'Central Park, New York' }
  ]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  const geocode = async (query: string): Promise<[number, number] | undefined> => {
    if (!query.trim()) return undefined;
    try {
      // Call our Express proxy instead of Nominatim directly to avoid CORS and User-Agent issues
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return undefined;
  };

  const handleGenerate = useCallback(async (currentWaypoints: Waypoint[]) => {
    setIsGeocoding(true);
    const updatedWaypoints: Waypoint[] = [];
    
    // Process sequentially with a small delay to respect Nominatim's 1 req/sec limit
    for (const w of currentWaypoints) {
      if (w.value && !w.coords) {
        const coords = await geocode(w.value);
        updatedWaypoints.push({ ...w, coords });
        // Wait 1 second before next request if not the last one
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        updatedWaypoints.push(w);
      }
    }
    
    setWaypoints(updatedWaypoints);
    const validCoords = updatedWaypoints
      .map(w => w.coords)
      .filter((c): c is [number, number] => c !== undefined);
    
    setRouteCoords(validCoords);
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
              routeCoords={routeCoords}
              handleGenerate={handleGenerate}
            />
          } />
          <Route path="/route" element={
            <FullRoute 
              waypoints={waypoints}
              routeCoords={routeCoords}
            />
          } />
        </Routes>
      </div>
    </Router>
  );
}

function Home({ waypoints, setWaypoints, isGeocoding, routeCoords, handleGenerate }: any) {
  const navigate = useNavigate();

  const addWaypoint = (type: Waypoint['type']) => {
    const newWaypoint: Waypoint = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1) + ' Station',
      value: ''
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
    setWaypoints(waypoints.map((w: any) => w.id === id ? { ...w, value } : w));
  };

  const getIcon = (type: Waypoint['type']) => {
    switch (type) {
      case 'start': return <MapPin className="w-4 h-4" />;
      case 'airport': return <Plane className="w-4 h-4" />;
      case 'train': return <Train className="w-4 h-4" />;
      case 'subway': return <Train className="w-4 h-4" />;
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

          <div className="p-8 space-y-8">
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {waypoints.map((waypoint: any, index: number) => (
                  <motion.div
                    key={waypoint.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full border border-white/20 flex items-center justify-center bg-black transition-colors group-focus-within:border-white/60 ${waypoint.coords ? 'border-emerald-500/50 text-emerald-400' : ''}`}>
                          {getIcon(waypoint.type)}
                        </div>
                        {index < waypoints.length - 1 && (
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
                          {index !== 0 && index !== waypoints.length - 1 && (
                            <button
                              onClick={() => removeWaypoint(waypoint.id)}
                              className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="pt-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-2">Add Transit Hub</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addWaypoint('airport')}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Plane className="w-4 h-4 text-white/60 group-hover:text-white" />
                  <span className="text-[10px] uppercase tracking-tighter">Airport</span>
                </button>
                <button
                  onClick={() => addWaypoint('train')}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Train className="w-4 h-4 text-white/60 group-hover:text-white" />
                  <span className="text-[10px] uppercase tracking-tighter">Train</span>
                </button>
                <button
                  onClick={() => addWaypoint('subway')}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <Train className="w-4 h-4 text-white/60 group-hover:text-white" />
                  <span className="text-[10px] uppercase tracking-tighter">Subway</span>
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
              {waypoints.map((w: any) => w.coords && (
                <Marker key={w.id} position={w.coords}>
                  <Tooltip 
                    permanent 
                    direction="top" 
                    offset={[0, -40]}
                    className="!bg-black/80 !border-white/10 !text-white !rounded-full !px-4 !py-1 !text-[10px] !uppercase !tracking-widest !font-bold !shadow-xl !backdrop-blur-md"
                  >
                    {w.value || w.label}
                  </Tooltip>
                </Marker>
              ))}
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

function FullRoute({ waypoints, routeCoords }: any) {
  return (
    <div className="relative h-screen w-full bg-[#0a0a0a]">
      <Link 
        to="/"
        className="absolute top-8 left-8 z-[1000] flex items-center gap-3 px-6 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-black/60 transition-all group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs uppercase tracking-widest font-bold">Back to Planner</span>
      </Link>

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
        {waypoints.map((w: any) => w.coords && (
          <Marker key={w.id} position={w.coords}>
            <Tooltip 
              permanent 
              direction="top" 
              offset={[0, -40]}
              className="!bg-black/80 !border-white/10 !text-white !rounded-full !px-4 !py-1 !text-[10px] !uppercase !tracking-widest !font-bold !shadow-xl !backdrop-blur-md"
            >
              {w.value || w.label}
            </Tooltip>
            <Popup>
              <div className="text-black font-sans">
                <p className="font-bold text-xs uppercase tracking-wider">{w.label}</p>
                <p className="text-sm">{w.value}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        <MapUpdater coords={routeCoords} />
      </MapContainer>
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.7)] z-[999]" />
    </div>
  );
}
