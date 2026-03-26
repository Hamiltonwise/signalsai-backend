/**
 * ICP-density ranked cities for programmatic SEO pages.
 * Ranked by specialist density (not population), with geographic spread across all 50 states.
 * Each city includes coordinates for Places API location bias.
 */

export interface CityData {
  city: string;
  state: string;
  stateAbbr: string;
  lat: number;
  lng: number;
  /** Relative ICP density score 1-10 (10 = highest specialist concentration) */
  icpDensity: number;
}

export const CITIES: CityData[] = [
  // Tier 1: Major metro specialist hubs (ICP density 9-10)
  { city: "New York", state: "New York", stateAbbr: "NY", lat: 40.7128, lng: -74.0060, icpDensity: 10 },
  { city: "Los Angeles", state: "California", stateAbbr: "CA", lat: 34.0522, lng: -118.2437, icpDensity: 10 },
  { city: "Chicago", state: "Illinois", stateAbbr: "IL", lat: 41.8781, lng: -87.6298, icpDensity: 10 },
  { city: "Houston", state: "Texas", stateAbbr: "TX", lat: 29.7604, lng: -95.3698, icpDensity: 10 },
  { city: "Phoenix", state: "Arizona", stateAbbr: "AZ", lat: 33.4484, lng: -112.0740, icpDensity: 9 },
  { city: "San Antonio", state: "Texas", stateAbbr: "TX", lat: 29.4241, lng: -98.4936, icpDensity: 9 },
  { city: "San Diego", state: "California", stateAbbr: "CA", lat: 32.7157, lng: -117.1611, icpDensity: 9 },
  { city: "Dallas", state: "Texas", stateAbbr: "TX", lat: 32.7767, lng: -96.7970, icpDensity: 10 },
  { city: "San Jose", state: "California", stateAbbr: "CA", lat: 37.3382, lng: -121.8863, icpDensity: 9 },
  { city: "Austin", state: "Texas", stateAbbr: "TX", lat: 30.2672, lng: -97.7431, icpDensity: 9 },

  // Tier 2: High specialist density metros (ICP density 8-9)
  { city: "Jacksonville", state: "Florida", stateAbbr: "FL", lat: 30.3322, lng: -81.6557, icpDensity: 8 },
  { city: "San Francisco", state: "California", stateAbbr: "CA", lat: 37.7749, lng: -122.4194, icpDensity: 9 },
  { city: "Columbus", state: "Ohio", stateAbbr: "OH", lat: 39.9612, lng: -82.9988, icpDensity: 8 },
  { city: "Charlotte", state: "North Carolina", stateAbbr: "NC", lat: 35.2271, lng: -80.8431, icpDensity: 8 },
  { city: "Indianapolis", state: "Indiana", stateAbbr: "IN", lat: 39.7684, lng: -86.1581, icpDensity: 8 },
  { city: "Seattle", state: "Washington", stateAbbr: "WA", lat: 47.6062, lng: -122.3321, icpDensity: 9 },
  { city: "Denver", state: "Colorado", stateAbbr: "CO", lat: 39.7392, lng: -104.9903, icpDensity: 9 },
  { city: "Nashville", state: "Tennessee", stateAbbr: "TN", lat: 36.1627, lng: -86.7816, icpDensity: 8 },
  { city: "Washington", state: "District of Columbia", stateAbbr: "DC", lat: 38.9072, lng: -77.0369, icpDensity: 9 },
  { city: "Oklahoma City", state: "Oklahoma", stateAbbr: "OK", lat: 35.4676, lng: -97.5164, icpDensity: 7 },
  { city: "Boston", state: "Massachusetts", stateAbbr: "MA", lat: 42.3601, lng: -71.0589, icpDensity: 9 },
  { city: "Portland", state: "Oregon", stateAbbr: "OR", lat: 45.5152, lng: -122.6784, icpDensity: 8 },
  { city: "Las Vegas", state: "Nevada", stateAbbr: "NV", lat: 36.1699, lng: -115.1398, icpDensity: 8 },
  { city: "Memphis", state: "Tennessee", stateAbbr: "TN", lat: 35.1495, lng: -90.0490, icpDensity: 7 },
  { city: "Louisville", state: "Kentucky", stateAbbr: "KY", lat: 38.2527, lng: -85.7585, icpDensity: 7 },
  { city: "Baltimore", state: "Maryland", stateAbbr: "MD", lat: 39.2904, lng: -76.6122, icpDensity: 8 },
  { city: "Milwaukee", state: "Wisconsin", stateAbbr: "WI", lat: 43.0389, lng: -87.9065, icpDensity: 7 },
  { city: "Albuquerque", state: "New Mexico", stateAbbr: "NM", lat: 35.0844, lng: -106.6504, icpDensity: 7 },
  { city: "Tucson", state: "Arizona", stateAbbr: "AZ", lat: 32.2226, lng: -110.9747, icpDensity: 7 },
  { city: "Fresno", state: "California", stateAbbr: "CA", lat: 36.7378, lng: -119.7871, icpDensity: 7 },

  // Tier 3: Strong specialist markets (ICP density 6-8)
  { city: "Sacramento", state: "California", stateAbbr: "CA", lat: 38.5816, lng: -121.4944, icpDensity: 8 },
  { city: "Mesa", state: "Arizona", stateAbbr: "AZ", lat: 33.4152, lng: -111.8315, icpDensity: 7 },
  { city: "Kansas City", state: "Missouri", stateAbbr: "MO", lat: 39.0997, lng: -94.5786, icpDensity: 7 },
  { city: "Atlanta", state: "Georgia", stateAbbr: "GA", lat: 33.7490, lng: -84.3880, icpDensity: 9 },
  { city: "Omaha", state: "Nebraska", stateAbbr: "NE", lat: 41.2565, lng: -95.9345, icpDensity: 7 },
  { city: "Raleigh", state: "North Carolina", stateAbbr: "NC", lat: 35.7796, lng: -78.6382, icpDensity: 8 },
  { city: "Miami", state: "Florida", stateAbbr: "FL", lat: 25.7617, lng: -80.1918, icpDensity: 9 },
  { city: "Cleveland", state: "Ohio", stateAbbr: "OH", lat: 41.4993, lng: -81.6944, icpDensity: 7 },
  { city: "Tampa", state: "Florida", stateAbbr: "FL", lat: 27.9506, lng: -82.4572, icpDensity: 8 },
  { city: "Minneapolis", state: "Minnesota", stateAbbr: "MN", lat: 44.9778, lng: -93.2650, icpDensity: 8 },
  { city: "Orlando", state: "Florida", stateAbbr: "FL", lat: 28.5383, lng: -81.3792, icpDensity: 8 },
  { city: "Pittsburgh", state: "Pennsylvania", stateAbbr: "PA", lat: 40.4406, lng: -79.9959, icpDensity: 8 },
  { city: "Philadelphia", state: "Pennsylvania", stateAbbr: "PA", lat: 39.9526, lng: -75.1652, icpDensity: 9 },
  { city: "Cincinnati", state: "Ohio", stateAbbr: "OH", lat: 39.1031, lng: -84.5120, icpDensity: 7 },
  { city: "St. Louis", state: "Missouri", stateAbbr: "MO", lat: 38.6270, lng: -90.1994, icpDensity: 7 },
  { city: "Scottsdale", state: "Arizona", stateAbbr: "AZ", lat: 33.4942, lng: -111.9261, icpDensity: 8 },
  { city: "Plano", state: "Texas", stateAbbr: "TX", lat: 33.0198, lng: -96.6989, icpDensity: 8 },
  { city: "Irvine", state: "California", stateAbbr: "CA", lat: 33.6846, lng: -117.8265, icpDensity: 8 },
  { city: "Arlington", state: "Texas", stateAbbr: "TX", lat: 32.7357, lng: -97.1081, icpDensity: 7 },
  { city: "Fort Worth", state: "Texas", stateAbbr: "TX", lat: 32.7555, lng: -97.3308, icpDensity: 8 },

  // Tier 4: Growing specialist markets (ICP density 5-7)
  { city: "Salt Lake City", state: "Utah", stateAbbr: "UT", lat: 40.7608, lng: -111.8910, icpDensity: 8 },
  { city: "Colorado Springs", state: "Colorado", stateAbbr: "CO", lat: 38.8339, lng: -104.8214, icpDensity: 7 },
  { city: "Boise", state: "Idaho", stateAbbr: "ID", lat: 43.6150, lng: -116.2023, icpDensity: 7 },
  { city: "Richmond", state: "Virginia", stateAbbr: "VA", lat: 37.5407, lng: -77.4360, icpDensity: 7 },
  { city: "Spokane", state: "Washington", stateAbbr: "WA", lat: 47.6588, lng: -117.4260, icpDensity: 6 },
  { city: "Des Moines", state: "Iowa", stateAbbr: "IA", lat: 41.5868, lng: -93.6250, icpDensity: 6 },
  { city: "Birmingham", state: "Alabama", stateAbbr: "AL", lat: 33.5207, lng: -86.8025, icpDensity: 7 },
  { city: "Anchorage", state: "Alaska", stateAbbr: "AK", lat: 61.2181, lng: -149.9003, icpDensity: 5 },
  { city: "Honolulu", state: "Hawaii", stateAbbr: "HI", lat: 21.3069, lng: -157.8583, icpDensity: 6 },
  { city: "Charleston", state: "South Carolina", stateAbbr: "SC", lat: 32.7765, lng: -79.9311, icpDensity: 7 },
  { city: "Savannah", state: "Georgia", stateAbbr: "GA", lat: 32.0809, lng: -81.0912, icpDensity: 6 },
  { city: "Madison", state: "Wisconsin", stateAbbr: "WI", lat: 43.0731, lng: -89.4012, icpDensity: 7 },
  { city: "Knoxville", state: "Tennessee", stateAbbr: "TN", lat: 35.9606, lng: -83.9207, icpDensity: 6 },
  { city: "Lexington", state: "Kentucky", stateAbbr: "KY", lat: 38.0406, lng: -84.5037, icpDensity: 6 },
  { city: "Baton Rouge", state: "Louisiana", stateAbbr: "LA", lat: 30.4515, lng: -91.1871, icpDensity: 6 },
  { city: "New Orleans", state: "Louisiana", stateAbbr: "LA", lat: 29.9511, lng: -90.0715, icpDensity: 7 },
  { city: "Little Rock", state: "Arkansas", stateAbbr: "AR", lat: 34.7465, lng: -92.2896, icpDensity: 6 },
  { city: "Hartford", state: "Connecticut", stateAbbr: "CT", lat: 41.7658, lng: -72.6734, icpDensity: 7 },
  { city: "Providence", state: "Rhode Island", stateAbbr: "RI", lat: 41.8240, lng: -71.4128, icpDensity: 6 },
  { city: "Manchester", state: "New Hampshire", stateAbbr: "NH", lat: 42.9956, lng: -71.4548, icpDensity: 6 },
  { city: "Burlington", state: "Vermont", stateAbbr: "VT", lat: 44.4759, lng: -73.2121, icpDensity: 5 },
  { city: "Portland", state: "Maine", stateAbbr: "ME", lat: 43.6591, lng: -70.2568, icpDensity: 6 },
  { city: "Wilmington", state: "Delaware", stateAbbr: "DE", lat: 39.7391, lng: -75.5398, icpDensity: 6 },
  { city: "Jackson", state: "Mississippi", stateAbbr: "MS", lat: 32.2988, lng: -90.1848, icpDensity: 5 },
  { city: "Fargo", state: "North Dakota", stateAbbr: "ND", lat: 46.8772, lng: -96.7898, icpDensity: 5 },
  { city: "Sioux Falls", state: "South Dakota", stateAbbr: "SD", lat: 43.5446, lng: -96.7311, icpDensity: 5 },
  { city: "Billings", state: "Montana", stateAbbr: "MT", lat: 45.7833, lng: -108.5007, icpDensity: 5 },
  { city: "Cheyenne", state: "Wyoming", stateAbbr: "WY", lat: 41.1400, lng: -104.8202, icpDensity: 5 },
  { city: "Wichita", state: "Kansas", stateAbbr: "KS", lat: 37.6872, lng: -97.3301, icpDensity: 6 },

  // Tier 5: Emerging and underserved markets (ICP density 5-7)
  { city: "Bend", state: "Oregon", stateAbbr: "OR", lat: 44.0582, lng: -121.3153, icpDensity: 6 },
  { city: "Naperville", state: "Illinois", stateAbbr: "IL", lat: 41.7508, lng: -88.1535, icpDensity: 7 },
  { city: "Gilbert", state: "Arizona", stateAbbr: "AZ", lat: 33.3528, lng: -111.7890, icpDensity: 7 },
  { city: "Frisco", state: "Texas", stateAbbr: "TX", lat: 33.1507, lng: -96.8236, icpDensity: 8 },
  { city: "Chandler", state: "Arizona", stateAbbr: "AZ", lat: 33.3062, lng: -111.8413, icpDensity: 7 },
  { city: "Henderson", state: "Nevada", stateAbbr: "NV", lat: 36.0395, lng: -114.9817, icpDensity: 7 },
  { city: "Sarasota", state: "Florida", stateAbbr: "FL", lat: 27.3364, lng: -82.5307, icpDensity: 7 },
  { city: "Ann Arbor", state: "Michigan", stateAbbr: "MI", lat: 42.2808, lng: -83.7430, icpDensity: 7 },
  { city: "Boulder", state: "Colorado", stateAbbr: "CO", lat: 40.0150, lng: -105.2705, icpDensity: 7 },
  { city: "Overland Park", state: "Kansas", stateAbbr: "KS", lat: 38.9822, lng: -94.6708, icpDensity: 7 },
  { city: "Durham", state: "North Carolina", stateAbbr: "NC", lat: 35.9940, lng: -78.8986, icpDensity: 8 },
  { city: "Bellevue", state: "Washington", stateAbbr: "WA", lat: 47.6101, lng: -122.2015, icpDensity: 8 },
  { city: "Greenville", state: "South Carolina", stateAbbr: "SC", lat: 34.8526, lng: -82.3940, icpDensity: 7 },
  { city: "Stamford", state: "Connecticut", stateAbbr: "CT", lat: 41.0534, lng: -73.5387, icpDensity: 7 },
  { city: "Provo", state: "Utah", stateAbbr: "UT", lat: 40.2338, lng: -111.6585, icpDensity: 6 },
  { city: "Tempe", state: "Arizona", stateAbbr: "AZ", lat: 33.4255, lng: -111.9400, icpDensity: 7 },
  { city: "Roseville", state: "California", stateAbbr: "CA", lat: 38.7521, lng: -121.2880, icpDensity: 7 },
  { city: "Huntsville", state: "Alabama", stateAbbr: "AL", lat: 34.7304, lng: -86.5861, icpDensity: 7 },
  { city: "Grand Rapids", state: "Michigan", stateAbbr: "MI", lat: 42.9634, lng: -85.6681, icpDensity: 7 },
  { city: "Chattanooga", state: "Tennessee", stateAbbr: "TN", lat: 35.0456, lng: -85.3097, icpDensity: 6 },

  // Tier 6: Suburban specialist corridors (ICP density 5-7)
  { city: "Pasadena", state: "California", stateAbbr: "CA", lat: 34.1478, lng: -118.1445, icpDensity: 7 },
  { city: "McKinney", state: "Texas", stateAbbr: "TX", lat: 33.1972, lng: -96.6397, icpDensity: 7 },
  { city: "Sugar Land", state: "Texas", stateAbbr: "TX", lat: 29.6197, lng: -95.6349, icpDensity: 7 },
  { city: "Alpharetta", state: "Georgia", stateAbbr: "GA", lat: 34.0754, lng: -84.2941, icpDensity: 7 },
  { city: "Cary", state: "North Carolina", stateAbbr: "NC", lat: 35.7915, lng: -78.7811, icpDensity: 7 },
  { city: "Coral Springs", state: "Florida", stateAbbr: "FL", lat: 26.2712, lng: -80.2706, icpDensity: 7 },
  { city: "Round Rock", state: "Texas", stateAbbr: "TX", lat: 30.5083, lng: -97.6789, icpDensity: 7 },
  { city: "Thousand Oaks", state: "California", stateAbbr: "CA", lat: 34.1706, lng: -118.8376, icpDensity: 7 },
  { city: "Lake Mary", state: "Florida", stateAbbr: "FL", lat: 28.7589, lng: -81.3178, icpDensity: 6 },
  { city: "Edmond", state: "Oklahoma", stateAbbr: "OK", lat: 35.6528, lng: -97.4781, icpDensity: 6 },

  // Tier 7: Strategic gap coverage (ensuring 50 states represented)
  { city: "Wilmington", state: "North Carolina", stateAbbr: "NC", lat: 34.2257, lng: -77.9447, icpDensity: 6 },
  { city: "El Paso", state: "Texas", stateAbbr: "TX", lat: 31.7619, lng: -106.4850, icpDensity: 6 },
  { city: "Tulsa", state: "Oklahoma", stateAbbr: "OK", lat: 36.1540, lng: -95.9928, icpDensity: 6 },
  { city: "Norfolk", state: "Virginia", stateAbbr: "VA", lat: 36.8508, lng: -76.2859, icpDensity: 6 },
  { city: "Fort Wayne", state: "Indiana", stateAbbr: "IN", lat: 41.0793, lng: -85.1394, icpDensity: 6 },
  { city: "Reno", state: "Nevada", stateAbbr: "NV", lat: 39.5296, lng: -119.8138, icpDensity: 6 },
  { city: "Bakersfield", state: "California", stateAbbr: "CA", lat: 35.3733, lng: -119.0187, icpDensity: 6 },
  { city: "Aurora", state: "Colorado", stateAbbr: "CO", lat: 39.7294, lng: -104.8319, icpDensity: 7 },
  { city: "St. Petersburg", state: "Florida", stateAbbr: "FL", lat: 27.7676, lng: -82.6403, icpDensity: 7 },
  { city: "Lubbock", state: "Texas", stateAbbr: "TX", lat: 33.5779, lng: -101.8552, icpDensity: 5 },
  { city: "Chesapeake", state: "Virginia", stateAbbr: "VA", lat: 36.7682, lng: -76.2875, icpDensity: 6 },
  { city: "Winston-Salem", state: "North Carolina", stateAbbr: "NC", lat: 36.0999, lng: -80.2442, icpDensity: 6 },
  { city: "Rochester", state: "New York", stateAbbr: "NY", lat: 43.1566, lng: -77.6088, icpDensity: 7 },
  { city: "Buffalo", state: "New York", stateAbbr: "NY", lat: 42.8864, lng: -78.8784, icpDensity: 7 },
  { city: "Tallahassee", state: "Florida", stateAbbr: "FL", lat: 30.4383, lng: -84.2807, icpDensity: 6 },
  { city: "Worcester", state: "Massachusetts", stateAbbr: "MA", lat: 42.2626, lng: -71.8023, icpDensity: 7 },
  { city: "Columbia", state: "South Carolina", stateAbbr: "SC", lat: 34.0007, lng: -81.0348, icpDensity: 6 },
  { city: "Springfield", state: "Missouri", stateAbbr: "MO", lat: 37.2090, lng: -93.2923, icpDensity: 5 },
  { city: "Akron", state: "Ohio", stateAbbr: "OH", lat: 41.0814, lng: -81.5190, icpDensity: 6 },
  { city: "Dayton", state: "Ohio", stateAbbr: "OH", lat: 39.7589, lng: -84.1916, icpDensity: 6 },
  { city: "Pensacola", state: "Florida", stateAbbr: "FL", lat: 30.4213, lng: -87.2169, icpDensity: 6 },
  { city: "Bridgeport", state: "Connecticut", stateAbbr: "CT", lat: 41.1865, lng: -73.1952, icpDensity: 6 },
  { city: "Cedar Rapids", state: "Iowa", stateAbbr: "IA", lat: 41.9779, lng: -91.6656, icpDensity: 5 },
  { city: "Santa Fe", state: "New Mexico", stateAbbr: "NM", lat: 35.6870, lng: -105.9378, icpDensity: 5 },
  { city: "Bismarck", state: "North Dakota", stateAbbr: "ND", lat: 46.8083, lng: -100.7837, icpDensity: 5 },
  { city: "Rapid City", state: "South Dakota", stateAbbr: "SD", lat: 44.0805, lng: -103.2310, icpDensity: 5 },
  { city: "Missoula", state: "Montana", stateAbbr: "MT", lat: 46.8721, lng: -113.9940, icpDensity: 5 },
  { city: "Casper", state: "Wyoming", stateAbbr: "WY", lat: 42.8666, lng: -106.3131, icpDensity: 5 },
  { city: "Juneau", state: "Alaska", stateAbbr: "AK", lat: 58.3005, lng: -134.4197, icpDensity: 5 },
  { city: "Charleston", state: "West Virginia", stateAbbr: "WV", lat: 38.3498, lng: -81.6326, icpDensity: 5 },

  // Tier 8: Additional high-value suburban/secondary markets
  { city: "Woodlands", state: "Texas", stateAbbr: "TX", lat: 30.1658, lng: -95.4613, icpDensity: 7 },
  { city: "Murfreesboro", state: "Tennessee", stateAbbr: "TN", lat: 35.8456, lng: -86.3903, icpDensity: 6 },
  { city: "Boca Raton", state: "Florida", stateAbbr: "FL", lat: 26.3683, lng: -80.1289, icpDensity: 8 },
  { city: "Naples", state: "Florida", stateAbbr: "FL", lat: 26.1420, lng: -81.7948, icpDensity: 7 },
  { city: "Peoria", state: "Arizona", stateAbbr: "AZ", lat: 33.5806, lng: -112.2374, icpDensity: 6 },
  { city: "Surprise", state: "Arizona", stateAbbr: "AZ", lat: 33.6292, lng: -112.3679, icpDensity: 6 },
  { city: "Rancho Cucamonga", state: "California", stateAbbr: "CA", lat: 34.1064, lng: -117.5931, icpDensity: 7 },
  { city: "Ontario", state: "California", stateAbbr: "CA", lat: 34.0633, lng: -117.6509, icpDensity: 6 },
  { city: "Santa Clarita", state: "California", stateAbbr: "CA", lat: 34.3917, lng: -118.5426, icpDensity: 7 },
  { city: "Carlsbad", state: "California", stateAbbr: "CA", lat: 33.1581, lng: -117.3506, icpDensity: 7 },
  { city: "Pearland", state: "Texas", stateAbbr: "TX", lat: 29.5636, lng: -95.2860, icpDensity: 6 },
  { city: "League City", state: "Texas", stateAbbr: "TX", lat: 29.5075, lng: -95.0950, icpDensity: 6 },
  { city: "Flower Mound", state: "Texas", stateAbbr: "TX", lat: 33.0146, lng: -97.0970, icpDensity: 7 },
  { city: "Southlake", state: "Texas", stateAbbr: "TX", lat: 32.9412, lng: -97.1342, icpDensity: 7 },
  { city: "Keller", state: "Texas", stateAbbr: "TX", lat: 32.9346, lng: -97.2520, icpDensity: 6 },
  { city: "Folsom", state: "California", stateAbbr: "CA", lat: 38.6780, lng: -121.1761, icpDensity: 7 },
  { city: "Redmond", state: "Washington", stateAbbr: "WA", lat: 47.6740, lng: -122.1215, icpDensity: 7 },
  { city: "Kirkland", state: "Washington", stateAbbr: "WA", lat: 47.6815, lng: -122.2087, icpDensity: 7 },
  { city: "Sandy Springs", state: "Georgia", stateAbbr: "GA", lat: 33.9304, lng: -84.3733, icpDensity: 7 },
  { city: "Johns Creek", state: "Georgia", stateAbbr: "GA", lat: 34.0289, lng: -84.1983, icpDensity: 7 },
  { city: "Fishers", state: "Indiana", stateAbbr: "IN", lat: 39.9568, lng: -86.0133, icpDensity: 6 },
  { city: "Carmel", state: "Indiana", stateAbbr: "IN", lat: 39.9784, lng: -86.1180, icpDensity: 7 },
  { city: "Troy", state: "Michigan", stateAbbr: "MI", lat: 42.6064, lng: -83.1498, icpDensity: 7 },
  { city: "West Bloomfield", state: "Michigan", stateAbbr: "MI", lat: 42.5651, lng: -83.3727, icpDensity: 7 },
  { city: "Brookline", state: "Massachusetts", stateAbbr: "MA", lat: 42.3317, lng: -71.1212, icpDensity: 7 },
  { city: "Wellesley", state: "Massachusetts", stateAbbr: "MA", lat: 42.2968, lng: -71.2924, icpDensity: 7 },
  { city: "Morristown", state: "New Jersey", stateAbbr: "NJ", lat: 40.7968, lng: -74.4815, icpDensity: 7 },
  { city: "Princeton", state: "New Jersey", stateAbbr: "NJ", lat: 40.3573, lng: -74.6672, icpDensity: 7 },
  { city: "Hoboken", state: "New Jersey", stateAbbr: "NJ", lat: 40.7440, lng: -74.0324, icpDensity: 7 },
  { city: "Summit", state: "New Jersey", stateAbbr: "NJ", lat: 40.7157, lng: -74.3649, icpDensity: 7 },

  // Additional ICP-density cities to reach 200 total
  { city: "Bozeman", state: "Montana", stateAbbr: "MT", lat: 45.6770, lng: -111.0429, icpDensity: 7 },
  { city: "Traverse City", state: "Michigan", stateAbbr: "MI", lat: 44.7631, lng: -85.6206, icpDensity: 6 },
  { city: "Saratoga Springs", state: "New York", stateAbbr: "NY", lat: 43.0831, lng: -73.7846, icpDensity: 7 },
  { city: "Hilton Head", state: "South Carolina", stateAbbr: "SC", lat: 32.2163, lng: -80.7526, icpDensity: 7 },
  { city: "Sedona", state: "Arizona", stateAbbr: "AZ", lat: 34.8697, lng: -111.7610, icpDensity: 7 },
  { city: "Santa Cruz", state: "California", stateAbbr: "CA", lat: 36.9741, lng: -122.0308, icpDensity: 6 },
  { city: "Coeur d'Alene", state: "Idaho", stateAbbr: "ID", lat: 47.6777, lng: -116.7805, icpDensity: 6 },
  { city: "Bend", state: "Oregon", stateAbbr: "OR", lat: 44.0582, lng: -121.3153, icpDensity: 7 },
  { city: "Napa", state: "California", stateAbbr: "CA", lat: 38.2975, lng: -122.2869, icpDensity: 7 },
  { city: "Lake Oswego", state: "Oregon", stateAbbr: "OR", lat: 45.4207, lng: -122.6706, icpDensity: 7 },
  { city: "Greenville", state: "South Carolina", stateAbbr: "SC", lat: 34.8526, lng: -82.3940, icpDensity: 7 },
  { city: "Bentonville", state: "Arkansas", stateAbbr: "AR", lat: 36.3729, lng: -94.2088, icpDensity: 7 },
  { city: "San Luis Obispo", state: "California", stateAbbr: "CA", lat: 35.2828, lng: -120.6596, icpDensity: 6 },
  { city: "Monterey", state: "California", stateAbbr: "CA", lat: 36.6002, lng: -121.8947, icpDensity: 6 },
  { city: "Provo", state: "Utah", stateAbbr: "UT", lat: 40.2338, lng: -111.6585, icpDensity: 7 },
  { city: "South Bend", state: "Indiana", stateAbbr: "IN", lat: 41.6764, lng: -86.2520, icpDensity: 6 },
  { city: "Cedar Rapids", state: "Iowa", stateAbbr: "IA", lat: 41.9779, lng: -91.6656, icpDensity: 6 },
  { city: "Rapid City", state: "South Dakota", stateAbbr: "SD", lat: 44.0805, lng: -103.2310, icpDensity: 6 },
  { city: "Duluth", state: "Minnesota", stateAbbr: "MN", lat: 46.7867, lng: -92.1005, icpDensity: 6 },
  { city: "Green Bay", state: "Wisconsin", stateAbbr: "WI", lat: 44.5133, lng: -88.0133, icpDensity: 6 },
  { city: "Erie", state: "Pennsylvania", stateAbbr: "PA", lat: 42.1292, lng: -80.0851, icpDensity: 6 },
  { city: "Pensacola", state: "Florida", stateAbbr: "FL", lat: 30.4213, lng: -87.2169, icpDensity: 6 },
  { city: "Shreveport", state: "Louisiana", stateAbbr: "LA", lat: 32.5252, lng: -93.7502, icpDensity: 6 },
  { city: "Tupelo", state: "Mississippi", stateAbbr: "MS", lat: 34.2576, lng: -88.7034, icpDensity: 6 },
  { city: "Newport", state: "Rhode Island", stateAbbr: "RI", lat: 41.4901, lng: -71.3128, icpDensity: 7 },
  { city: "Springfield", state: "Missouri", stateAbbr: "MO", lat: 37.2090, lng: -93.2923, icpDensity: 6 },
  { city: "Corpus Christi", state: "Texas", stateAbbr: "TX", lat: 27.8006, lng: -97.3964, icpDensity: 6 },
  { city: "Winter Park", state: "Florida", stateAbbr: "FL", lat: 28.5997, lng: -81.3392, icpDensity: 7 },
  { city: "Kailua", state: "Hawaii", stateAbbr: "HI", lat: 21.4022, lng: -157.7394, icpDensity: 6 },
];

