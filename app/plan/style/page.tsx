'use client';
import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// ─── Mobile performance detection ────────────────────────────────────────────
const isMobile = typeof window !== "undefined" && (
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768
);

const FlightPriceChart = dynamic(() => import('./FlightPriceChart'), { ssr: false });

// ─── Preference step data ─────────────────────────────────────────────────────

const PURPOSES = [
  { id: 'vacation',   label: 'Vacation',            icon: String.fromCodePoint(0x1F3D6,0xFE0F) },
  { id: 'romance',    label: 'Romance / Honeymoon',  icon: String.fromCodePoint(0x1F491) },
  { id: 'adventure',  label: 'Adventure',            icon: String.fromCodePoint(0x1F9F3) },
  { id: 'culture',    label: 'Culture & History',    icon: String.fromCodePoint(0x1F3DB,0xFE0F) },
  { id: 'food',       label: 'Food & Cuisine',       icon: String.fromCodePoint(0x1F35C) },
  { id: 'business',   label: 'Business',             icon: String.fromCodePoint(0x1F4BC) },
  { id: 'family',     label: 'Family Trip',          icon: String.fromCodePoint(0x1F46A) },
  { id: 'wellness',   label: 'Wellness / Retreat',   icon: String.fromCodePoint(0x1F9D8) },
];
const STYLES = [
  { id: 'luxury',     label: 'Luxury',               icon: String.fromCodePoint(0x1F451) },
  { id: 'eco',        label: 'Eco / Sustainable',    icon: String.fromCodePoint(0x1F33F) },
  { id: 'backpacker', label: 'Backpacker',            icon: String.fromCodePoint(0x1F9F3) },
  { id: 'local',      label: 'Local & Authentic',    icon: String.fromCodePoint(0x1F3E1) },
  { id: 'highlights', label: 'Fast-paced Highlights', icon: String.fromCodePoint(0x26A1) },
  { id: 'slow',       label: 'Slow Travel',           icon: String.fromCodePoint(0x1F422) },
  { id: 'offbeat',    label: 'Off the Beaten Path',  icon: String.fromCodePoint(0x1F5FA,0xFE0F) },
];
const BUDGETS = [
  { id: 'budget',   label: 'Budget',    sub: '< $100 / day',      icon: String.fromCodePoint(0x1F4B5), color: '#22c55e' },
  { id: 'midrange', label: 'Mid-range', sub: '$100–$300 / day',   icon: String.fromCodePoint(0x1F4B0), color: '#3b82f6' },
  { id: 'upscale',  label: 'Upscale',   sub: '$300–$600 / day',   icon: String.fromCodePoint(0x1F4B3), color: '#a855f7' },
  { id: 'luxury',   label: 'Luxury',    sub: '$600+ / day',        icon: String.fromCodePoint(0x1F48E), color: '#f59e0b' },
];
const INTERESTS = [
  { id: 'nature',        label: 'Nature & Wildlife', icon: String.fromCodePoint(0x26F0,0xFE0F) },
  { id: 'history',       label: 'History & Culture', icon: String.fromCodePoint(0x1F3DB,0xFE0F) },
  { id: 'food',          label: 'Food & Drink',      icon: String.fromCodePoint(0x1F35C) },
  { id: 'nightlife',     label: 'Nightlife',         icon: String.fromCodePoint(0x1F389) },
  { id: 'adventure',     label: 'Adventure Sports',  icon: String.fromCodePoint(0x1F3C4) },
  { id: 'shopping',      label: 'Shopping',          icon: String.fromCodePoint(0x1F6CD,0xFE0F) },
  { id: 'photography',   label: 'Photography',       icon: String.fromCodePoint(0x1F4F8) },
  { id: 'art',           label: 'Art & Museums',     icon: String.fromCodePoint(0x1F3A8) },
  { id: 'spiritual',     label: 'Spiritual Sites',   icon: String.fromCodePoint(0x26EA) },
  { id: 'beaches',       label: 'Beaches',           icon: String.fromCodePoint(0x1F3D6,0xFE0F) },
  { id: 'cities',        label: 'City Life',         icon: String.fromCodePoint(0x1F306) },
  { id: 'entertainment', label: 'Entertainment',     icon: String.fromCodePoint(0x1F3AD) },
];
const CONSTRAINTS = [
  { id: 'wheelchair', label: 'Wheelchair Accessible', icon: String.fromCodePoint(0x267F) },
  { id: 'kids',       label: 'Kid-Friendly',          icon: String.fromCodePoint(0x1F9D2) },
  { id: 'pets',       label: 'Pet-Friendly',          icon: String.fromCodePoint(0x1F43E) },
  { id: 'vegetarian', label: 'Vegetarian / Vegan',    icon: String.fromCodePoint(0x1F331) },
  { id: 'visafree',   label: 'Visa-Free Only',        icon: String.fromCodePoint(0x2708,0xFE0F) },
  { id: 'medical',    label: 'Medical Requirements',  icon: String.fromCodePoint(0x1F48A) },
  { id: 'halal',      label: 'Halal-Friendly',        icon: String.fromCodePoint(0x262A,0xFE0F) },
  { id: 'none',       label: 'No Constraints',        icon: String.fromCodePoint(0x2705) },
];

// ─── Globe city data ──────────────────────────────────────────────────────────

