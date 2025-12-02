from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from typing import Dict, Any

from datetime import datetime
import math
import heapq
from typing import List, Tuple, Optional, Set, DefaultDict
from collections import defaultdict
import requests

app = Flask(__name__)
CORS(app)

# ---- Helper Functions (must be defined before route handlers that use them) ----
# Overpass API endpoints - try multiple in case of timeout
# Using reliable public Overpass API instances
OverpassURLs = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
]
OverpassURL = OverpassURLs[0]  # Default to first one

def _fetch_overpass_data(query: str, timeout: int = 60) -> dict:
    """
    Fetch data from Overpass API with retry logic and multiple endpoint fallback.
    Tries each endpoint in order until one succeeds.
    """
    import time
    last_error = None
    
    for url in OverpassURLs:
        try:
            print(f"Trying Overpass API: {url}")
            resp = requests.post(url, data={'data': query}, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            print(f"✅ Successfully fetched data from {url}")
            return data
        except requests.exceptions.Timeout as e:
            print(f"⏱️ Timeout error with {url}: {e}")
            last_error = e
            continue
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error with {url}: {e}")
            last_error = e
            continue
        except Exception as e:
            print(f"❌ Unexpected error with {url}: {e}")
            last_error = e
            continue
    
    # If all endpoints failed, raise the last error
    raise Exception(f"All Overpass API endpoints failed. Last error: {last_error}")

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lng points in meters using Haversine formula."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def _bbox_from_point_radius(lat: float, lng: float, radius_m: float) -> Tuple[float, float, float, float]:
    """Calculate bounding box around a point with given radius in meters."""
    dlat = (radius_m / 111320.0)
    dlng = (radius_m / (111320.0 * math.cos(math.radians(lat))))
    return (lat - dlat, lng - dlng, lat + dlat, lng + dlng)

# ---- API: Health check ----
@app.route('/')
def home():
    return jsonify({'message': 'RailNav Backend API is running.'})

# ---- API: Indoor Navigation ----
@app.route('/api/navigation', methods=['GET'])
def navigation():
    """
    Returns shortest pedestrian route between origin and destination using only footpaths.

    Query params:
      - origin: "lat,lng" (required)
      - dest: "lat,lng" (required)
      - radius_m: search radius around midpoint in meters (optional, default 600)
    """
    origin_str = request.args.get('origin')
    dest_str = request.args.get('dest')
    # Increase default radius to 2000m (2km) for better coverage
    radius_m = float(request.args.get('radius_m', '2000'))

    if not origin_str or not dest_str:
        return jsonify({'status': 'error', 'message': 'origin and dest query params are required: origin=lat,lng&dest=lat,lng'}), 400

    try:
        origin = tuple(map(float, origin_str.split(',')))  # (lat, lng)
        dest = tuple(map(float, dest_str.split(',')))      # (lat, lng)
        if len(origin) != 2 or len(dest) != 2:
            raise ValueError()
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid origin or dest format. Use origin=lat,lng&dest=lat,lng'}), 400

    try:
        # Compute a bbox around mid-point to limit Overpass query size
        # Also expand bbox to cover both origin and dest with buffer
        mid_lat = (origin[0] + dest[0]) / 2.0
        mid_lng = (origin[1] + dest[1]) / 2.0
        
        # Calculate distance between origin and dest
        dist_origin_dest = _haversine_m(origin[0], origin[1], dest[0], dest[1])
        # Use larger of: radius_m or 1.5x the distance between points
        effective_radius = max(radius_m, dist_origin_dest * 1.5)
        
        south, west, north, east = _bbox_from_point_radius(mid_lat, mid_lng, effective_radius)

        osm_nodes, ways = _fetch_pedestrian_ways(south, west, north, east)
        if not ways:
            return jsonify({
                'status': 'error', 
                'message': f'No pedestrian footpaths found in area (searched {effective_radius:.0f}m radius). Try increasing radius_m parameter.',
                'debug': {
                    'bbox': {'south': south, 'west': west, 'north': north, 'east': east},
                    'radius_m': effective_radius
                }
            }), 404

        graph, edge_types = _build_graph(osm_nodes, ways)
        
        if not graph:
            return jsonify({
                'status': 'error',
                'message': 'Failed to build routing graph from footpaths',
                'debug': {'ways_count': len(ways), 'nodes_count': len(osm_nodes)}
            }), 404

        # Try with increasing search distances
        max_search_distances = [200.0, 500.0, 1000.0]  # Try 200m, then 500m, then 1000m
        origin_node = None
        dest_node = None
        
        for max_dist in max_search_distances:
            if origin_node is None:
                origin_node = _nearest_node(origin, osm_nodes, graph, max_dist)
            if dest_node is None:
                dest_node = _nearest_node(dest, osm_nodes, graph, max_dist)
            if origin_node and dest_node:
                break
        
        if origin_node is None:
            return jsonify({
                'status': 'error', 
                'message': f'Could not find footpath within 1km of origin ({origin[0]:.6f}, {origin[1]:.6f}). The area may not have mapped footpaths.',
                'debug': {
                    'origin': origin,
                    'ways_found': len(ways),
                    'nodes_found': len(osm_nodes),
                    'suggestion': 'Try a different starting point or increase radius_m parameter'
                }
            }), 404
            
        if dest_node is None:
            return jsonify({
                'status': 'error', 
                'message': f'Could not find footpath within 1km of destination ({dest[0]:.6f}, {dest[1]:.6f}). The area may not have mapped footpaths.',
                'debug': {
                    'dest': dest,
                    'ways_found': len(ways),
                    'nodes_found': len(osm_nodes),
                    'suggestion': 'Try a different destination or increase radius_m parameter'
                }
            }), 404

        node_path = _shortest_path(graph, origin_node, dest_node)
        use_highways = False
        
        # If no pure pedestrian route found, try hybrid routing with highways as connectors
        if not node_path:
            # Fetch highways to use as connectors
            highway_nodes, highway_ways = _fetch_highways(south, west, north, east)
            
            if highway_ways:
                # Merge pedestrian and highway nodes
                all_nodes = {**osm_nodes, **highway_nodes}
                
                # Build hybrid graph with both pedestrian paths and highways
                # Highways get higher weight (penalty) to prefer pedestrian paths
                hybrid_graph, hybrid_edge_types = _build_hybrid_graph(
                    all_nodes, ways, highway_ways, 
                    pedestrian_weight=1.0, highway_weight=3.0  # Highways cost 3x more
                )
                
                # Find nearest nodes in hybrid graph
                hybrid_origin_node = _nearest_node(origin, all_nodes, hybrid_graph, 1000.0)
                hybrid_dest_node = _nearest_node(dest, all_nodes, hybrid_graph, 1000.0)
                
                if hybrid_origin_node and hybrid_dest_node:
                    node_path = _shortest_path(hybrid_graph, hybrid_origin_node, hybrid_dest_node)
                    if node_path:
                        use_highways = True
                        edge_types = hybrid_edge_types
                        osm_nodes = all_nodes  # Use merged nodes
                        print(f"✅ Hybrid route found using highways as connectors")
        
        if not node_path:
            return jsonify({
                'status': 'error', 
                'message': 'No route found between points. Even with highway connectors, no path exists.',
                'debug': {
                    'origin_node': origin_node,
                    'dest_node': dest_node,
                    'graph_size': len(graph),
                    'ways_in_area': len(ways),
                    'tried_hybrid': True
                }
            }), 404

        coords = [{'lat': osm_nodes[nid][0], 'lng': osm_nodes[nid][1]} for nid in node_path]
        colored_segments = _segments_with_types(node_path, osm_nodes, edge_types)
        network_geoms = _network_geometries(osm_nodes, ways)

        # Calculate statistics
        total_distance = _polyline_length(coords)
        pedestrian_distance = 0.0
        highway_distance = 0.0
        
        for seg in colored_segments:
            seg_dist = _haversine_m(seg['from']['lat'], seg['from']['lng'], seg['to']['lat'], seg['to']['lng'])
            if seg.get('category') == 'highway' or seg.get('highway') == 'highway':
                highway_distance += seg_dist
            else:
                pedestrian_distance += seg_dist
        
        return jsonify({
            'status': 'success',
            'route': coords,
            'route_colored': colored_segments,
            'network': network_geoms,
            'meta': {
                'nodes': len(osm_nodes),
                'ways': len(ways),
                'distance_m': total_distance,
                'pedestrian_distance_m': pedestrian_distance,
                'highway_distance_m': highway_distance,
                'uses_highways': use_highways,
                'routing_mode': 'hybrid' if use_highways else 'pedestrian_only'
            }
        })
    except Exception as exc:
        return jsonify({'status': 'error', 'message': str(exc)}), 500

# ---- API: Crowd Estimation/Density ----
@app.route('/api/crowd', methods=['GET'])
def crowd():
    # TODO: Integrate ML model or database of real crowd data per station/sector
    # Accept parameters such as time, location, etc., for precise results
    from random import choice
    densities = ['Low', 'Medium', 'High']
    return jsonify({
        'status': 'success',
        'density': choice(densities)
    })

# ---- API: Facilities (OSM via Overpass; cached) ----
@app.route('/api/facilities/<station>', methods=['GET'])
def facilities(station: str):
    """Return facilities for a station from cache; refresh from Overpass if requested."""
    from osm_facilities import get_or_refresh_facilities

    station_key = station.strip().lower()
    refresh = request.args.get('refresh', '0') == '1'

    try:
        data = get_or_refresh_facilities(station_key, force_refresh=refresh)
        return jsonify({
            'status': 'success',
            'station': station_key,
            'count': len(data.get('facilities', [])),
            'updated_at': data.get('updated_at'),
            'facilities': data.get('facilities', [])
        })
    except Exception as exc:
        return jsonify({'status': 'error', 'message': str(exc)}), 500

# ---- Helpers: OSM footpaths + graph + routing ----
@app.route('/api/paths', methods=['GET'])
def paths_catalog():
    """
    Return categorized pedestrian features and optional facilities pins for a given area.

    Query params (either center+radius_m or bbox required):
      - center: "lat,lng" (optional)
      - radius_m: meters (default 600) used with center
      - bbox: "south,west,north,east" (optional, overrides center+radius)
      - include_pins: "1" to include basic facilities pins for demo (default 1)
    """
    center_str = request.args.get('center')
    bbox_str = request.args.get('bbox')
    include_pins = request.args.get('include_pins', '1') == '1'
    radius_m = float(request.args.get('radius_m', '600'))

    try:
        if bbox_str:
            south, west, north, east = map(float, bbox_str.split(','))
        elif center_str:
            clat, clng = map(float, center_str.split(','))
            south, west, north, east = _bbox_from_point_radius(clat, clng, radius_m)
        else:
            return jsonify({'status': 'error', 'message': 'Provide bbox=s,w,n,e or center=lat,lng'}), 400

        data = _fetch_pedestrian_catalog(south, west, north, east)
        result = {'status': 'success', 'bbox': {'south': south, 'west': west, 'north': north, 'east': east}, **data}

        if include_pins:
            # Demo pins: reuse facilities endpoint if available for a couple stations in view (optional)
            result['pins'] = data.get('pins', [])

        return jsonify(result)
    except Exception as exc:
        return jsonify({'status': 'error', 'message': str(exc)}), 500

def _fetch_pedestrian_catalog(south: float, west: float, north: float, east: float) -> Dict[str, Any]:
    """
    Fetch categorized pedestrian ways in bbox:
      - foot_path: highway=footway (excluding steps and crossings/sidewalks subtypes)
      - sidewalk: highway=footway + footway=sidewalk
      - marked_crossing: highway=footway + footway=crossing and (crossing=marked|zebra)
      - informal_path: highway=path + informal=yes OR highway=path + trail_visibility=*
      - steps: highway=steps
      - pedestrian_street: highway=pedestrian
      - path: highway=path (general paths not caught by informal)
    Returns dict of arrays, each entry: {highway, subtype, coords: [{lat,lng}, ...]}
    """
    query = f"""
    [out:json][timeout:25];
    (
      way["highway"="footway"]["footway"="sidewalk"]({south},{west},{north},{east});
      way["highway"="footway"]["footway"="crossing"]({south},{west},{north},{east});
      way["highway"="steps"]({south},{west},{north},{east});
      way["highway"="pedestrian"]({south},{west},{north},{east});
      way["highway"="footway"]({south},{west},{north},{east});
      way["highway"="path"]({south},{west},{north},{east});
    );
    (._;>;);
    out body;
    """
    data = _fetch_overpass_data(query, timeout=60)

    node_map: Dict[int, Tuple[float, float]] = {}
    for el in data.get('elements', []):
        if el.get('type') == 'node':
            node_map[el['id']] = (el['lat'], el['lon'])

    categories = {
        'foot_path': [],
        'sidewalk': [],
        'marked_crossing': [],
        'informal_path': [],
        'steps': [],
        'pedestrian_street': [],
        'path': []
    }

    def to_coords(ids: List[int]):
        return [{'lat': node_map[i][0], 'lng': node_map[i][1]} for i in ids if i in node_map]

    for el in data.get('elements', []):
        if el.get('type') != 'way':
            continue
        tags = el.get('tags', {})
        highway = tags.get('highway', '')
        footway = tags.get('footway', '')
        crossing = tags.get('crossing', '')
        informal = tags.get('informal', '')
        trail_vis = tags.get('trail_visibility', '')
        node_ids = [nid for nid in el.get('nodes', []) if nid in node_map]
        if len(node_ids) < 2:
            continue
        coords = to_coords(node_ids)
        feature = {'highway': highway, 'subtype': footway or crossing or '', 'coords': coords}

        if highway == 'steps':
            categories['steps'].append(feature)
        elif highway == 'pedestrian':
            categories['pedestrian_street'].append(feature)
        elif highway == 'footway' and footway == 'sidewalk':
            categories['sidewalk'].append(feature)
        elif highway == 'footway' and footway == 'crossing' and (crossing in ('marked', 'zebra', 'traffic_signals', 'uncontrolled', 'pelican', 'toucan', 'puffin')):
            categories['marked_crossing'].append(feature)
        elif highway == 'path' and (informal == 'yes' or trail_vis):
            categories['informal_path'].append(feature)
        elif highway == 'footway':
            categories['foot_path'].append(feature)
        elif highway == 'path':
            categories['path'].append(feature)

    # Pins placeholder (frontend can also call /api/facilities/*)
    pins: List[Dict[str, Any]] = []

    return {
        'foot_path': categories['foot_path'],
        'sidewalk': categories['sidewalk'],
        'marked_crossing': categories['marked_crossing'],
        'informal_path': categories['informal_path'],
        'steps': categories['steps'],
        'pedestrian_street': categories['pedestrian_street'],
        'path': categories['path'],
        'pins': pins
    }

def _fetch_pedestrian_ways(south: float, west: float, north: float, east: float):
    """
    Fetch only specific pedestrian path types for navigation:
    - Foot Path: highway=footway (excluding sidewalk and crossing subtypes)
    - Path: highway=path (excluding informal paths)
    - Sidewalk: highway=footway + footway=sidewalk
    - Steps: highway=steps
    - Pedestrian Street: highway=pedestrian
    - Informal Path: highway=path + (informal=yes OR trail_visibility=*)
    
    Excludes: marked crossings, other footway subtypes, vehicle roads
    """
    query = f"""
    [out:json][timeout:25];
    (
      way
        ["highway"~"^(footway|path|pedestrian|steps)$"]
        ({south},{west},{north},{east});
    );
    (._;>;);
    out body;
    """
    data = _fetch_overpass_data(query, timeout=60)

    nodes = {}
    ways = []
    for el in data.get('elements', []):
        if el.get('type') == 'node':
            nodes[el['id']] = (el['lat'], el['lon'])
    
    for el in data.get('elements', []):
        if el.get('type') != 'way':
            continue
            
        tags = el.get('tags', {})
        hw = tags.get('highway', '')
        footway_subtype = tags.get('footway', '')
        crossing = tags.get('crossing', '')
        informal = tags.get('informal', '')
        trail_vis = tags.get('trail_visibility', '')
        
        node_ids = el.get('nodes', [])
        filtered = [nid for nid in node_ids if nid in nodes]
        if len(filtered) < 2:
            continue
        
        # Categorize and include only allowed types
        include_way = False
        category = None
        
        if hw == 'steps':
            include_way = True
            category = 'steps'
        elif hw == 'pedestrian':
            include_way = True
            category = 'pedestrian_street'
        elif hw == 'footway':
            if footway_subtype == 'sidewalk':
                include_way = True
                category = 'sidewalk'
            elif footway_subtype == 'crossing':
                # Exclude marked crossings from navigation
                include_way = False
            else:
                # Regular footway (Foot Path)
                include_way = True
                category = 'foot_path'
        elif hw == 'path':
            if informal == 'yes' or trail_vis:
                # Informal Path
                include_way = True
                category = 'informal_path'
            else:
                # Regular Path
                include_way = True
                category = 'path'
        else:
            # Unknown highway type - skip it
            include_way = False
        
        if include_way and category:
            ways.append({
                'nodes': filtered,
                'highway': hw,
                'category': category,
                'footway_subtype': footway_subtype if hw == 'footway' else None
            })
    
    # If no ways found with strict filtering, try a more lenient approach
    # (This shouldn't normally happen, but helps with sparse data)
    if not ways and len([el for el in data.get('elements', []) if el.get('type') == 'way']) > 0:
        # Log for debugging but don't change behavior - strict filtering is intentional
        pass
    
    return nodes, ways

def _fetch_highways(south: float, west: float, north: float, east: float):
    """
    Fetch highways (roads) to use as connectors between disconnected pedestrian networks.
    Includes: residential, service, tertiary, secondary, primary, trunk, motorway
    Excludes: footpaths, paths, pedestrian-only ways
    """
    query = f"""
    [out:json][timeout:25];
    (
      way
        ["highway"~"^(residential|service|tertiary|secondary|primary|trunk|motorway|unclassified)$"]
        ({south},{west},{north},{east});
    );
    (._;>;);
    out body;
    """
    data = _fetch_overpass_data(query, timeout=60)

    nodes = {}
    ways = []
    for el in data.get('elements', []):
        if el.get('type') == 'node':
            nodes[el['id']] = (el['lat'], el['lon'])
    
    for el in data.get('elements', []):
        if el.get('type') != 'way':
            continue
            
        tags = el.get('tags', {})
        hw = tags.get('highway', '')
        
        if hw in ('residential', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'unclassified'):
            node_ids = el.get('nodes', [])
            filtered = [nid for nid in node_ids if nid in nodes]
            if len(filtered) >= 2:
                ways.append({
                    'nodes': filtered,
                    'highway': hw,
                    'category': 'highway'  # Mark as highway
                })
    
    return nodes, ways

def _build_hybrid_graph(
    nodes: Dict[int, Tuple[float, float]], 
    pedestrian_ways: List[Dict[str, Any]], 
    highway_ways: List[Dict[str, Any]],
    pedestrian_weight: float = 1.0,
    highway_weight: float = 3.0
):
    """
    Build a hybrid graph with both pedestrian paths and highways.
    Highways get higher weight (penalty) to prefer pedestrian paths when possible.
    """
    graph: DefaultDict[int, List[Tuple[int, float]]] = defaultdict(list)
    edge_types: Dict[frozenset, str] = {}
    
    # Add pedestrian ways with normal weight
    for way in pedestrian_ways:
        node_ids = way['nodes']
        category = way.get('category', way.get('highway', 'path'))
        for i in range(1, len(node_ids)):
            u, v = node_ids[i-1], node_ids[i]
            if u not in nodes or v not in nodes:
                continue
            lat1, lon1 = nodes[u]
            lat2, lon2 = nodes[v]
            w = _haversine_m(lat1, lon1, lat2, lon2) * pedestrian_weight
            graph[u].append((v, w))
            graph[v].append((u, w))
            ekey = frozenset((u, v))
            edge_types[ekey] = category
    
    # Add highway ways with higher weight (penalty)
    for way in highway_ways:
        node_ids = way['nodes']
        for i in range(1, len(node_ids)):
            u, v = node_ids[i-1], node_ids[i]
            if u not in nodes or v not in nodes:
                continue
            lat1, lon1 = nodes[u]
            lat2, lon2 = nodes[v]
            w = _haversine_m(lat1, lon1, lat2, lon2) * highway_weight
            graph[u].append((v, w))
            graph[v].append((u, w))
            ekey = frozenset((u, v))
            # Only set as highway if not already set (pedestrian paths take priority)
            if ekey not in edge_types:
                edge_types[ekey] = 'highway'
    
    return graph, edge_types

def _polyline_length(coords: List[Dict[str, float]]) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        a, b = coords[i-1], coords[i]
        total += _haversine_m(a['lat'], a['lng'], b['lat'], b['lng'])
    return total

def _build_graph(nodes: Dict[int, Tuple[float, float]], ways: List[Dict[str, Any]]):
    # Undirected weighted graph: nodeId -> List[(neighborId, weight_m)]
    # Edge type map: frozenset({u, v}) -> category (foot_path, sidewalk, steps, etc.)
    graph: DefaultDict[int, List[Tuple[int, float]]] = defaultdict(list)
    edge_types: Dict[frozenset, str] = {}
    # Preference order to keep the most restrictive type if duplicates overlap
    # Higher rank = more specific/restrictive path type
    type_rank = {
        'steps': 5,
        'sidewalk': 4,
        'pedestrian_street': 3,
        'foot_path': 2,
        'informal_path': 1,
        'path': 0
    }

    for way in ways:
        node_ids = way['nodes']
        category = way.get('category', way.get('highway', 'path'))  # Use category if available
        for i in range(1, len(node_ids)):
            u, v = node_ids[i-1], node_ids[i]
            lat1, lon1 = nodes[u]
            lat2, lon2 = nodes[v]
            w = _haversine_m(lat1, lon1, lat2, lon2)
            graph[u].append((v, w))
            graph[v].append((u, w))
            ekey = frozenset((u, v))
            if ekey in edge_types:
                # keep the type with higher rank (more specific)
                prev = edge_types[ekey]
                if type_rank.get(category, -1) > type_rank.get(prev, -1):
                    edge_types[ekey] = category
            else:
                edge_types[ekey] = category
    return graph, edge_types

def _nearest_node(point: Tuple[float, float], nodes: Dict[int, Tuple[float, float]], graph, max_distance_m: float = 200.0) -> Optional[int]:
    """
    Find the nearest graph node to a point.
    
    Args:
        point: (lat, lng) tuple
        nodes: Dictionary of node_id -> (lat, lng)
        graph: The routing graph
        max_distance_m: Maximum distance in meters to consider (default 200m)
    
    Returns:
        Node ID if found within max_distance_m, None otherwise
    """
    best_id = None
    best_d = float('inf')
    plat, plng = point
    for nid, (lat, lng) in nodes.items():
        if nid not in graph:
            continue
        d = _haversine_m(plat, plng, lat, lng)
        if d < best_d and d <= max_distance_m:
            best_d = d
            best_id = nid
    return best_id

def _shortest_path(graph, start: int, goal: int) -> List[int]:
    # Dijkstra
    dist = {start: 0.0}
    prev: Dict[int, Optional[int]] = {start: None}
    heap = [(0.0, start)]
    visited: Set[int] = set()

    while heap:
        d, u = heapq.heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        if u == goal:
            break
        for v, w in graph.get(u, []):
            nd = d + w
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))

    if goal not in prev and goal != start:
        return []

    # Reconstruct
    path = []
    cur = goal
    path.append(cur)
    while cur in prev and prev[cur] is not None:
        cur = prev[cur]
        path.append(cur)
    if path[-1] != start:
        # No path
        return []
    path.reverse()
    return path