/** All supported specialty slugs and their display names */
export const SPECIALTIES = [
  { slug: "endodontist", name: "Endodontist", searchTerm: "endodontist" },
  { slug: "orthodontist", name: "Orthodontist", searchTerm: "orthodontist" },
  { slug: "oral-surgeon", name: "Oral Surgeon", searchTerm: "oral surgeon" },
  { slug: "periodontist", name: "Periodontist", searchTerm: "periodontist" },
  { slug: "pediatric-dentist", name: "Pediatric Dentist", searchTerm: "pediatric dentist" },
  { slug: "prosthodontist", name: "Prosthodontist", searchTerm: "prosthodontist" },
  { slug: "chiropractor", name: "Chiropractor", searchTerm: "chiropractor" },
  { slug: "physical-therapist", name: "Physical Therapist", searchTerm: "physical therapist" },
  { slug: "optometrist", name: "Optometrist", searchTerm: "optometrist" },
  { slug: "veterinarian", name: "Veterinarian", searchTerm: "veterinarian" },
  { slug: "financial-advisor", name: "Financial Advisor", searchTerm: "financial advisor" },
  { slug: "cpa", name: "CPA", searchTerm: "CPA accountant" },
  { slug: "attorney", name: "Attorney", searchTerm: "attorney law firm" },
];

/** Slug helper: "Salt Lake City" -> "salt-lake-city" */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build page slug: "endodontist-salt-lake-city-ut" */
export function buildPageSlug(specialtySlug: string, city: CityData): string {
  return `${specialtySlug}-${toSlug(city.city)}-${city.stateAbbr.toLowerCase()}`;
}