const GLOBE_CITIES = [
  // ── United States ──
  { name: 'New York',        lat: 40.71,  lon: -74.01  },
  { name: 'Los Angeles',     lat: 34.05,  lon: -118.24 },
  { name: 'Chicago',         lat: 41.88,  lon: -87.63  },
  { name: 'Miami',           lat: 25.77,  lon: -80.19  },
  { name: 'Las Vegas',       lat: 36.17,  lon: -115.14 },
  { name: 'San Francisco',   lat: 37.77,  lon: -122.42 },
  { name: 'Seattle',         lat: 47.61,  lon: -122.33 },
  { name: 'Boston',          lat: 42.36,  lon: -71.06  },
  { name: 'Washington DC',   lat: 38.91,  lon: -77.04  },
  { name: 'New Orleans',     lat: 29.95,  lon: -90.07  },
  { name: 'Nashville',       lat: 36.17,  lon: -86.78  },
  { name: 'Denver',          lat: 39.74,  lon: -104.98 },
  { name: 'Austin',          lat: 30.27,  lon: -97.74  },
  { name: 'Phoenix',         lat: 33.45,  lon: -112.07 },
  { name: 'Honolulu',        lat: 21.31,  lon: -157.86 },
  { name: 'Atlanta',         lat: 33.75,  lon: -84.39  },
  { name: 'Dallas',          lat: 32.78,  lon: -96.80  },
  { name: 'Houston',         lat: 29.76,  lon: -95.37  },
  { name: 'San Diego',       lat: 32.72,  lon: -117.16 },
  { name: 'Portland',        lat: 45.52,  lon: -122.68 },
  { name: 'Minneapolis',     lat: 44.98,  lon: -93.27  },
  { name: 'Detroit',         lat: 42.33,  lon: -83.05  },
  { name: 'Philadelphia',    lat: 39.95,  lon: -75.16  },
  { name: 'Baltimore',       lat: 39.29,  lon: -76.61  },
  { name: 'Charlotte',       lat: 35.23,  lon: -80.84  },
  { name: 'Tampa',           lat: 27.95,  lon: -82.46  },
  { name: 'Orlando',         lat: 28.54,  lon: -81.38  },
  { name: 'Sacramento',      lat: 38.58,  lon: -121.49 },
  { name: 'Salt Lake City',  lat: 40.76,  lon: -111.89 },
  { name: 'Kansas City',     lat: 39.10,  lon: -94.58  },
  { name: 'St. Louis',       lat: 38.63,  lon: -90.20  },
  { name: 'Indianapolis',    lat: 39.77,  lon: -86.16  },
  { name: 'Columbus',        lat: 39.96,  lon: -82.99  },
  { name: 'Cleveland',       lat: 41.50,  lon: -81.69  },
  { name: 'Pittsburgh',      lat: 40.44,  lon: -79.99  },
  { name: 'Memphis',         lat: 35.15,  lon: -90.05  },
  { name: 'Louisville',      lat: 38.25,  lon: -85.76  },
  { name: 'Albuquerque',     lat: 35.08,  lon: -106.65 },
  { name: 'Tucson',          lat: 32.22,  lon: -110.97 },
  { name: 'Anchorage',       lat: 61.22,  lon: -149.90 },
  { name: 'Boise',           lat: 43.62,  lon: -116.20 },
  { name: 'Raleigh',         lat: 35.78,  lon: -78.64  },
  { name: 'Richmond',        lat: 37.54,  lon: -77.44  },
  { name: 'Oklahoma City',   lat: 35.47,  lon: -97.52  },
  { name: 'San Antonio',     lat: 29.42,  lon: -98.49  },
  { name: 'El Paso',         lat: 31.76,  lon: -106.49 },
  // ── Canada ──
  { name: 'Toronto',         lat: 43.65,  lon: -79.38  },
  { name: 'Vancouver',       lat: 49.25,  lon: -123.12 },
  { name: 'Montreal',        lat: 45.50,  lon: -73.57  },
  { name: 'Calgary',         lat: 51.05,  lon: -114.07 },
  { name: 'Quebec City',     lat: 46.81,  lon: -71.21  },
  { name: 'Ottawa',          lat: 45.42,  lon: -75.69  },
  { name: 'Edmonton',        lat: 53.55,  lon: -113.47 },
  { name: 'Winnipeg',        lat: 49.90,  lon: -97.14  },
  { name: 'Halifax',         lat: 44.65,  lon: -63.57  },
  // ── Mexico & Central America ──
  { name: 'Mexico City',     lat: 19.43,  lon: -99.13  },
  { name: 'Cancun',          lat: 21.16,  lon: -86.85  },
  { name: 'Guadalajara',     lat: 20.66,  lon: -103.35 },
  { name: 'Monterrey',       lat: 25.67,  lon: -100.31 },
  { name: 'Oaxaca',          lat: 17.07,  lon: -96.72  },
  { name: 'Guatemala City',  lat: 14.63,  lon: -90.51  },
  { name: 'San Jose',        lat: 9.93,   lon: -84.08  },
  { name: 'Panama City',     lat: 8.99,   lon: -79.52  },
  { name: 'Havana',          lat: 23.14,  lon: -82.36  },
  { name: 'Belize City',     lat: 17.25,  lon: -88.77  },
  { name: 'Tegucigalpa',     lat: 14.08,  lon: -87.21  },
  { name: 'Managua',         lat: 12.14,  lon: -86.29  },
  { name: 'San Salvador',    lat: 13.69,  lon: -89.19  },
  { name: 'Santo Domingo',   lat: 18.48,  lon: -69.90  },
  { name: 'San Juan',        lat: 18.47,  lon: -66.11  },
  // ── South America ──
  { name: 'Rio de Janeiro',  lat: -22.91, lon: -43.17  },
  { name: 'Sao Paulo',       lat: -23.55, lon: -46.63  },
  { name: 'Buenos Aires',    lat: -34.60, lon: -58.38  },
  { name: 'Lima',            lat: -12.04, lon: -77.03  },
  { name: 'Bogota',          lat: 4.71,   lon: -74.07  },
  { name: 'Santiago',        lat: -33.45, lon: -70.67  },
  { name: 'Cartagena',       lat: 10.40,  lon: -75.51  },
  { name: 'Medellin',        lat: 6.25,   lon: -75.56  },
  { name: 'Quito',           lat: -0.23,  lon: -78.52  },
  { name: 'Montevideo',      lat: -34.90, lon: -56.19  },
  { name: 'Cusco',           lat: -13.53, lon: -71.97  },
  { name: 'Caracas',         lat: 10.48,  lon: -66.88  },
  { name: 'La Paz',          lat: -16.50, lon: -68.15  },
  { name: 'Asuncion',        lat: -25.29, lon: -57.65  },
  { name: 'Recife',          lat: -8.05,  lon: -34.88  },
  { name: 'Salvador',        lat: -12.97, lon: -38.51  },
  { name: 'Fortaleza',       lat: -3.73,  lon: -38.52  },
  { name: 'Manaus',          lat: -3.10,  lon: -60.03  },
  // ── Western Europe ──
  { name: 'London',          lat: 51.51,  lon: -0.13   },
  { name: 'Paris',           lat: 48.85,  lon: 2.35    },
  { name: 'Amsterdam',       lat: 52.37,  lon: 4.90    },
  { name: 'Berlin',          lat: 52.52,  lon: 13.41   },
  { name: 'Rome',            lat: 41.90,  lon: 12.50   },
  { name: 'Barcelona',       lat: 41.39,  lon: 2.16    },
  { name: 'Madrid',          lat: 40.42,  lon: -3.70   },
  { name: 'Lisbon',          lat: 38.72,  lon: -9.14   },
  { name: 'Porto',           lat: 41.15,  lon: -8.61   },
  { name: 'Seville',         lat: 37.39,  lon: -5.99   },
  { name: 'Dublin',          lat: 53.33,  lon: -6.25   },
  { name: 'Edinburgh',       lat: 55.95,  lon: -3.19   },
  { name: 'Manchester',      lat: 53.48,  lon: -2.24   },
  { name: 'Birmingham',      lat: 52.48,  lon: -1.90   },
  { name: 'Glasgow',         lat: 55.86,  lon: -4.25   },
  { name: 'Brussels',        lat: 50.85,  lon: 4.35    },
  { name: 'Zurich',          lat: 47.38,  lon: 8.54    },
  { name: 'Geneva',          lat: 46.20,  lon: 6.15    },
  { name: 'Bern',            lat: 46.95,  lon: 7.45    },
  { name: 'Munich',          lat: 48.14,  lon: 11.58   },
  { name: 'Frankfurt',       lat: 50.11,  lon: 8.68    },
  { name: 'Hamburg',         lat: 53.55,  lon: 9.99    },
  { name: 'Cologne',         lat: 50.94,  lon: 6.96    },
  { name: 'Nice',            lat: 43.71,  lon: 7.26    },
  { name: 'Lyon',            lat: 45.75,  lon: 4.84    },
  { name: 'Marseille',       lat: 43.30,  lon: 5.37    },
  { name: 'Venice',          lat: 45.44,  lon: 12.33   },
  { name: 'Florence',        lat: 43.77,  lon: 11.25   },
  { name: 'Naples',          lat: 40.85,  lon: 14.27   },
  { name: 'Milan',           lat: 45.46,  lon: 9.19    },
  { name: 'Turin',           lat: 45.07,  lon: 7.69    },
  { name: 'Reykjavik',       lat: 64.13,  lon: -21.82  },
  { name: 'Luxembourg',      lat: 49.61,  lon: 6.13    },
  { name: 'Monaco',          lat: 43.74,  lon: 7.43    },
  { name: 'Andorra',         lat: 42.51,  lon: 1.52    },
  // ── Nordic & Baltic ──
  { name: 'Stockholm',       lat: 59.33,  lon: 18.07   },
  { name: 'Copenhagen',      lat: 55.68,  lon: 12.57   },
  { name: 'Oslo',            lat: 59.91,  lon: 10.75   },
  { name: 'Helsinki',        lat: 60.17,  lon: 24.94   },
  { name: 'Bergen',          lat: 60.39,  lon: 5.32    },
  { name: 'Gothenburg',      lat: 57.71,  lon: 11.97   },
  { name: 'Malmo',           lat: 55.60,  lon: 13.00   },
  { name: 'Tallinn',         lat: 59.44,  lon: 24.75   },
  { name: 'Riga',            lat: 56.95,  lon: 24.11   },
  { name: 'Vilnius',         lat: 54.69,  lon: 25.28   },
  // ── Central & Eastern Europe ──
  { name: 'Prague',          lat: 50.08,  lon: 14.44   },
  { name: 'Vienna',          lat: 48.21,  lon: 16.37   },
  { name: 'Budapest',        lat: 47.50,  lon: 19.04   },
  { name: 'Warsaw',          lat: 52.23,  lon: 21.01   },
  { name: 'Krakow',          lat: 50.06,  lon: 19.94   },
  { name: 'Bratislava',      lat: 48.15,  lon: 17.11   },
  { name: 'Ljubljana',       lat: 46.05,  lon: 14.51   },
  { name: 'Zagreb',          lat: 45.81,  lon: 15.98   },
  { name: 'Sarajevo',        lat: 43.85,  lon: 18.41   },
  { name: 'Dubrovnik',       lat: 42.65,  lon: 18.09   },
  { name: 'Split',           lat: 43.51,  lon: 16.44   },
  { name: 'Belgrade',        lat: 44.80,  lon: 20.46   },
  { name: 'Bucharest',       lat: 44.43,  lon: 26.10   },
  { name: 'Sofia',           lat: 42.70,  lon: 23.32   },
  { name: 'Athens',          lat: 37.98,  lon: 23.73   },
  { name: 'Santorini',       lat: 36.39,  lon: 25.46   },
  { name: 'Thessaloniki',    lat: 40.64,  lon: 22.94   },
  { name: 'Istanbul',        lat: 41.01,  lon: 28.95   },
  { name: 'Ankara',          lat: 39.93,  lon: 32.86   },
  { name: 'Izmir',           lat: 38.42,  lon: 27.14   },
  { name: 'Valletta',        lat: 35.90,  lon: 14.51   },
  { name: 'Nicosia',         lat: 35.17,  lon: 33.37   },
  { name: 'Kyiv',            lat: 50.45,  lon: 30.52   },
  { name: 'Minsk',           lat: 53.90,  lon: 27.57   },
  { name: 'Chisinau',        lat: 47.01,  lon: 28.86   },
  { name: 'Skopje',          lat: 41.99,  lon: 21.43   },
  { name: 'Tirana',          lat: 41.33,  lon: 19.82   },
  { name: 'Podgorica',       lat: 42.44,  lon: 19.26   },
  // ── Russia & Caucasus ──
  { name: 'Moscow',          lat: 55.75,  lon: 37.62   },
  { name: 'St. Petersburg',  lat: 59.94,  lon: 30.32   },
  { name: 'Novosibirsk',     lat: 54.99,  lon: 82.90   },
  { name: 'Vladivostok',     lat: 43.12,  lon: 131.90  },
  { name: 'Tbilisi',         lat: 41.69,  lon: 44.83   },
  { name: 'Yerevan',         lat: 40.18,  lon: 44.51   },
  { name: 'Baku',            lat: 40.41,  lon: 49.87   },
  // ── Middle East ──
  { name: 'Dubai',           lat: 25.20,  lon: 55.27   },
  { name: 'Abu Dhabi',       lat: 24.47,  lon: 54.37   },
  { name: 'Doha',            lat: 25.29,  lon: 51.53   },
  { name: 'Tel Aviv',        lat: 32.09,  lon: 34.79   },
  { name: 'Jerusalem',       lat: 31.78,  lon: 35.22   },
  { name: 'Amman',           lat: 31.95,  lon: 35.93   },
  { name: 'Beirut',          lat: 33.89,  lon: 35.50   },
  { name: 'Riyadh',          lat: 24.69,  lon: 46.72   },
  { name: 'Muscat',          lat: 23.58,  lon: 58.41   },
  { name: 'Kuwait City',     lat: 29.37,  lon: 47.98   },
  { name: 'Baghdad',         lat: 33.34,  lon: 44.40   },
  { name: 'Tehran',          lat: 35.69,  lon: 51.39   },
  { name: 'Shiraz',          lat: 29.59,  lon: 52.58   },
  { name: 'Erbil',           lat: 36.19,  lon: 44.01   },
  { name: "Sana'a",          lat: 15.35,  lon: 44.21   },
  // ── Africa ──
  { name: 'Cairo',           lat: 30.04,  lon: 31.24   },
  { name: 'Luxor',           lat: 25.69,  lon: 32.64   },
  { name: 'Alexandria',      lat: 31.20,  lon: 29.91   },
  { name: 'Marrakech',       lat: 31.63,  lon: -8.01   },
  { name: 'Casablanca',      lat: 33.59,  lon: -7.62   },
  { name: 'Fez',             lat: 34.03,  lon: -5.00   },
  { name: 'Tunis',           lat: 36.82,  lon: 10.17   },
  { name: 'Algiers',         lat: 36.74,  lon: 3.06    },
  { name: 'Tripoli',         lat: 32.90,  lon: 13.18   },
  { name: 'Nairobi',         lat: -1.29,  lon: 36.82   },
  { name: 'Zanzibar',        lat: -6.16,  lon: 39.20   },
  { name: 'Addis Ababa',     lat: 9.03,   lon: 38.74   },
  { name: 'Cape Town',       lat: -33.93, lon: 18.42   },
  { name: 'Johannesburg',    lat: -26.20, lon: 28.04   },
  { name: 'Durban',          lat: -29.86, lon: 31.02   },
  { name: 'Lagos',           lat: 6.52,   lon: 3.38    },
  { name: 'Accra',           lat: 5.56,   lon: -0.20   },
  { name: 'Abuja',           lat: 9.06,   lon: 7.50    },
  { name: 'Dar es Salaam',   lat: -6.79,  lon: 39.21   },
  { name: 'Dakar',           lat: 14.72,  lon: -17.47  },
  { name: 'Kampala',         lat: 0.32,   lon: 32.58   },
  { name: 'Kigali',          lat: -1.94,  lon: 30.06   },
  { name: 'Harare',          lat: -17.83, lon: 31.05   },
  { name: 'Lusaka',          lat: -15.42, lon: 28.28   },
  { name: 'Maputo',          lat: -25.97, lon: 32.59   },
  { name: 'Antananarivo',    lat: -18.91, lon: 47.54   },
  { name: 'Kinshasa',        lat: -4.32,  lon: 15.32   },
  { name: 'Luanda',          lat: -8.84,  lon: 13.23   },
  { name: 'Khartoum',        lat: 15.55,  lon: 32.53   },
  { name: 'Djibouti',        lat: 11.59,  lon: 43.15   },
  // ── South & Central Asia ──
  { name: 'Mumbai',          lat: 19.08,  lon: 72.88   },
  { name: 'Delhi',           lat: 28.61,  lon: 77.21   },
  { name: 'Bangalore',       lat: 12.97,  lon: 77.59   },
  { name: 'Chennai',         lat: 13.08,  lon: 80.27   },
  { name: 'Hyderabad',       lat: 17.39,  lon: 78.49   },
  { name: 'Pune',            lat: 18.52,  lon: 73.86   },
  { name: 'Ahmedabad',       lat: 23.03,  lon: 72.58   },
  { name: 'Kolkata',         lat: 22.57,  lon: 88.36   },
  { name: 'Goa',             lat: 15.30,  lon: 74.12   },
  { name: 'Jaipur',          lat: 26.91,  lon: 75.79   },
  { name: 'Agra',            lat: 27.18,  lon: 78.01   },
  { name: 'Varanasi',        lat: 25.32,  lon: 82.97   },
  { name: 'Kochi',           lat: 9.93,   lon: 76.27   },
  { name: 'Kathmandu',       lat: 27.72,  lon: 85.32   },
  { name: 'Colombo',         lat: 6.93,   lon: 79.86   },
  { name: 'Maldives',        lat: 4.17,   lon: 73.51   },
  { name: 'Karachi',         lat: 24.86,  lon: 67.01   },
  { name: 'Lahore',          lat: 31.55,  lon: 74.35   },
  { name: 'Islamabad',       lat: 33.72,  lon: 73.04   },
  { name: 'Dhaka',           lat: 23.81,  lon: 90.41   },
  { name: 'Tashkent',        lat: 41.30,  lon: 69.24   },
  { name: 'Almaty',          lat: 43.22,  lon: 76.85   },
  { name: 'Nur-Sultan',      lat: 51.18,  lon: 71.45   },
  { name: 'Bishkek',         lat: 42.87,  lon: 74.59   },
  { name: 'Dushanbe',        lat: 38.56,  lon: 68.77   },
  { name: 'Ashgabat',        lat: 37.95,  lon: 58.38   },
  { name: 'Kabul',           lat: 34.53,  lon: 69.17   },
  // ── East & Southeast Asia ──
  { name: 'Tokyo',           lat: 35.69,  lon: 139.69  },
  { name: 'Osaka',           lat: 34.69,  lon: 135.50  },
  { name: 'Kyoto',           lat: 35.01,  lon: 135.77  },
  { name: 'Sapporo',         lat: 43.06,  lon: 141.35  },
  { name: 'Hiroshima',       lat: 34.39,  lon: 132.45  },
  { name: 'Fukuoka',         lat: 33.59,  lon: 130.40  },
  { name: 'Naha',            lat: 26.21,  lon: 127.68  },
  { name: 'Seoul',           lat: 37.57,  lon: 126.98  },
  { name: 'Busan',           lat: 35.10,  lon: 129.04  },
  { name: 'Beijing',         lat: 39.91,  lon: 116.39  },
  { name: 'Shanghai',        lat: 31.23,  lon: 121.47  },
  { name: 'Hong Kong',       lat: 22.33,  lon: 114.17  },
  { name: 'Guangzhou',       lat: 23.13,  lon: 113.27  },
  { name: 'Shenzhen',        lat: 22.54,  lon: 114.06  },
  { name: 'Chengdu',         lat: 30.66,  lon: 104.07  },
  { name: 'Chongqing',       lat: 29.56,  lon: 106.55  },
  { name: 'Wuhan',           lat: 30.59,  lon: 114.31  },
  { name: 'Nanjing',         lat: 32.06,  lon: 118.78  },
  { name: 'Hangzhou',        lat: 30.26,  lon: 120.19  },
  { name: "Xi'an",           lat: 34.27,  lon: 108.93  },
  { name: 'Tianjin',         lat: 39.13,  lon: 117.20  },
  { name: 'Harbin',          lat: 45.75,  lon: 126.64  },
  { name: 'Urumqi',          lat: 43.83,  lon: 87.62   },
  { name: 'Lhasa',           lat: 29.65,  lon: 91.13   },
  { name: 'Taipei',          lat: 25.05,  lon: 121.56  },
  { name: 'Ulaanbaatar',     lat: 47.89,  lon: 106.91  },
  { name: 'Singapore',       lat: 1.35,   lon: 103.82  },
  { name: 'Bangkok',         lat: 13.75,  lon: 100.52  },
  { name: 'Chiang Mai',      lat: 18.79,  lon: 98.98   },
  { name: 'Phuket',          lat: 7.89,   lon: 98.40   },
  { name: 'Kuala Lumpur',    lat: 3.15,   lon: 101.69  },
  { name: 'Penang',          lat: 5.41,   lon: 100.33  },
  { name: 'Manila',          lat: 14.60,  lon: 120.98  },
  { name: 'Cebu',            lat: 10.32,  lon: 123.90  },
  { name: 'Bali',            lat: -8.67,  lon: 115.21  },
  { name: 'Jakarta',         lat: -6.21,  lon: 106.85  },
  { name: 'Surabaya',        lat: -7.25,  lon: 112.75  },
  { name: 'Hanoi',           lat: 21.03,  lon: 105.85  },
  { name: 'Ho Chi Minh',     lat: 10.82,  lon: 106.63  },
  { name: 'Hoi An',          lat: 15.88,  lon: 108.34  },
  { name: 'Phnom Penh',      lat: 11.56,  lon: 104.92  },
  { name: 'Siem Reap',       lat: 13.36,  lon: 103.86  },
  { name: 'Vientiane',       lat: 17.97,  lon: 102.60  },
  { name: 'Yangon',          lat: 16.87,  lon: 96.19   },
  { name: 'Naypyidaw',       lat: 19.74,  lon: 96.12   },
  // ── Oceania ──
  { name: 'Sydney',          lat: -33.87, lon: 151.21  },
  { name: 'Melbourne',       lat: -37.81, lon: 144.96  },
  { name: 'Brisbane',        lat: -27.47, lon: 153.03  },
  { name: 'Perth',           lat: -31.95, lon: 115.86  },
  { name: 'Adelaide',        lat: -34.93, lon: 138.60  },
  { name: 'Darwin',          lat: -12.46, lon: 130.84  },
  { name: 'Cairns',          lat: -16.92, lon: 145.78  },
  { name: 'Hobart',          lat: -42.88, lon: 147.32  },
  { name: 'Auckland',        lat: -36.86, lon: 174.77  },
  { name: 'Wellington',      lat: -41.29, lon: 174.78  },
  { name: 'Christchurch',    lat: -43.53, lon: 172.64  },
  { name: 'Queenstown',      lat: -45.03, lon: 168.66  },
  { name: 'Fiji',            lat: -18.14, lon: 178.44  },
  { name: 'Papeete',         lat: -17.53, lon: -149.57 },
  { name: 'Port Moresby',    lat: -9.44,  lon: 147.18  },
];