def _segments_with_types(node_path: List[int], nodes: Dict[int, Tuple[float, float]], edge_types: Dict[frozenset, str]):
    segments = []
    for i in range(1, len(node_path)):
        u = node_path[i-1]
        v = node_path[i]
        ekey = frozenset((u, v))
        category = edge_types.get(ekey, 'foot_path')  # Default to foot_path
        
        # Handle highway segments
        if category == 'highway':
            highway_type = 'highway'  # Could be enhanced to get specific highway type
        else:
            highway_type = category
        
        lat1, lng1 = nodes[u]
        lat2, lng2 = nodes[v]
        segments.append({
            'from': {'lat': lat1, 'lng': lng1},
            'to': {'lat': lat2, 'lng': lng2},
            'category': category,  # Use category name (foot_path, sidewalk, steps, highway, etc.)
            'highway': highway_type,  # Keep for backward compatibility
            'is_highway': category == 'highway'  # Flag for easy filtering
        })
    return segments

def _network_geometries(nodes: Dict[int, Tuple[float, float]], ways: List[Dict[str, Any]]):
    # Return polylines per way with its category for background rendering
    features = []
    for way in ways:
        coords = [{'lat': nodes[nid][0], 'lng': nodes[nid][1]} for nid in way['nodes'] if nid in nodes]
        if len(coords) >= 2:
            category = way.get('category', way.get('highway', 'path'))
            features.append({
                'category': category,  # Use category (foot_path, sidewalk, steps, etc.)
                'highway': way.get('highway', 'path'),  # Keep original highway tag
                'coords': coords
            })
    return features
# ---- Main app runner ----
if __name__ == '__main__':
    app.run(debug=True)
