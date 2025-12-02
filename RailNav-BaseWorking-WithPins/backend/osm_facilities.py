import json
import os
from typing import Dict, Any, List
from datetime import datetime
import requests


DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)


STATIONS = {
    # Approx station centroids (Mumbai)
    'dadar': {
        'center': {'lat': 19.0186, 'lng': 72.8446},
        'radius_m': 700,
        'prefix': 'Dadar'
    },
    'kurla': {
        'center': {'lat': 19.0657, 'lng': 72.8796},
        'radius_m': 800,
        'prefix': 'Kurla'
    }
}


# Map amenity/feature tags to readable type and naming keys
TAG_MAPPINGS = {
    # amenities
    'toilets': ('Toilet', ['amenity=toilets']),
    'atm': ('ATM', ['amenity=atm']),
    'bank': ('Bank', ['amenity=bank']),
    'drinking_water': ('Drinking_Water', ['amenity=drinking_water']),
    'fast_food': ('Food', ['amenity=fast_food']),
    'restaurant': ('Food', ['amenity=restaurant']),
    'cafe': ('Food', ['amenity=cafe']),
    'food_court': ('Food', ['amenity=food_court']),
    'waiting_room': ('Waiting_Area', ['amenity=waiting_room']),
    'bench': ('Seating', ['amenity=bench']),
    'bicycle_parking': ('Bicycle_Parking', ['amenity=bicycle_parking']),
    'parking': ('Parking', ['amenity=parking']),
    'police': ('Police', ['amenity=police']),
    'clinic': ('Medical', ['amenity=clinic']),
    'hospital': ('Medical', ['amenity=hospital']),
    'pharmacy': ('Medical', ['amenity=pharmacy']),
    'first_aid': ('Medical', ['emergency=first_aid_kit']),
    'elevator': ('Elevator', ['highway=elevator']),
    'information': ('Information', ['tourism=information', 'amenity=information']),
    # railway related
    'ticket_counter': ('Ticket_Counter', ['railway=ticket_validator', 'amenity=ticket_validator', 'amenity=ticket_office']),
    'entrance': ('Entrance', ['entrance=yes', 'railway=station_entrance']),
}


# Overpass API endpoints - try multiple in case of timeout
_OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
]

def _overpass_query(center_lat: float, center_lng: float, radius_m: int) -> Dict[str, Any]:
    # Build a combined Overpass QL query for relevant tags around center within radius
    around = f"around:{radius_m},{center_lat},{center_lng}"
    selectors = [
        'amenity=toilets','amenity=atm','amenity=bank','amenity=drinking_water',
        'amenity=fast_food','amenity=restaurant','amenity=cafe','amenity=food_court',
        'amenity=waiting_room','amenity=bench','amenity=bicycle_parking','amenity=parking',
        'amenity=police','amenity=clinic','amenity=hospital','amenity=pharmacy',
        'emergency=first_aid_kit','highway=elevator','tourism=information','amenity=information',
        'railway=ticket_validator','amenity=ticket_office','entrance=yes','railway=station_entrance'
    ]

    parts = []
    for sel in selectors:
        k, v = sel.split('=')
        parts.append(f"node[\"{k}\"=\"{v}\"]({around});")
        parts.append(f"way[\"{k}\"=\"{v}\"]({around});")
        parts.append(f"relation[\"{k}\"=\"{v}\"]({around});")

    q = f"""
    [out:json][timeout:40];
    (
      {''.join(parts)}
    );
    out center tags;
    """

    # Try multiple endpoints with retry logic
    last_error = None
    for url in _OVERPASS_URLS:
        try:
            print(f"Trying Overpass API: {url}")
            resp = requests.post(url, data={'data': q}, timeout=60)
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


def _classify_and_name(features: List[Dict[str, Any]], station_prefix: str) -> List[Dict[str, Any]]:
    counters: Dict[str, int] = {}
    results: List[Dict[str, Any]] = []

    def next_index(key: str) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    for el in features:
        tags = el.get('tags', {}) or {}
        lat = el.get('lat') or el.get('center', {}).get('lat')
        lon = el.get('lon') or el.get('center', {}).get('lon')
        if lat is None or lon is None:
            continue

        classified_type = None

        # try mappings
        for key, (readable, patterns) in TAG_MAPPINGS.items():
            for pat in patterns:
                k, v = pat.split('=')
                if tags.get(k) == v:
                    classified_type = readable
                    break
            if classified_type:
                break

        # fallback
        if not classified_type:
            if 'amenity' in tags:
                classified_type = tags['amenity'].title().replace(' ', '_')
            elif 'railway' in tags:
                classified_type = tags['railway'].title().replace(' ', '_')
            elif 'tourism' in tags:
                classified_type = tags['tourism'].title().replace(' ', '_')
            else:
                classified_type = 'Facility'

        idx = next_index(classified_type)
        name = tags.get('name')
        human_name = f"{station_prefix}_{classified_type}_{idx}"

        results.append({
            'id': el.get('id'),
            'name': human_name,
            'type': classified_type,
            'lat': float(lat),
            'lng': float(lon),
            'raw_name': name,
            'tags': tags
        })

    return results


def _cache_path(station_key: str) -> str:
    return os.path.join(DATA_DIR, f'{station_key}_facilities.json')


def get_or_refresh_facilities(station_key: str, force_refresh: bool = False) -> Dict[str, Any]:
    if station_key not in STATIONS:
        raise ValueError(f"Unsupported station '{station_key}'. Supported: {', '.join(STATIONS.keys())}")

    cache_file = _cache_path(station_key)

    if not force_refresh and os.path.exists(cache_file):
        with open(cache_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    cfg = STATIONS[station_key]
    raw = _overpass_query(cfg['center']['lat'], cfg['center']['lng'], cfg['radius_m'])
    elements = raw.get('elements', [])
    facilities = _classify_and_name(elements, cfg['prefix'])

    payload = {
        'station': station_key,
        'updated_at': datetime.utcnow().isoformat() + 'Z',
        'count': len(facilities),
        'facilities': facilities
    }

    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return payload