// ─── Major commercial airport lookup (excludes private / GA airports) ─────────
const AIRPORTS: Record<string, { name: string; iata: string }> = {
  // ── United States ──────────────────────────────────────────────────────────
  'New York':        { name: 'John F. Kennedy International',            iata: 'JFK' },
  'Los Angeles':     { name: 'Los Angeles International',                iata: 'LAX' },
  'Chicago':         { name: "O'Hare International",                     iata: 'ORD' },
  'Miami':           { name: 'Miami International',                      iata: 'MIA' },
  'Las Vegas':       { name: 'Harry Reid International',                 iata: 'LAS' },
  'San Francisco':   { name: 'San Francisco International',              iata: 'SFO' },
  'Seattle':         { name: 'Seattle-Tacoma International',             iata: 'SEA' },
  'Boston':          { name: 'Logan International',                      iata: 'BOS' },
  'Washington DC':   { name: 'Dulles International',                     iata: 'IAD' },
  'New Orleans':     { name: 'Louis Armstrong New Orleans International', iata: 'MSY' },
  'Nashville':       { name: 'Nashville International',                  iata: 'BNA' },
  'Denver':          { name: 'Denver International',                     iata: 'DEN' },
  'Austin':          { name: 'Austin-Bergstrom International',           iata: 'AUS' },
  'Phoenix':         { name: 'Phoenix Sky Harbor International',         iata: 'PHX' },
  'Honolulu':        { name: 'Daniel K. Inouye International',           iata: 'HNL' },
  'Atlanta':         { name: 'Hartsfield-Jackson Atlanta International', iata: 'ATL' },
  'Dallas':          { name: 'Dallas/Fort Worth International',          iata: 'DFW' },
  'Houston':         { name: 'George Bush Intercontinental',             iata: 'IAH' },
  'San Diego':       { name: 'San Diego International',                  iata: 'SAN' },
  'Portland':        { name: 'Portland International',                   iata: 'PDX' },
  'Minneapolis':     { name: 'Minneapolis–Saint Paul International',     iata: 'MSP' },
  'Detroit':         { name: 'Detroit Metropolitan',                     iata: 'DTW' },
  'Philadelphia':    { name: 'Philadelphia International',               iata: 'PHL' },
  'Baltimore':       { name: 'Baltimore/Washington International',       iata: 'BWI' },
  'Charlotte':       { name: 'Charlotte Douglas International',          iata: 'CLT' },
  'Tampa':           { name: 'Tampa International',                      iata: 'TPA' },
  'Orlando':         { name: 'Orlando International',                    iata: 'MCO' },
  'Sacramento':      { name: 'Sacramento International',                 iata: 'SMF' },
  'Salt Lake City':  { name: 'Salt Lake City International',             iata: 'SLC' },
  'Kansas City':     { name: 'Kansas City International',                iata: 'MCI' },
  'St. Louis':       { name: 'St. Louis Lambert International',          iata: 'STL' },
  'Indianapolis':    { name: 'Indianapolis International',               iata: 'IND' },
  'Columbus':        { name: 'John Glenn Columbus International',        iata: 'CMH' },
  'Cleveland':       { name: 'Cleveland Hopkins International',          iata: 'CLE' },
  'Pittsburgh':      { name: 'Pittsburgh International',                 iata: 'PIT' },
  // ── More US cities ──────────────────────────────────────────────────────────
  'Albuquerque':     { name: 'Albuquerque International Sunport',        iata: 'ABQ' },
  'Tucson':          { name: 'Tucson International Airport',             iata: 'TUS' },
  'Reno':            { name: 'Reno-Tahoe International Airport',         iata: 'RNO' },
  'Boise':           { name: 'Boise Airport',                            iata: 'BOI' },
  'Anchorage':       { name: 'Ted Stevens Anchorage International',      iata: 'ANC' },
  'San Antonio':     { name: 'San Antonio International Airport',        iata: 'SAT' },
  'Oklahoma City':   { name: 'Will Rogers World Airport',                iata: 'OKC' },
  'Tulsa':           { name: 'Tulsa International Airport',              iata: 'TUL' },
  'Memphis':         { name: 'Memphis International Airport',            iata: 'MEM' },
  'Louisville':      { name: 'Louisville Muhammad Ali International',    iata: 'SDF' },
  'Raleigh':         { name: 'Raleigh-Durham International Airport',     iata: 'RDU' },
  'Raleigh-Durham':  { name: 'Raleigh-Durham International Airport',     iata: 'RDU' },
  'Richmond':        { name: 'Richmond International Airport',           iata: 'RIC' },
  'Norfolk':         { name: 'Norfolk International Airport',            iata: 'ORF' },
  'Jacksonville':    { name: 'Jacksonville International Airport',       iata: 'JAX' },
  'Fort Lauderdale': { name: 'Fort Lauderdale-Hollywood International',  iata: 'FLL' },
  'West Palm Beach': { name: 'Palm Beach International Airport',         iata: 'PBI' },
  'Fort Myers':      { name: 'Southwest Florida International Airport',  iata: 'RSW' },
  'Birmingham':      { name: 'Birmingham-Shuttlesworth International',   iata: 'BHM' },
  'Knoxville':       { name: 'McGhee Tyson Airport',                     iata: 'TYS' },
  'Chattanooga':     { name: 'Chattanooga Metropolitan Airport',         iata: 'CHA' },
  'Des Moines':      { name: 'Des Moines International Airport',         iata: 'DSM' },
  'Omaha':           { name: 'Eppley Airfield',                          iata: 'OMA' },
  'Wichita':         { name: 'Wichita Dwight D. Eisenhower National',    iata: 'ICT' },
  'El Paso':         { name: 'El Paso International Airport',            iata: 'ELP' },
  'Colorado Springs':{ name: 'Colorado Springs Airport',                 iata: 'COS' },
  'Grand Rapids':    { name: 'Gerald R. Ford International Airport',     iata: 'GRR' },
  'Dayton':          { name: 'Dayton International Airport',             iata: 'DAY' },
  'Akron':           { name: 'Akron-Canton Airport',                     iata: 'CAK' },
  'Lexington':       { name: 'Blue Grass Airport',                       iata: 'LEX' },
  'Spokane':         { name: 'Spokane International Airport',            iata: 'GEG' },
  'Little Rock':     { name: 'Bill and Hillary Clinton National Airport', iata: 'LIT' },
  'Madison':         { name: 'Dane County Regional Airport',             iata: 'MSN' },
  'Buffalo':         { name: 'Buffalo Niagara International Airport',    iata: 'BUF' },
  'Albany':          { name: 'Albany International Airport',             iata: 'ALB' },
  'Hartford':        { name: 'Bradley International Airport',            iata: 'BDL' },
  'Providence':      { name: 'T.F. Green Providence Airport',            iata: 'PVD' },
  'Savannah':        { name: 'Savannah/Hilton Head International',       iata: 'SAV' },
  'Greenville':      { name: 'Greenville-Spartanburg International',     iata: 'GSP' },
  'Fayetteville':    { name: 'Northwest Arkansas National Airport',      iata: 'XNA' },
  'Billings':        { name: 'Billings Logan International Airport',     iata: 'BIL' },
  'Sioux Falls':     { name: 'Sioux Falls Regional Airport',             iata: 'FSD' },
  'Lubbock':         { name: 'Lubbock Preston Smith International',      iata: 'LBB' },
  'Amarillo':        { name: 'Rick Husband Amarillo International',      iata: 'AMA' },
  'Corpus Christi':  { name: 'Corpus Christi International Airport',     iata: 'CRP' },
  'Midland':         { name: 'Midland International Air and Space Port',  iata: 'MAF' },
  'Pensacola':       { name: 'Pensacola International Airport',          iata: 'PNS' },
  'Jackson':         { name: 'Jackson-Medgar Wiley Evers International', iata: 'JAN' },
  'Springfield':     { name: 'Springfield-Branson National Airport',     iata: 'SGF' },
  // ── Canada ─────────────────────────────────────────────────────────────────
  'Toronto':         { name: 'Toronto Pearson International',            iata: 'YYZ' },
  'Vancouver':       { name: 'Vancouver International',                  iata: 'YVR' },
  'Montreal':        { name: 'Montréal–Trudeau International',           iata: 'YUL' },
  'Calgary':         { name: 'Calgary International',                    iata: 'YYC' },
  'Ottawa':          { name: 'Ottawa Macdonald–Cartier International',   iata: 'YOW' },
  'Edmonton':        { name: 'Edmonton International',                   iata: 'YEG' },
  'Quebec City':     { name: 'Quebec City Jean Lesage International',    iata: 'YQB' },
  // ── Latin America ───────────────────────────────────────────────────────────
  'Mexico City':     { name: 'Benito Juárez International',              iata: 'MEX' },
  'Cancun':          { name: 'Cancún International',                     iata: 'CUN' },
  'Havana':          { name: 'José Martí International',                 iata: 'HAV' },
  'San Juan':        { name: 'Luis Muñoz Marín International',           iata: 'SJU' },
  'Bogota':          { name: 'El Dorado International',                  iata: 'BOG' },
  'Lima':            { name: 'Jorge Chávez International',               iata: 'LIM' },
  'Buenos Aires':    { name: 'Ministro Pistarini International',         iata: 'EZE' },
  'Rio de Janeiro':  { name: 'Galeão International',                     iata: 'GIG' },
  'São Paulo':       { name: 'São Paulo/Guarulhos International',        iata: 'GRU' },
  'Santiago':        { name: 'Arturo Merino Benítez International',      iata: 'SCL' },
  'Medellín':        { name: 'José María Córdova International',         iata: 'MDE' },
  'Cartagena':       { name: 'Rafael Núñez International',               iata: 'CTG' },
  'Quito':           { name: 'Mariscal Sucre International',             iata: 'UIO' },
  'Panama City':     { name: 'Tocumen International',                    iata: 'PTY' },
  'San José':        { name: 'Juan Santamaría International',            iata: 'SJO' },
  // ── Europe ─────────────────────────────────────────────────────────────────
  'London':          { name: 'Heathrow Airport',                         iata: 'LHR' },
  'Paris':           { name: 'Charles de Gaulle Airport',                iata: 'CDG' },
  'Amsterdam':       { name: 'Amsterdam Airport Schiphol',               iata: 'AMS' },
  'Frankfurt':       { name: 'Frankfurt Airport',                        iata: 'FRA' },
  'Munich':          { name: 'Munich Airport',                           iata: 'MUC' },
  'Berlin':          { name: 'Berlin Brandenburg Airport',               iata: 'BER' },
  'Madrid':          { name: 'Adolfo Suárez Madrid–Barajas Airport',     iata: 'MAD' },
  'Barcelona':       { name: 'Josep Tarradellas Barcelona–El Prat',      iata: 'BCN' },
  'Rome':            { name: 'Leonardo da Vinci International',          iata: 'FCO' },
  'Milan':           { name: 'Milan Malpensa Airport',                   iata: 'MXP' },
  'Venice':          { name: 'Venice Marco Polo Airport',                iata: 'VCE' },
  'Florence':        { name: 'Florence Airport',                         iata: 'FLR' },
  'Naples':          { name: 'Naples International Airport',             iata: 'NAP' },
  'Zurich':          { name: 'Zurich Airport',                           iata: 'ZRH' },
  'Geneva':          { name: 'Geneva Airport',                           iata: 'GVA' },
  'Vienna':          { name: 'Vienna International Airport',             iata: 'VIE' },
  'Brussels':        { name: 'Brussels Airport',                         iata: 'BRU' },
  'Copenhagen':      { name: 'Copenhagen Airport',                       iata: 'CPH' },
  'Stockholm':       { name: 'Stockholm Arlanda Airport',                iata: 'ARN' },
  'Oslo':            { name: 'Oslo Airport Gardermoen',                  iata: 'OSL' },
  'Helsinki':        { name: 'Helsinki Airport',                         iata: 'HEL' },
  'Athens':          { name: 'Athens International Airport',             iata: 'ATH' },
  'Santorini':       { name: 'Santorini Airport',                        iata: 'JTR' },
  'Thessaloniki':    { name: 'Thessaloniki Airport',                     iata: 'SKG' },
  'Lisbon':          { name: 'Humberto Delgado Airport',                 iata: 'LIS' },
  'Porto':           { name: 'Francisco Sá Carneiro Airport',            iata: 'OPO' },
  'Dublin':          { name: 'Dublin Airport',                           iata: 'DUB' },
  'Edinburgh':       { name: 'Edinburgh Airport',                        iata: 'EDI' },
  'Nice':            { name: "Nice Côte d'Azur Airport",                 iata: 'NCE' },
  'Prague':          { name: 'Václav Havel Airport Prague',              iata: 'PRG' },
  'Budapest':        { name: 'Budapest Ferenc Liszt International',      iata: 'BUD' },
  'Warsaw':          { name: 'Warsaw Chopin Airport',                    iata: 'WAW' },
  'Krakow':          { name: 'Kraków John Paul II International',        iata: 'KRK' },
  'Istanbul':        { name: 'Istanbul Airport',                         iata: 'IST' },
  'Ankara':          { name: 'Esenboğa International Airport',           iata: 'ESB' },
  'Moscow':          { name: 'Sheremetyevo International Airport',       iata: 'SVO' },
  'St. Petersburg':  { name: 'Pulkovo Airport',                          iata: 'LED' },
  'Dubrovnik':       { name: 'Dubrovnik Airport',                        iata: 'DBV' },
  'Split':           { name: 'Split Airport',                            iata: 'SPU' },
  'Valletta':        { name: 'Malta International Airport',              iata: 'MLA' },
  'Reykjavik':       { name: 'Keflavík International Airport',           iata: 'KEF' },
  'Tallinn':         { name: 'Tallinn Airport',                          iata: 'TLL' },
  'Riga':            { name: 'Riga International Airport',               iata: 'RIX' },
  'Vilnius':         { name: 'Vilnius Airport',                          iata: 'VNO' },
  'Belgrade':        { name: 'Belgrade Nikola Tesla Airport',            iata: 'BEG' },
  'Sarajevo':        { name: 'Sarajevo International Airport',           iata: 'SJJ' },
  'Bucharest':       { name: 'Henri Coandă International Airport',       iata: 'OTP' },
  'Sofia':           { name: 'Sofia Airport',                            iata: 'SOF' },
  'Tbilisi':         { name: 'Tbilisi International Airport',            iata: 'TBS' },
  'Yerevan':         { name: 'Zvartnots International Airport',          iata: 'EVN' },
  'Baku':            { name: 'Heydar Aliyev International Airport',      iata: 'GYD' },
  'Kyiv':            { name: 'Boryspil International Airport',           iata: 'KBP' },
  // ── Middle East ─────────────────────────────────────────────────────────────
  'Dubai':           { name: 'Dubai International Airport',              iata: 'DXB' },
  'Abu Dhabi':       { name: 'Abu Dhabi International Airport',          iata: 'AUH' },
  'Doha':            { name: 'Hamad International Airport',              iata: 'DOH' },
  'Tel Aviv':        { name: 'Ben Gurion International Airport',         iata: 'TLV' },
  'Amman':           { name: 'Queen Alia International Airport',         iata: 'AMM' },
  'Riyadh':          { name: 'King Khalid International Airport',        iata: 'RUH' },
  'Muscat':          { name: 'Muscat International Airport',             iata: 'MCT' },
  'Kuwait City':     { name: 'Kuwait International Airport',             iata: 'KWI' },
  'Beirut':          { name: 'Rafic Hariri International Airport',       iata: 'BEY' },
  'Tehran':          { name: 'Imam Khomeini International Airport',      iata: 'IKA' },
  // ── Africa ──────────────────────────────────────────────────────────────────
  'Cairo':           { name: 'Cairo International Airport',              iata: 'CAI' },
  'Luxor':           { name: 'Luxor International Airport',              iata: 'LXR' },
  'Marrakech':       { name: 'Marrakech Menara Airport',                 iata: 'RAK' },
  'Casablanca':      { name: 'Mohammed V International Airport',         iata: 'CMN' },
  'Tunis':           { name: 'Tunis-Carthage International Airport',     iata: 'TUN' },
  'Nairobi':         { name: 'Jomo Kenyatta International Airport',      iata: 'NBO' },
  'Zanzibar':        { name: 'Abeid Amani Karume International Airport', iata: 'ZNZ' },
  'Addis Ababa':     { name: 'Addis Ababa Bole International Airport',   iata: 'ADD' },
  'Cape Town':       { name: 'Cape Town International Airport',          iata: 'CPT' },
  'Johannesburg':    { name: 'O.R. Tambo International Airport',         iata: 'JNB' },
  'Durban':          { name: 'King Shaka International Airport',         iata: 'DUR' },
  'Lagos':           { name: 'Murtala Muhammed International Airport',   iata: 'LOS' },
  'Accra':           { name: 'Kotoka International Airport',             iata: 'ACC' },
  'Dakar':           { name: 'Blaise Diagne International Airport',      iata: 'DSS' },
  'Dar es Salaam':   { name: 'Julius Nyerere International Airport',     iata: 'DAR' },
  'Kigali':          { name: 'Kigali International Airport',             iata: 'KGL' },
  'Kampala':         { name: 'Entebbe International Airport',            iata: 'EBB' },
  // ── South & Central Asia ────────────────────────────────────────────────────
  'Mumbai':          { name: 'Chhatrapati Shivaji Maharaj International', iata: 'BOM' },
  'Delhi':           { name: 'Indira Gandhi International Airport',      iata: 'DEL' },
  'Bangalore':       { name: 'Kempegowda International Airport',         iata: 'BLR' },
  'Chennai':         { name: 'Chennai International Airport',            iata: 'MAA' },
  'Hyderabad':       { name: 'Rajiv Gandhi International Airport',       iata: 'HYD' },
  'Pune':            { name: 'Pune Airport',                             iata: 'PNQ' },
  'Goa':             { name: 'Goa International Airport',                iata: 'GOI' },
  'Jaipur':          { name: 'Jaipur International Airport',             iata: 'JAI' },
  'Kochi':           { name: 'Cochin International Airport',             iata: 'COK' },
  'Kathmandu':       { name: 'Tribhuvan International Airport',          iata: 'KTM' },
  'Colombo':         { name: 'Bandaranaike International Airport',       iata: 'CMB' },
  'Maldives':        { name: 'Velana International Airport',             iata: 'MLE' },
  'Karachi':         { name: 'Jinnah International Airport',             iata: 'KHI' },
  'Lahore':          { name: 'Allama Iqbal International Airport',       iata: 'LHE' },
  'Islamabad':       { name: 'Islamabad International Airport',          iata: 'ISB' },
  'Dhaka':           { name: 'Hazrat Shahjalal International Airport',   iata: 'DAC' },
  'Tashkent':        { name: 'Tashkent International Airport',           iata: 'TAS' },
  'Almaty':          { name: 'Almaty International Airport',             iata: 'ALA' },
  // ── East & Southeast Asia ────────────────────────────────────────────────────
  'Tokyo':           { name: 'Narita International Airport',             iata: 'NRT' },
  'Osaka':           { name: 'Kansai International Airport',             iata: 'KIX' },
  'Kyoto':           { name: 'Kansai International Airport',             iata: 'KIX' },
  'Sapporo':         { name: 'New Chitose Airport',                      iata: 'CTS' },
  'Hiroshima':       { name: 'Hiroshima Airport',                        iata: 'HIJ' },
  'Fukuoka':         { name: 'Fukuoka Airport',                          iata: 'FUK' },
  'Naha':            { name: 'Naha Airport',                             iata: 'OKA' },
  'Seoul':           { name: 'Incheon International Airport',            iata: 'ICN' },
  'Busan':           { name: 'Gimhae International Airport',             iata: 'PUS' },
  'Beijing':         { name: 'Beijing Capital International Airport',    iata: 'PEK' },
  'Shanghai':        { name: 'Shanghai Pudong International Airport',    iata: 'PVG' },
  'Hong Kong':       { name: 'Hong Kong International Airport',          iata: 'HKG' },
  'Guangzhou':       { name: 'Guangzhou Baiyun International Airport',   iata: 'CAN' },
  'Chengdu':         { name: 'Chengdu Tianfu International Airport',     iata: 'TFU' },
  'Taipei':          { name: 'Taiwan Taoyuan International Airport',     iata: 'TPE' },
  'Ulaanbaatar':     { name: 'Chinggis Khaan International Airport',     iata: 'ULN' },
  'Singapore':       { name: 'Singapore Changi Airport',                 iata: 'SIN' },
  'Bangkok':         { name: 'Suvarnabhumi Airport',                     iata: 'BKK' },
  'Chiang Mai':      { name: 'Chiang Mai International Airport',         iata: 'CNX' },
  'Phuket':          { name: 'Phuket International Airport',             iata: 'HKT' },
  'Kuala Lumpur':    { name: 'Kuala Lumpur International Airport',       iata: 'KUL' },
  'Penang':          { name: 'Penang International Airport',             iata: 'PEN' },
  'Manila':          { name: 'Ninoy Aquino International Airport',       iata: 'MNL' },
  'Cebu':            { name: 'Mactan-Cebu International Airport',        iata: 'CEB' },
  'Bali':            { name: 'Ngurah Rai International Airport',         iata: 'DPS' },
  'Jakarta':         { name: 'Soekarno–Hatta International Airport',     iata: 'CGK' },
  'Hanoi':           { name: 'Noi Bai International Airport',            iata: 'HAN' },
  'Ho Chi Minh':     { name: 'Tan Son Nhat International Airport',       iata: 'SGN' },
  'Hoi An':          { name: 'Da Nang International Airport',            iata: 'DAD' },
  'Phnom Penh':      { name: 'Phnom Penh International Airport',         iata: 'PNH' },
  'Siem Reap':       { name: 'Siem Reap International Airport',          iata: 'SAI' },
  'Vientiane':       { name: 'Wattay International Airport',             iata: 'VTE' },
  'Yangon':          { name: 'Yangon International Airport',             iata: 'RGN' },
  // ── Oceania ─────────────────────────────────────────────────────────────────
  'Sydney':          { name: 'Sydney Kingsford Smith Airport',           iata: 'SYD' },
  'Melbourne':       { name: 'Melbourne Airport',                        iata: 'MEL' },
  'Brisbane':        { name: 'Brisbane Airport',                         iata: 'BNE' },
  'Perth':           { name: 'Perth Airport',                            iata: 'PER' },
  'Adelaide':        { name: 'Adelaide Airport',                         iata: 'ADL' },
  'Cairns':          { name: 'Cairns Airport',                           iata: 'CNS' },
  'Auckland':        { name: 'Auckland Airport',                         iata: 'AKL' },
  'Wellington':      { name: 'Wellington Airport',                       iata: 'WLG' },
  'Christchurch':    { name: 'Christchurch Airport',                     iata: 'CHC' },
  'Queenstown':      { name: 'Queenstown Airport',                       iata: 'ZQN' },
  'Fiji':            { name: 'Nadi International Airport',               iata: 'NAN' },
  'Papeete':         { name: 'Faa\'a International Airport',             iata: 'PPT' },
};

function findAirport(loc: string): { name: string; iata: string; city: string } | null {
  if (!loc) return null;
  const lower = loc.toLowerCase();
  // Exact match first
  for (const [key, val] of Object.entries(AIRPORTS)) {
    if (key.toLowerCase() === lower) return { ...val, city: key };
  }
  // Partial match — location string contains the city name or vice versa
  for (const [key, val] of Object.entries(AIRPORTS)) {
    const k = key.toLowerCase();
    if (lower.includes(k) || k.includes(lower.split(',')[0].trim())) return { ...val, city: key };
  }
  return null;
}

// Country label centroids (rendered as text only, no dot)
const COUNTRY_LABELS = [
  { name: 'United States',  lat: 39.5,   lon: -98.5   },
  { name: 'Canada',         lat: 60.0,   lon: -96.0   },
  { name: 'Mexico',         lat: 23.0,   lon: -102.0  },
  { name: 'Brazil',         lat: -10.0,  lon: -53.0   },
  { name: 'Argentina',      lat: -36.0,  lon: -66.0   },
  { name: 'Chile',          lat: -35.0,  lon: -71.0   },
  { name: 'Colombia',       lat: 4.0,    lon: -74.0   },
  { name: 'Peru',           lat: -9.0,   lon: -75.0   },
  { name: 'Venezuela',      lat: 8.0,    lon: -66.0   },
  { name: 'Bolivia',        lat: -16.0,  lon: -64.0   },
  { name: 'United Kingdom', lat: 55.0,   lon: -3.0    },
  { name: 'France',         lat: 46.0,   lon: 2.5     },
  { name: 'Germany',        lat: 51.0,   lon: 10.0    },
  { name: 'Spain',          lat: 40.0,   lon: -3.0    },
  { name: 'Italy',          lat: 42.5,   lon: 12.5    },
  { name: 'Portugal',       lat: 39.5,   lon: -8.0    },
  { name: 'Sweden',         lat: 62.0,   lon: 16.0    },
  { name: 'Norway',         lat: 65.0,   lon: 13.0    },
  { name: 'Finland',        lat: 64.0,   lon: 26.0    },
  { name: 'Poland',         lat: 52.0,   lon: 20.0    },
  { name: 'Ukraine',        lat: 49.0,   lon: 32.0    },
  { name: 'Russia',         lat: 61.0,   lon: 105.0   },
  { name: 'Turkey',         lat: 39.0,   lon: 35.0    },
  { name: 'Iran',           lat: 32.0,   lon: 53.0    },
  { name: 'Saudi Arabia',   lat: 24.0,   lon: 45.0    },
  { name: 'Egypt',          lat: 26.0,   lon: 30.0    },
  { name: 'Nigeria',        lat: 9.0,    lon: 8.0     },
  { name: 'Ethiopia',       lat: 9.0,    lon: 40.0    },
  { name: 'South Africa',   lat: -29.0,  lon: 25.0    },
  { name: 'Kenya',          lat: 0.0,    lon: 38.0    },
  { name: 'Tanzania',       lat: -6.0,   lon: 35.0    },
  { name: 'India',          lat: 22.0,   lon: 80.0    },
  { name: 'China',          lat: 35.0,   lon: 103.0   },
  { name: 'Japan',          lat: 36.5,   lon: 138.0   },
  { name: 'South Korea',    lat: 36.5,   lon: 127.5   },
  { name: 'Australia',      lat: -25.0,  lon: 134.0   },
  { name: 'New Zealand',    lat: -42.0,  lon: 174.0   },
  { name: 'Indonesia',      lat: -2.5,   lon: 118.0   },
  { name: 'Philippines',    lat: 12.0,   lon: 123.0   },
  { name: 'Thailand',       lat: 15.0,   lon: 101.0   },
  { name: 'Vietnam',        lat: 16.0,   lon: 108.0   },
  { name: 'Myanmar',        lat: 19.0,   lon: 96.5    },
  { name: 'Pakistan',       lat: 30.0,   lon: 70.0    },
  { name: 'Afghanistan',    lat: 33.0,   lon: 66.0    },
  { name: 'Kazakhstan',     lat: 48.0,   lon: 68.0    },
  { name: 'Mongolia',       lat: 46.0,   lon: 105.0   },
  { name: 'Morocco',        lat: 32.0,   lon: -6.0    },
  { name: 'Algeria',        lat: 28.0,   lon: 3.0     },
  { name: 'Sudan',          lat: 15.0,   lon: 30.0    },
  { name: 'DR Congo',       lat: -4.0,   lon: 24.0    },
  { name: 'Angola',         lat: -11.0,  lon: 18.0    },
  { name: 'Mozambique',     lat: -18.0,  lon: 35.0    },
  { name: 'Zambia',         lat: -14.0,  lon: 28.0    },
  { name: 'Zimbabwe',       lat: -19.0,  lon: 30.0    },
  { name: 'Madagascar',     lat: -20.0,  lon: 47.0    },
  { name: 'Iraq',           lat: 33.0,   lon: 44.0    },
  { name: 'Syria',          lat: 35.0,   lon: 38.0    },
  { name: 'Jordan',         lat: 31.0,   lon: 36.5    },
  { name: 'Israel',         lat: 31.5,   lon: 34.8    },
  { name: 'Greece',         lat: 39.0,   lon: 22.0    },
  { name: 'Romania',        lat: 46.0,   lon: 25.0    },
  { name: 'Czech Rep.',     lat: 49.8,   lon: 15.5    },
  { name: 'Hungary',        lat: 47.0,   lon: 19.5    },
  { name: 'Austria',        lat: 47.5,   lon: 14.5    },
  { name: 'Switzerland',    lat: 47.0,   lon: 8.2     },
  { name: 'Belarus',        lat: 53.5,   lon: 28.0    },
  { name: 'Malaysia',       lat: 2.5,    lon: 112.5   },
  { name: 'Sri Lanka',      lat: 7.8,    lon: 80.7    },
  { name: 'Nepal',          lat: 28.0,   lon: 84.0    },
  { name: 'Bangladesh',     lat: 24.0,   lon: 90.0    },
  { name: 'UAE',            lat: 24.0,   lon: 54.0    },
  { name: 'Ghana',          lat: 7.9,    lon: -1.0    },
  { name: 'Senegal',        lat: 14.5,   lon: -14.0   },
  { name: 'Uganda',         lat: 1.5,    lon: 32.0    },
  { name: 'Rwanda',         lat: -2.0,   lon: 30.0    },
  { name: 'Libya',          lat: 26.0,   lon: 17.0    },
  { name: 'Tunisia',        lat: 34.0,   lon: 9.0     },
  { name: 'Cambodia',       lat: 12.5,   lon: 104.5   },
  { name: 'Laos',           lat: 18.0,   lon: 103.0   },
  { name: 'Papua New Guinea', lat: -6.0, lon: 147.0   },
];

// US state label centroids
const STATE_LABELS = [
  { name: 'California',     lat: 36.7,   lon: -119.4  },
  { name: 'Texas',          lat: 31.0,   lon: -100.0  },
  { name: 'Florida',        lat: 27.7,   lon: -81.5   },
  { name: 'New York',       lat: 42.9,   lon: -75.1   },
  { name: 'Illinois',       lat: 40.0,   lon: -89.0   },
  { name: 'Pennsylvania',   lat: 40.9,   lon: -77.8   },
  { name: 'Ohio',           lat: 40.3,   lon: -82.8   },
  { name: 'Georgia',        lat: 32.7,   lon: -83.5   },
  { name: 'Michigan',       lat: 44.3,   lon: -85.4   },
  { name: 'Washington',     lat: 47.4,   lon: -120.5  },
  { name: 'Arizona',        lat: 34.3,   lon: -111.1  },
  { name: 'Colorado',       lat: 39.0,   lon: -105.5  },
  { name: 'Nevada',         lat: 38.5,   lon: -117.1  },
  { name: 'Oregon',         lat: 44.0,   lon: -120.5  },
  { name: 'Utah',           lat: 39.3,   lon: -111.5  },
  { name: 'Minnesota',      lat: 46.4,   lon: -93.9   },
  { name: 'Wisconsin',      lat: 44.3,   lon: -89.8   },
  { name: 'Missouri',       lat: 38.4,   lon: -92.5   },
  { name: 'Indiana',        lat: 40.3,   lon: -86.1   },
  { name: 'Tennessee',      lat: 35.9,   lon: -86.7   },
  { name: 'North Carolina', lat: 35.6,   lon: -79.4   },
  { name: 'Virginia',       lat: 37.8,   lon: -79.5   },
  { name: 'Alabama',        lat: 32.8,   lon: -86.8   },
  { name: 'Louisiana',      lat: 31.2,   lon: -91.8   },
  { name: 'Kentucky',       lat: 37.7,   lon: -84.3   },
  { name: 'South Carolina', lat: 33.9,   lon: -81.2   },
  { name: 'Mississippi',    lat: 32.7,   lon: -89.6   },
  { name: 'Arkansas',       lat: 34.8,   lon: -92.2   },
  { name: 'Kansas',         lat: 38.5,   lon: -98.4   },
  { name: 'Nebraska',       lat: 41.5,   lon: -99.9   },
  { name: 'Iowa',           lat: 42.1,   lon: -93.2   },
  { name: 'Oklahoma',       lat: 35.6,   lon: -97.5   },
  { name: 'New Mexico',     lat: 34.3,   lon: -106.0  },
  { name: 'Idaho',          lat: 44.3,   lon: -114.5  },
  { name: 'Montana',        lat: 46.9,   lon: -110.4  },
  { name: 'Wyoming',        lat: 43.0,   lon: -107.6  },
  { name: 'North Dakota',   lat: 47.4,   lon: -100.5  },
  { name: 'South Dakota',   lat: 44.4,   lon: -100.4  },
  { name: 'Alaska',         lat: 64.2,   lon: -153.0  },
  { name: 'Hawaii',         lat: 20.8,   lon: -156.3  },
  { name: 'Maine',          lat: 45.3,   lon: -69.0   },
  { name: 'Vermont',        lat: 44.1,   lon: -72.7   },
  { name: 'New Hampshire',  lat: 43.7,   lon: -71.6   },
  { name: 'Massachusetts',  lat: 42.3,   lon: -71.8   },
  { name: 'Connecticut',    lat: 41.6,   lon: -72.7   },
  { name: 'Rhode Island',   lat: 41.7,   lon: -71.6   },
  { name: 'Delaware',       lat: 38.9,   lon: -75.5   },
  { name: 'Maryland',       lat: 39.0,   lon: -76.8   },
  { name: 'West Virginia',  lat: 38.9,   lon: -80.5   },
];

// ─── Globe helpers / R3F components ──────────────────────────────────────────

function latLonTo3D(lat: number, lon: number, r: number): [number, number, number] {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  ];
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // miles
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── GeoJSON types ───────────────────────────────────────────────────────────

interface GeoFeature {
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}
interface GeoCollection {
  features: GeoFeature[];
}

// Great-circle arc lines connecting the trip route on the sphere
function RouteArcs({ startLat, startLon, selectedCities }: {
  startLat: number; startLon: number; selectedCities: string[];
}) {
  const geometry = useMemo(() => {
    const stops: { lat: number; lon: number }[] = [
      { lat: startLat, lon: startLon },
      ...selectedCities
        .map(name => GLOBE_CITIES.find(c => c.name === name))
        .filter((c): c is typeof GLOBE_CITIES[0] => !!c),
    ];
    if (stops.length < 2) return null;

    const SEGS = 80;
    const BASE_R = 1.012;
    const ARC_H  = 0.045; // max height above surface at midpoint
    const pts: number[] = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const a = new THREE.Vector3(...latLonTo3D(stops[i].lat,   stops[i].lon,   1)).normalize();
      const b = new THREE.Vector3(...latLonTo3D(stops[i+1].lat, stops[i+1].lon, 1)).normalize();
      for (let t = 0; t <= SEGS; t++) {
        const f   = t / SEGS;
        const arc = Math.sin(Math.PI * f); // 0→1→0 bell curve
        const r   = BASE_R + ARC_H * arc;
        const pt  = new THREE.Vector3().lerpVectors(a, b, f).normalize().multiplyScalar(r);
        pts.push(pt.x, pt.y, pt.z);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, [startLat, startLon, selectedCities]);

  const lineObj = useMemo(() => {
    if (!geometry) return null;
    const mat = new THREE.LineBasicMaterial({ color: '#7CFC00', transparent: true, opacity: 0.85 });
    return new THREE.Line(geometry, mat);
  }, [geometry]);

  if (!lineObj) return null;
  return <primitive object={lineObj} />;
}

// Renders GeoJSON country/state borders as thin lines on the sphere surface
function BorderLines({ geojson }: { geojson: GeoCollection | null }) {
  const geo = useMemo(() => {
    if (!geojson) return null;
    const pts: number[] = [];
    const R = 1.003; // just above sphere surface

    function addRing(ring: number[][]) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        const [x1, y1, z1] = latLonTo3D(lat1, lon1, R);
        const [x2, y2, z2] = latLonTo3D(lat2, lon2, R);
        pts.push(x1, y1, z1, x2, y2, z2);
      }
    }

    for (const feature of geojson.features) {
      const { type, coordinates } = feature.geometry;
      if (type === 'Polygon') {
        for (const ring of coordinates as number[][][]) addRing(ring);
      } else if (type === 'MultiPolygon') {
        for (const poly of coordinates as number[][][][]) {
          for (const ring of poly) addRing(ring);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [geojson]);

  if (!geo) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#4488bb" transparent opacity={0.38} />
    </lineSegments>
  );
}

function CityDot({ lat, lon, name, selected, onToggle, onHover, wasDragged }: {
  lat: number; lon: number; name: string; selected: boolean;
  onToggle: () => void;
  onHover: (n: string | null) => void;
  wasDragged: React.MutableRefObject<boolean>;
}) {
  const [hov, setHov] = useState(false);
  const pos = useMemo(() => latLonTo3D(lat, lon, 1.015), [lat, lon]);
  const dotColor = selected ? '#fbbf24' : hov ? '#38bdf8' : '#e2e8f0';
  const r = selected ? 0.007 : hov ? 0.006 : 0.0045;
  return (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); if (!wasDragged.current) onToggle(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHover(name); }}
      onPointerOut={() => { setHov(false); onHover(null); }}
    >
      <sphereGeometry args={[r, 6, 6]} />
      <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={selected ? 4 : hov ? 3 : 1.2} />
      <Html
        position={[0, r * 3 + 0.008, 0]}
        center
        distanceFactor={0.18}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        zIndexRange={[0, 0]}
      >
        <span style={{
          fontSize: 11,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: selected ? 700 : 500,
          color: selected ? '#fbbf24' : hov ? '#38bdf8' : '#ffffff',
          textShadow: '0 0 4px #000, 0 1px 3px #000',
          letterSpacing: '0.02em',
          opacity: hov || selected ? 1 : 0.75,
        }}>
          {name}
        </span>
      </Html>
    </mesh>
  );
}

// Text-only label (no dot) for country/state names
function GlobeTextLabel({ lat, lon, name, size = 'country' }: {
  lat: number; lon: number; name: string; size?: 'country' | 'state';
}) {
  const pos = useMemo(() => latLonTo3D(lat, lon, 1.018), [lat, lon]);
  return (
    <group position={pos}>
      <Html
        center
        distanceFactor={0.18}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        zIndexRange={[0, 0]}
      >
        <span style={{
          fontSize: size === 'country' ? 10 : 9,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 600,
          color: size === 'country' ? 'rgba(148,210,255,0.85)' : 'rgba(200,220,255,0.60)',
          textShadow: '0 0 3px #000, 0 1px 2px #000',
          letterSpacing: size === 'country' ? '0.12em' : '0.06em',
          textTransform: size === 'country' ? 'uppercase' : 'none',
        }}>
          {name}
        </span>
      </Html>
    </group>
  );
}

// Smoothly lerps camera Z position to target camZ value each frame
function CameraUpdater({ camZ }: { camZ: number }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.z += (camZ - camera.position.z) * 0.12;
  });
  return null;
}

// Textures are loaded OUTSIDE Canvas (in GlobePicker) and passed as props
// to avoid R3F fiber context timing issues with async texture loading.
function GlobeScene({ rotX, rotY, camZ, cities, startLat, startLon, selectedCities, onToggle, onHover, wasDragged, terrain, bump, geojson }: {
  rotX: number; rotY: number; camZ: number;
  cities: { name: string; lat: number; lon: number }[];
  startLat: number; startLon: number;
  selectedCities: string[];
  onToggle: (n: string) => void;
  onHover: (n: string | null) => void;
  wasDragged: React.MutableRefObject<boolean>;
  terrain: THREE.Texture | null;
  bump: THREE.Texture | null;
  geojson: GeoCollection | null;
}) {
  const startPos = useMemo(() => latLonTo3D(startLat, startLon, 1.022), [startLat, startLon]);

  // Only render cities on the front hemisphere (z > 0 after globe rotation)
  const visibleCities = useMemo(() => {
    const euler = new THREE.Euler(rotX, rotY, 0, 'XYZ');
    return cities.filter(c => {
      const [x, y, z] = latLonTo3D(c.lat, c.lon, 1);
      return new THREE.Vector3(x, y, z).applyEuler(euler).z > 0.05;
    });
  }, [cities, rotX, rotY]);

  const visibleCountries = useMemo(() => {
    const euler = new THREE.Euler(rotX, rotY, 0, 'XYZ');
    return COUNTRY_LABELS.filter(c => {
      const [x, y, z] = latLonTo3D(c.lat, c.lon, 1);
      return new THREE.Vector3(x, y, z).applyEuler(euler).z > 0.1;
    });
  }, [rotX, rotY]);

  const visibleStates = useMemo(() => {
    const euler = new THREE.Euler(rotX, rotY, 0, 'XYZ');
    return STATE_LABELS.filter(s => {
      const [x, y, z] = latLonTo3D(s.lat, s.lon, 1);
      return new THREE.Vector3(x, y, z).applyEuler(euler).z > 0.1;
    });
  }, [rotX, rotY]);

  return (
    <>
      <CameraUpdater camZ={camZ} />

      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 3, 4]}  intensity={2.2} color="#fff8f0" />
      <directionalLight position={[-2, -1, -3]} intensity={0.7} color="#4466ff" />
      <pointLight position={[0, 3, 3]} intensity={1.2} color="#ffffff" />

      <group rotation={[rotX, rotY, 0]}>
        {/* Earth sphere — same material props as home page */}
        <mesh>
          <sphereGeometry args={[1, isMobile ? 32 : 64, isMobile ? 32 : 64]} />
          <meshStandardMaterial
            map={terrain ?? undefined}
            color={terrain ? '#ffffff' : '#1e40af'}
            bumpMap={bump ?? undefined}
            bumpScale={bump ? 0.018 : 0}
            roughness={0.82}
            metalness={0}
          />
        </mesh>

        {/* Atmosphere rim */}
        <mesh scale={1.055}>
          <sphereGeometry args={[1, isMobile ? 16 : 32, isMobile ? 16 : 32]} />
          <meshBasicMaterial color="#3b72ff" transparent opacity={0.065} side={THREE.BackSide} />
        </mesh>

        {/* Country border lines */}
        <BorderLines geojson={geojson} />

        {/* Starting city — lawn green, 3× city dot size (200% bigger), non-interactive */}
        <mesh position={startPos}>
          <sphereGeometry args={[0.008, 10, 10]} />
          <meshStandardMaterial color="#7CFC00" emissive="#7CFC00" emissiveIntensity={4} roughness={0.1} metalness={0.2} />
        </mesh>

        {/* Route arcs between trip stops */}
        <RouteArcs startLat={startLat} startLon={startLon} selectedCities={selectedCities} />

        {/* City markers — only front-facing */}
        {visibleCities.map((c) => (
          <CityDot
            key={c.name}
            lat={c.lat} lon={c.lon} name={c.name}
            selected={selectedCities.includes(c.name)}
            onToggle={() => onToggle(c.name)}
            onHover={onHover}
            wasDragged={wasDragged}
          />
        ))}
        {/* Country labels */}
        {visibleCountries.map(c => (
          <GlobeTextLabel key={c.name} lat={c.lat} lon={c.lon} name={c.name} size="country" />
        ))}
        {/* US state labels */}
        {visibleStates.map(s => (
          <GlobeTextLabel key={s.name} lat={s.lat} lon={s.lon} name={s.name} size="state" />
        ))}
      </group>
    </>
  );
}

// Manual drag-to-rotate: no OrbitControls, so clicks on city dots work cleanly.
function GlobePicker({ startCity, selectedCities, onToggle, onHover }: {
  startCity: { name: string; lat: number; lon: number };
  selectedCities: string[];
  onToggle: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const [mounted,  setMounted]  = useState(false);
  const [rot,      setRot]      = useState<[number, number]>([0, 0]);
  const [terrain,  setTerrain]  = useState<THREE.Texture | null>(null);
  const [bump,     setBump]     = useState<THREE.Texture | null>(null);
  const [geojson,  setGeojson]  = useState<GeoCollection | null>(null);
  const [camZ,     setCamZ]     = useState(1.30);
  const ptr      = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasDragged = useRef(false);
  const [isDown, setIsDown] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      // Find the WebGL canvas inside the container
      const glCanvas = innerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!glCanvas) return;

      // Composite: WebGL canvas + watermark on a new 2D canvas
      const out = document.createElement('canvas');
      out.width  = glCanvas.width;
      out.height = glCanvas.height;
      const ctx = out.getContext('2d')!;

      ctx.drawImage(glCanvas, 0, 0);

      // Watermark pill — bottom right
      const pad = 12, ph = 28, fs = 13;
      const text = '✈ GeKnee';
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const pw = tw + pad * 2;
      const px = out.width  - pw - 14;
      const py = out.height - ph - 14;

      ctx.fillStyle = 'rgba(8,14,50,0.82)';
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(140,180,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 8);
      ctx.stroke();

      ctx.fillStyle = '#c8d8ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, px + pad, py + ph / 2);

      const blob: Blob = await new Promise(res => out.toBlob(b => res(b!), 'image/png'));
      const url = URL.createObjectURL(blob);

      // Try native share (mobile), fall back to download
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'geknee-globe.png', { type: 'image/png' })] })) {
        await navigator.share({
          title: 'My GeKnee Trip',
          text: `Planning a trip to ${selectedCities.join(', ')} ✈`,
          files: [new File([blob], 'geknee-globe.png', { type: 'image/png' })],
        });
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = 'geknee-globe.png'; a.click();
      }
      URL.revokeObjectURL(url);
    } finally {
      setSharing(false);
    }
  };

  // Load textures here (regular React context, NOT inside Canvas) for reliability
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load('/earth_terrain.jpg', (t) => {
      if (!cancelled) {
        t.colorSpace = THREE.SRGBColorSpace;
        setTerrain(t);
      }
    }, undefined, () => {});
    loader.load('/earth_bump.jpg', (t) => {
      if (!cancelled) setBump(t);
    }, undefined, () => {});
    return () => { cancelled = true; };
  }, []);

  // Load country borders GeoJSON (also in regular React context)
  useEffect(() => {
    let cancelled = false;
    fetch('/ne_110m_admin_0_countries.json')
      .then(r => r.json())
      .then(d => { if (!cancelled) setGeojson(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Wheel zoom — must be non-passive to call preventDefault
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamZ(z => Math.max(1.1, Math.min(2.8, z + e.deltaY * 0.002)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mounted]); // re-attach after mount renders the inner div

  // Center globe on starting city.
  // Globe group uses rotation={[rotX, rotY, 0]} → matrix Rx(rotX)·Ry(rotY).
  // We need Rx(rotX)·Ry(rotY)·P = (0,0,1).
  // Solving analytically: rotY = atan2(-px, pz), rotX = atan2(py, sqrt(px²+pz²))
  useEffect(() => {
    const [px, py, pz] = latLonTo3D(startCity.lat, startCity.lon, 1);
    const rotY = Math.atan2(-px, pz);
    const rotX = Math.atan2(py, Math.sqrt(px * px + pz * pz));
    setRot([rotX, rotY]);
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All cities (excluding starting city) — front-hemisphere filtering happens in GlobeScene
  const nearbyCities = useMemo(() =>
    GLOBE_CITIES.filter(c => c.name !== startCity.name),
    [startCity]
  );

  // Placeholder shown until WebGL is ready
  if (!mounted) {
    return (
      <div style={{
        width: '100%', height: 380,
        background: 'radial-gradient(circle at 38% 35%, #1e3a6e, #020c1e)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(34,211,238,0.5)', borderTopColor: '#22d3ee', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
      </div>
    );
  }

  return (
    <div
      ref={innerRef}
      style={{
        position: 'relative',
        width: '100%', height: 380, borderRadius: 16,
        background: '#020c1e',
        cursor: isDown ? 'grabbing' : 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
        touchAction: 'none',
        animation: 'globeDropIn 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
      onPointerDown={(e) => {
        ptr.current = { x: e.clientX, y: e.clientY, rx: rot[0], ry: rot[1] };
        wasDragged.current = false;
        setIsDown(true);
      }}
      onPointerMove={(e) => {
        if (!ptr.current) return;
        const dx = e.clientX - ptr.current.x;
        const dy = e.clientY - ptr.current.y;
        if (Math.hypot(dx, dy) > 4) wasDragged.current = true;
        setRot([
          ptr.current.rx + dy * 0.007,
          ptr.current.ry + dx * 0.007,
        ]);
      }}
      onPointerUp={() => { ptr.current = null; setIsDown(false); }}
      onPointerLeave={() => { ptr.current = null; setIsDown(false); }}
    >
      <Canvas
        camera={{ position: [0, 0, 1.30], fov: 45, near: 0.01, far: 10 }}
        style={{ display: 'block', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: isMobile ? "default" : "high-performance", preserveDrawingBuffer: true }}
      >
        <GlobeScene
          rotX={rot[0]} rotY={rot[1]} camZ={camZ}
          cities={nearbyCities}
          startLat={startCity.lat}
          startLon={startCity.lon}
          selectedCities={selectedCities}
          onToggle={onToggle}
          onHover={onHover}
          wasDragged={wasDragged}
          terrain={terrain}
          bump={bump}
          geojson={geojson}
        />
      </Canvas>

      {/* Share button — top right of globe */}
      <button
        onClick={(e) => { e.stopPropagation(); handleShare(); }}
        disabled={sharing}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 20,
          background: 'rgba(8,14,50,0.82)',
          border: '1px solid rgba(140,180,255,0.35)',
          color: '#c8d8ff', fontSize: 12, fontWeight: 600,
          cursor: sharing ? 'not-allowed' : 'pointer',
          opacity: sharing ? 0.6 : 1,
          backdropFilter: 'blur(8px)',
          transition: 'background 0.15s',
          pointerEvents: 'all',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,35,100,0.92)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(8,14,50,0.82)')}
      >
        {sharing ? '⏳' : '📤'} {sharing ? 'Saving…' : 'Share globe'}
      </button>
    </div>
  );
}

// ─── Shared style / preference components ────────────────────────────────────

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 15,
  padding: '11px 14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

function Card({ item, active, onClick, showSub }: {
  item: { id: string; label: string; icon: string; sub?: string; color?: string };
  active: boolean; onClick: () => void; showSub?: boolean;
}) {
  const c = item.color ?? '#22d3ee';
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 6, padding: '14px 8px', borderRadius: 14,
      border: active ? `2px solid ${c}` : '2px solid rgba(255,255,255,0.12)',
      background: active ? `linear-gradient(135deg,${c}22,${c}44)` : 'rgba(255,255,255,0.05)',
      color: '#fff', cursor: 'pointer', transition: 'all 0.18s ease',
      transform: active ? 'scale(1.04)' : 'scale(1)',
      boxShadow: active ? `0 0 18px ${c}55` : 'none',
    }}>
      <span style={{ fontSize: 26, lineHeight: 1 }}>{item.icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
      {showSub && item.sub && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{item.sub}</span>
      )}
    </button>
  );
}

function SingleGrid({ items, selected, onSelect }: {
  items: { id: string; label: string; icon: string; sub?: string; color?: string }[];
  selected: string; onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
      {items.map(item => <Card key={item.id} item={item} active={selected === item.id} onClick={() => onSelect(item.id)} showSub />)}
    </div>
  );
}

function MultiGrid({ items, selected, onToggle }: {
  items: { id: string; label: string; icon: string }[];
  selected: string[]; onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
      {items.map(item => <Card key={item.id} item={item} active={selected.includes(item.id)} onClick={() => onToggle(item.id)} />)}
    </div>
  );
}

function ChipToggle({ items, selected, onToggle }: {
  items: { id: string; label: string; icon: string }[];
  selected: string[]; onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {items.map(item => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 13px', borderRadius: 999,
              border: on ? '1.5px solid #22d3ee' : '1.5px solid rgba(255,255,255,0.15)',
              background: on ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.05)',
              color: on ? '#22d3ee' : 'rgba(255,255,255,0.65)',
              fontSize: 12, fontWeight: on ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: on ? '0 0 10px rgba(34,211,238,0.2)' : 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

type Prefs = { purpose: string; style: string; budget: string; interests: string[]; constraints: string[] };

function StyleForm() {
  const params   = useSearchParams();
  const router   = useRouter();
  const location = params.get('location') ?? '';

  // Find starting city in GLOBE_CITIES (case-insensitive partial match)
  const startCity = useMemo(() => {
    const loc = location.toLowerCase();
    return GLOBE_CITIES.find(c => loc.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(loc.split(',')[0].trim()))
      ?? { name: location || 'London', lat: 51.51, lon: -0.13 };
  }, [location]);

  // Pre-step state
  const [preStepDone,  setPreStepDone]  = useState(false);
  const [multiCity,    setMultiCity]    = useState(false);
  const [extraCities,  setExtraCities]  = useState<string[]>([]);
  const [cityInput,    setCityInput]    = useState('');
  const [hoveredCity,  setHoveredCity]  = useState<string | null>(null);
  const [travelingFrom,     setTravelingFrom]     = useState('');   // airport name + IATA
  const [travelingFromCity, setTravelingFromCity] = useState('');   // raw city name for label
  const [geoStatus,         setGeoStatus]         = useState<'idle' | 'loading' | 'done' | 'denied'>('idle');
  const [destAirport,  setDestAirport]  = useState(() => {
    const found = findAirport(params.get('location') ?? '');
    return found ? `${found.name} (${found.iata})` : '';
  });
  const [destCity, setDestCity] = useState(() => findAirport(params.get('location') ?? '')?.city ?? '');

  // IATA codes for flight price chart
  // Both fields store "Airport Name (IATA)" — extract from parentheses first,
  // then fall back to city-name lookup for manually typed plain text.
  const originIata = useMemo(() => {
    const fromParens = travelingFrom.match(/\(([A-Z]{3})\)/)?.[1];
    if (fromParens) return fromParens;
    return findAirport(travelingFrom)?.iata ?? '';
  }, [travelingFrom]);
  const destIata = useMemo(() => destAirport.match(/\(([A-Z]{3})\)/)?.[1] ?? '', [destAirport]);

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  function nightsBetween(a: string, b: string) {
    if (!a || !b) return null;
    const diff = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
    return diff > 0 ? Math.round(diff) : null;
  }
  const totalNights = nightsBetween(startDate, endDate);
  const datesValid  = !!totalNights;

  // Auto-fill origin city from browser geolocation (only if field is empty)
  useEffect(() => {
    if (travelingFrom || !navigator.geolocation) return;
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { longitude, latitude } = pos.coords;
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`
          );
          const data = await res.json() as { status: string; results?: Array<{ address_components: Array<{ long_name: string; types: string[] }>; formatted_address: string }> };
          const comps = data.results?.[0]?.address_components;
          const city = comps?.find(c => c.types.includes('locality'))?.long_name
            ?? data.results?.[0]?.formatted_address?.split(',')[0]?.trim();
          if (city) {
            const airport = findAirport(city);
            setTravelingFromCity(city);
            setTravelingFrom(airport ? `${airport.name} (${airport.iata})` : city);
            setGeoStatus('done');
          } else setGeoStatus('idle');
        } catch { setGeoStatus('idle'); }
      },
      () => setGeoStatus('denied'),
      { timeout: 8000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When multi-city panel becomes visible, fire a resize event after the browser
  // has painted so drei's Html components recalculate positions from display:none.
  useEffect(() => {
    if (!multiCity) return;
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [multiCity]);

  const [prefs, setPrefs] = useState<Prefs>({ purpose: '', style: '', budget: '', interests: [], constraints: [] });
  const [showConstraints, setShowConstraints] = useState(false);

  function toggleCity(name: string) {
    setExtraCities(c => c.includes(name) ? c.filter(x => x !== name) : [...c, name]);
  }
  function removeCityByName(name: string) {
    setExtraCities(c => c.filter(x => x !== name));
  }
  function addManualCity() {
    const t = cityInput.trim();
    if (t && !extraCities.includes(t)) setExtraCities(c => [...c, t]);
    setCityInput('');
  }

  function setSingle(key: 'purpose' | 'style' | 'budget', val: string) {
    setPrefs(p => ({ ...p, [key]: val }));
  }
  function toggleMulti(key: 'interests' | 'constraints', val: string) {
    setPrefs(p => {
      const cur = p[key];
      return { ...p, [key]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  }

  const canSubmit = !!prefs.purpose && !!prefs.budget;

  function submit() {
    if (!canSubmit) return;
    const q = new URLSearchParams({
      location,
      purpose:     prefs.purpose,
      style:       prefs.style,
      budget:      prefs.budget,
      interests:   prefs.interests.join(','),
      constraints: prefs.constraints.join(','),
      startDate,
      endDate,
      nights: String(totalNights ?? 0),
    });
    if (travelingFrom.trim()) q.set('travelingFrom', travelingFrom.trim());
    if (destAirport.trim()) q.set('travelingTo', destAirport.trim());
    if (multiCity && extraCities.length > 0) {
      q.set('stops', JSON.stringify(extraCities.map(city => ({ city }))));
    }
    router.push(`/plan/summary?${q.toString()}`);
  }

  const BG = (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 40% 45%,rgba(30,70,200,0.35) 0%,rgba(6,8,22,0.96) 58%,#030510 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.18) 1px,transparent 1px)', backgroundSize: '60px 60px', opacity: 0.35 }} />
    </>
  );

  const Badge = location ? (
    <div style={{ marginBottom: 20, padding: '6px 18px', borderRadius: 999, background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.4)', color: '#67e8f9', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0 }}>
      {'\u2708\uFE0F'} {location}
    </div>
  ) : null;

  // ── PRE-STEP ────────────────────────────────────────────────────────────────
  if (!preStepDone) {

    return (
      <main style={{ position: 'fixed', inset: 0, background: '#060816', overflow: 'hidden', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        {BG}
        <style>{`
          @keyframes globeDropIn {
            from { transform: translateY(-70px) scale(0.7); opacity: 0; }
            to   { transform: translateY(0)     scale(1);   opacity: 1; }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        <div style={{
          position: 'relative', zIndex: 10,
          height: '100vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '24px 20px 40px',
        }}>
          {Badge}

          <div style={{
            width: '100%', maxWidth: 560, borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.52)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            padding: '30px 26px 26px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
          }}>
            {/* Header */}
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em', marginBottom: 5, textTransform: 'uppercase' }}>
                Trip Setup
              </p>
              <h2 style={{ fontSize: 21, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3 }}>
                Plan your trip
              </h2>
            </div>

            {/* Traveling from */}
            <div style={{ marginBottom: 22 }}>
              {/* Label row — "TRAVELING FROM" + detected city chip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Traveling from
                </p>
                {geoStatus === 'loading' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)',
                    borderRadius: 999, padding: '2px 10px', fontSize: 11, color: '#22d3ee' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px solid rgba(34,211,238,0.3)', borderTopColor: '#22d3ee',
                      animation: 'spin 0.8s linear infinite', display: 'inline-block',
                    }} />
                    Detecting location…
                  </span>
                )}
                {geoStatus !== 'loading' && travelingFromCity && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
                    borderRadius: 999, padding: '3px 12px',
                    fontSize: 12, fontWeight: 600, color: '#22d3ee',
                  }}>
                    {String.fromCodePoint(0x1F4CD)} {travelingFromCity}
                  </span>
                )}
              </div>

              {/* Airport input */}
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Departure airport will appear here…"
                  value={travelingFrom}
                  onChange={e => { setTravelingFrom(e.target.value); setTravelingFromCity(''); }}
                  style={{ ...INPUT, fontSize: 14, paddingRight: travelingFrom ? 40 : undefined }}
                />
                {travelingFrom && (
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>
                    {String.fromCodePoint(0x2708, 0xFE0F)}
                  </span>
                )}
              </div>
              {travelingFrom && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '5px 0 0' }}>
                  Nearest commercial airport — edit if needed
                </p>
              )}
              {!travelingFrom && geoStatus === 'denied' && (
                <p style={{ fontSize: 11, color: 'rgba(255,100,100,0.6)', margin: '5px 0 0' }}>
                  Location access denied — type your departure airport above
                </p>
              )}
            </div>

            {/* Traveling to — nearest commercial airport to destination */}
            {location && (
              <div style={{ marginBottom: 22 }}>
                {/* Label row — "TRAVELING TO" + destination city chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Traveling to
                  </p>
                  {(destCity || location) && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)',
                      borderRadius: 999, padding: '3px 12px',
                      fontSize: 12, fontWeight: 600, color: '#a5b4fc',
                    }}>
                      {String.fromCodePoint(0x1F4CD)} {destCity || location}
                    </span>
                  )}
                </div>

                {/* Airport input */}
                <div style={{ position: 'relative' }}>
                  <input
                    placeholder="Arrival airport will appear here…"
                    value={destAirport}
                    onChange={e => setDestAirport(e.target.value)}
                    style={{ ...INPUT, fontSize: 14, paddingRight: destAirport ? 40 : undefined }}
                  />
                  {destAirport && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>
                      {String.fromCodePoint(0x2708, 0xFE0F)}
                    </span>
                  )}
                </div>
                {destAirport && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '5px 0 0' }}>
                    Nearest commercial airport — edit if needed
                  </p>
                )}
                {!destAirport && (
                  <p style={{ fontSize: 11, color: 'rgba(255,100,100,0.6)', margin: '5px 0 0' }}>
                    No airport found for {location} — type it manually
                  </p>
                )}
              </div>
            )}

            {/* Option tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 20 }}>
              {[
                { id: false, icon: String.fromCodePoint(0x1F3D6, 0xFE0F), label: 'Single Destination', sub: `Just ${location || 'one city'}`, border: '#22d3ee', glow: 'rgba(34,211,238,0.2)' },
                { id: true,  icon: String.fromCodePoint(0x1F5FA, 0xFE0F), label: 'Multi-City Trip',    sub: 'Add more destinations',           border: '#818cf8', glow: 'rgba(129,140,248,0.25)' },
              ].map(opt => (
                <button
                  key={String(opt.id)}
                  onClick={() => setMultiCity(opt.id)}
                  style={{
                    padding: '18px 10px', borderRadius: 16, cursor: 'pointer',
                    border: multiCity === opt.id ? `2px solid ${opt.border}` : '2px solid rgba(255,255,255,0.12)',
                    background: multiCity === opt.id ? `${opt.border}18` : 'rgba(255,255,255,0.05)',
                    color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    transition: 'all 0.18s',
                    boxShadow: multiCity === opt.id ? `0 0 20px ${opt.glow}` : 'none',
                    transform: multiCity === opt.id ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: 30 }}>{opt.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{opt.sub}</span>
                </button>
              ))}
            </div>

            {/* Date pickers — always shown after trip type selection */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Travel dates
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Departure</label>
                  <input
                    type="date" min={today} value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ ...INPUT, fontSize: 14, colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Return</label>
                  <input
                    type="date" min={startDate || today} value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ ...INPUT, fontSize: 14, colorScheme: 'dark' }}
                  />
                </div>
              </div>
              {totalNights !== null && (
                <p style={{ color: '#22d3ee', fontSize: 12, textAlign: 'center', margin: '10px 0 0', fontWeight: 600 }}>
                  {totalNights} night{totalNights !== 1 ? 's' : ''}
                  {multiCity && extraCities.length > 0
                    ? ' \u2014 GeKnee will split time between cities'
                    : location ? ` in ${location}` : ''}
                </p>
              )}

              {/* Flight price chart — appears once both dates are selected */}
              {startDate && endDate && (
                <FlightPriceChart
                  originIata={originIata}
                  destIata={destIata}
                  startDate={startDate}
                  endDate={endDate}
                  onSelectStart={d => setStartDate(d)}
                  onSelectEnd={d => setEndDate(d)}
                />
              )}
            </div>

            {/* Globe picker — drops in when multi-city selected */}
            {/* GlobePicker stays mounted always — CSS show/hide prevents WebGL remount/context-loss on tab switch */}
            <div style={{ display: multiCity ? 'flex' : 'none', flexDirection: 'column', alignItems: 'stretch', gap: 14, width: '100%' }}>

                <GlobePicker
                  startCity={startCity}
                  selectedCities={extraCities}
                  onToggle={toggleCity}
                  onHover={setHoveredCity}
                />

                {/* Hover hint / instruction */}
                <p style={{ color: hoveredCity ? '#38bdf8' : 'rgba(255,255,255,0.35)', fontSize: 12, margin: 0, textAlign: 'center', letterSpacing: '0.03em', minHeight: 18, transition: 'color 0.2s' }}>
                  {hoveredCity
                    ? `${extraCities.includes(hoveredCity) ? 'Click to remove' : 'Click to add'}: ${hoveredCity}`
                    : 'Drag to rotate \u00B7 click a city to add it as a stop'}
                </p>

                {/* Selected chips */}
                {extraCities.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', width: '100%' }}>
                    {extraCities.map(city => (
                      <div key={city} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
                        borderRadius: 999, padding: '4px 10px 4px 13px',
                        color: '#fbbf24', fontSize: 12, fontWeight: 600,
                      }}>
                        {city}
                        <button onClick={() => removeCityByName(city)} style={{ background: 'none', border: 'none', color: 'rgba(251,191,36,0.55)', fontSize: 15, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual input */}
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <input
                    placeholder="Or type any city..."
                    value={cityInput}
                    onChange={e => setCityInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addManualCity()}
                    style={{ ...INPUT, flex: 1, fontSize: 13, padding: '9px 12px' }}
                  />
                  <button
                    onClick={addManualCity}
                    disabled={!cityInput.trim()}
                    style={{
                      padding: '9px 16px', borderRadius: 10, border: 'none', flexShrink: 0,
                      background: cityInput.trim() ? 'rgba(129,140,248,0.75)' : 'rgba(255,255,255,0.08)',
                      color: cityInput.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                      fontSize: 13, fontWeight: 600,
                      cursor: cityInput.trim() ? 'pointer' : 'default',
                    }}
                  >
                    Add
                  </button>
                </div>

            </div>


            {/* Continue */}
            <button
              onClick={() => datesValid && setPreStepDone(true)}
              disabled={!datesValid}
              style={{
                marginTop: multiCity ? 18 : 4,
                width: '100%', padding: '13px 24px', borderRadius: 14, border: 'none',
                background: datesValid ? 'linear-gradient(135deg,#06b6d4,#3b82f6)' : 'rgba(255,255,255,0.1)',
                color: datesValid ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: 15, fontWeight: 700,
                cursor: datesValid ? 'pointer' : 'not-allowed',
                boxShadow: datesValid ? '0 4px 20px rgba(6,182,212,0.38)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {datesValid ? `Continue \u2192` : 'Select travel dates to continue'}
            </button>
          </div>

          <a href="/" style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
            &larr; Back to globe
          </a>
        </div>
      </main>
    );
  }

  // ── PREFERENCES (single scrollable card) ─────────────────────────────────────
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#060816', overflow: 'hidden', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      {BG}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .pref-section + .pref-section { border-top: 1px solid rgba(255,255,255,0.07); padding-top: 22px; margin-top: 4px; }
      `}</style>

      <div style={{
        position: 'relative', zIndex: 10,
        height: '100vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '28px 16px 48px',
      }}>
        {Badge}

        <div style={{
          width: '100%', maxWidth: 580,
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.13)',
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          padding: '30px 28px 28px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          animation: 'fadeInUp 0.35s ease both',
        }}>

          {/* Header */}
          <div style={{ marginBottom: 26 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>
              Trip Preferences
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3 }}>
              Tell us about your trip
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '5px 0 0' }}>
              2 quick picks required &mdash; everything else is optional
            </p>
          </div>

          {/* ── Purpose ──────────────────────────────────────────────────── */}
          <div className="pref-section" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Reason for your trip
              </p>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '1px 6px' }}>required</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {PURPOSES.map(item => <Card key={item.id} item={item} active={prefs.purpose === item.id} onClick={() => setSingle('purpose', item.id)} />)}
            </div>
          </div>

          {/* ── Budget ───────────────────────────────────────────────────── */}
          <div className="pref-section" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Daily budget
              </p>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '1px 6px' }}>required</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {BUDGETS.map(item => <Card key={item.id} item={item} active={prefs.budget === item.id} onClick={() => setSingle('budget', item.id)} showSub />)}
            </div>
          </div>

          {/* ── Style ────────────────────────────────────────────────────── */}
          <div className="pref-section" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Travel style
              </p>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px' }}>optional</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {STYLES.map(item => <Card key={item.id} item={item} active={prefs.style === item.id} onClick={() => setSingle('style', item.id)} />)}
            </div>
          </div>

          {/* ── Interests ────────────────────────────────────────────────── */}
          <div className="pref-section" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Interests
              </p>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px' }}>optional</span>
              {prefs.interests.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#22d3ee', marginLeft: 'auto' }}>
                  {prefs.interests.length} selected
                </span>
              )}
            </div>
            <ChipToggle items={INTERESTS} selected={prefs.interests} onToggle={v => toggleMulti('interests', v)} />
          </div>

          {/* ── Special requirements (collapsed) ─────────────────────────── */}
          <div className="pref-section" style={{ marginBottom: 26 }}>
            <button
              onClick={() => setShowConstraints(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: showConstraints ? '#22d3ee' : 'rgba(255,255,255,0.45)',
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                transition: 'color 0.15s',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 4,
                border: `1.5px solid ${showConstraints ? '#22d3ee' : 'rgba(255,255,255,0.2)'}`,
                fontSize: 14, lineHeight: 1, transition: 'all 0.15s',
                color: showConstraints ? '#22d3ee' : 'rgba(255,255,255,0.3)',
              }}>
                {showConstraints ? '\u2212' : '+'}
              </span>
              Special requirements
              {prefs.constraints.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#22d3ee', marginLeft: 4 }}>
                  ({prefs.constraints.length})
                </span>
              )}
            </button>
            {showConstraints && (
              <div style={{ marginTop: 14, animation: 'fadeInUp 0.2s ease both' }}>
                <ChipToggle items={CONSTRAINTS} selected={prefs.constraints} onToggle={v => toggleMulti('constraints', v)} />
              </div>
            )}
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setPreStepDone(false)}
              style={{
                flex: '0 0 auto', padding: '12px 20px', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              &larr; Back
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: '13px 24px', borderRadius: 14, border: 'none',
                background: canSubmit ? 'linear-gradient(135deg,#06b6d4,#3b82f6)' : 'rgba(255,255,255,0.08)',
                color: canSubmit ? '#fff' : 'rgba(255,255,255,0.25)',
                fontSize: 15, fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 4px 22px rgba(6,182,212,0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {canSubmit ? `${String.fromCodePoint(0x2728)} Build My Trip` : 'Choose a purpose and budget to continue'}
            </button>
          </div>
        </div>

        <a href="/" style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
          &larr; Back to globe
        </a>
      </div>
    </main>
  );
}

export default function StylePage() {
  return (
    <Suspense fallback={
      <main style={{ position: 'fixed', inset: 0, background: '#060816', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>Loading...</p>
      </main>
    }>
      <StyleForm />
    </Suspense>
  );
}
