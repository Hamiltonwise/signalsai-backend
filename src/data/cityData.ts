// ICP-Density City Data for Alloro Programmatic SEO
// 200 US cities ranked by concentration of licensed specialists
// (dentists, orthodontists, endodontists, chiropractors, PTs, optometrists, veterinarians)
// Pure data file — no logic or API calls

export interface CityData {
  city: string;
  state: string;
  stateAbbr: string;
  slug: string;
  lat: number;
  lng: number;
  icpDensityRank: number;
  metro: string;
  estimatedSpecialists: number;
}

export interface SpecialtyData {
  name: string;
  slug: string;
  searchVolume: "high" | "medium" | "low";
  placesType: string;
}

export const SPECIALTIES: SpecialtyData[] = [
  { name: "Endodontist", slug: "endodontist", searchVolume: "medium", placesType: "dentist" },
  { name: "Orthodontist", slug: "orthodontist", searchVolume: "high", placesType: "dentist" },
  { name: "Chiropractor", slug: "chiropractor", searchVolume: "high", placesType: "physiotherapist" },
  { name: "Physical Therapist", slug: "physical-therapist", searchVolume: "high", placesType: "physiotherapist" },
  { name: "Optometrist", slug: "optometrist", searchVolume: "medium", placesType: "doctor" },
  { name: "Veterinarian", slug: "veterinarian", searchVolume: "high", placesType: "veterinary_care" },
  { name: "Oral Surgeon", slug: "oral-surgeon", searchVolume: "medium", placesType: "dentist" },
  { name: "Periodontist", slug: "periodontist", searchVolume: "low", placesType: "dentist" },
  { name: "Pediatric Dentist", slug: "pediatric-dentist", searchVolume: "medium", placesType: "dentist" },
  { name: "Prosthodontist", slug: "prosthodontist", searchVolume: "low", placesType: "dentist" },
];

export const CITY_DATA: CityData[] = [
  // Rank 1-10: Highest specialist density — affluent suburbs with dense specialist clusters
  { city: "Scottsdale", state: "Arizona", stateAbbr: "AZ", slug: "scottsdale", lat: 33.4942, lng: -111.9261, icpDensityRank: 1, metro: "Phoenix-Mesa-Scottsdale", estimatedSpecialists: 2850 },
  { city: "Boca Raton", state: "Florida", stateAbbr: "FL", slug: "boca-raton", lat: 26.3683, lng: -80.1289, icpDensityRank: 2, metro: "Miami-Fort Lauderdale-West Palm Beach", estimatedSpecialists: 2720 },
  { city: "Naperville", state: "Illinois", stateAbbr: "IL", slug: "naperville", lat: 41.7508, lng: -88.1535, icpDensityRank: 3, metro: "Chicago-Naperville-Elgin", estimatedSpecialists: 2680 },
  { city: "Plano", state: "Texas", stateAbbr: "TX", slug: "plano", lat: 33.0198, lng: -96.6989, icpDensityRank: 4, metro: "Dallas-Fort Worth-Arlington", estimatedSpecialists: 2640 },
  { city: "Irvine", state: "California", stateAbbr: "CA", slug: "irvine", lat: 33.6846, lng: -117.8265, icpDensityRank: 5, metro: "Los Angeles-Long Beach-Anaheim", estimatedSpecialists: 2590 },
  { city: "Alpharetta", state: "Georgia", stateAbbr: "GA", slug: "alpharetta", lat: 34.0754, lng: -84.2941, icpDensityRank: 6, metro: "Atlanta-Sandy Springs-Roswell", estimatedSpecialists: 2530 },
  { city: "Overland Park", state: "Kansas", stateAbbr: "KS", slug: "overland-park", lat: 38.9822, lng: -94.6708, icpDensityRank: 7, metro: "Kansas City", estimatedSpecialists: 2470 },
  { city: "Bethesda", state: "Maryland", stateAbbr: "MD", slug: "bethesda", lat: 38.9847, lng: -77.0947, icpDensityRank: 8, metro: "Washington-Arlington-Alexandria", estimatedSpecialists: 2450 },
  { city: "Bellevue", state: "Washington", stateAbbr: "WA", slug: "bellevue", lat: 47.6101, lng: -122.2015, icpDensityRank: 9, metro: "Seattle-Tacoma-Bellevue", estimatedSpecialists: 2410 },
  { city: "Westport", state: "Connecticut", stateAbbr: "CT", slug: "westport", lat: 41.1415, lng: -73.3579, icpDensityRank: 10, metro: "Bridgeport-Stamford-Norwalk", estimatedSpecialists: 2380 },

  // Rank 11-20
  { city: "Cherry Hill", state: "New Jersey", stateAbbr: "NJ", slug: "cherry-hill", lat: 39.9348, lng: -75.0307, icpDensityRank: 11, metro: "Philadelphia-Camden-Wilmington", estimatedSpecialists: 2350 },
  { city: "Birmingham", state: "Michigan", stateAbbr: "MI", slug: "birmingham-mi", lat: 42.5467, lng: -83.2113, icpDensityRank: 12, metro: "Detroit-Warren-Dearborn", estimatedSpecialists: 2310 },
  { city: "Edina", state: "Minnesota", stateAbbr: "MN", slug: "edina", lat: 44.8897, lng: -93.3499, icpDensityRank: 13, metro: "Minneapolis-St. Paul-Bloomington", estimatedSpecialists: 2280 },
  { city: "Coral Gables", state: "Florida", stateAbbr: "FL", slug: "coral-gables", lat: 25.7215, lng: -80.2684, icpDensityRank: 14, metro: "Miami-Fort Lauderdale-West Palm Beach", estimatedSpecialists: 2260 },
  { city: "Frisco", state: "Texas", stateAbbr: "TX", slug: "frisco", lat: 33.1507, lng: -96.8236, icpDensityRank: 15, metro: "Dallas-Fort Worth-Arlington", estimatedSpecialists: 2230 },
  { city: "Newport Beach", state: "California", stateAbbr: "CA", slug: "newport-beach", lat: 33.6189, lng: -117.9289, icpDensityRank: 16, metro: "Los Angeles-Long Beach-Anaheim", estimatedSpecialists: 2200 },
  { city: "Brookline", state: "Massachusetts", stateAbbr: "MA", slug: "brookline", lat: 42.3318, lng: -71.1212, icpDensityRank: 17, metro: "Boston-Cambridge-Newton", estimatedSpecialists: 2180 },
  { city: "Lake Oswego", state: "Oregon", stateAbbr: "OR", slug: "lake-oswego", lat: 45.4207, lng: -122.6706, icpDensityRank: 18, metro: "Portland-Vancouver-Hillsboro", estimatedSpecialists: 2150 },
  { city: "Paradise Valley", state: "Arizona", stateAbbr: "AZ", slug: "paradise-valley", lat: 33.5310, lng: -111.9425, icpDensityRank: 19, metro: "Phoenix-Mesa-Scottsdale", estimatedSpecialists: 2120 },
  { city: "Short Hills", state: "New Jersey", stateAbbr: "NJ", slug: "short-hills", lat: 40.7479, lng: -74.3257, icpDensityRank: 20, metro: "New York-Newark-Jersey City", estimatedSpecialists: 2100 },

  // Rank 21-30
  { city: "Wellesley", state: "Massachusetts", stateAbbr: "MA", slug: "wellesley", lat: 42.2968, lng: -71.2924, icpDensityRank: 21, metro: "Boston-Cambridge-Newton", estimatedSpecialists: 2070 },
  { city: "Carmel", state: "Indiana", stateAbbr: "IN", slug: "carmel", lat: 39.9784, lng: -86.1180, icpDensityRank: 22, metro: "Indianapolis-Carmel-Anderson", estimatedSpecialists: 2050 },
  { city: "The Woodlands", state: "Texas", stateAbbr: "TX", slug: "the-woodlands", lat: 30.1658, lng: -95.4613, icpDensityRank: 23, metro: "Houston-The Woodlands-Sugar Land", estimatedSpecialists: 2020 },
  { city: "Pasadena", state: "California", stateAbbr: "CA", slug: "pasadena-ca", lat: 34.1478, lng: -118.1445, icpDensityRank: 24, metro: "Los Angeles-Long Beach-Anaheim", estimatedSpecialists: 2000 },
  { city: "Greenville", state: "South Carolina", stateAbbr: "SC", slug: "greenville-sc", lat: 34.8526, lng: -82.3940, icpDensityRank: 25, metro: "Greenville-Anderson-Mauldin", estimatedSpecialists: 1980 },
  { city: "Franklin", state: "Tennessee", stateAbbr: "TN", slug: "franklin-tn", lat: 35.9251, lng: -86.8689, icpDensityRank: 26, metro: "Nashville-Davidson-Murfreesboro-Franklin", estimatedSpecialists: 1960 },
  { city: "Reston", state: "Virginia", stateAbbr: "VA", slug: "reston", lat: 38.9687, lng: -77.3411, icpDensityRank: 27, metro: "Washington-Arlington-Alexandria", estimatedSpecialists: 1940 },
  { city: "Southlake", state: "Texas", stateAbbr: "TX", slug: "southlake", lat: 32.9412, lng: -97.1342, icpDensityRank: 28, metro: "Dallas-Fort Worth-Arlington", estimatedSpecialists: 1920 },
  { city: "Sarasota", state: "Florida", stateAbbr: "FL", slug: "sarasota", lat: 27.3364, lng: -82.5307, icpDensityRank: 29, metro: "North Port-Sarasota-Bradenton", estimatedSpecialists: 1900 },
  { city: "Ridgewood", state: "New Jersey", stateAbbr: "NJ", slug: "ridgewood", lat: 40.9793, lng: -74.1166, icpDensityRank: 30, metro: "New York-Newark-Jersey City", estimatedSpecialists: 1880 },

  // Rank 31-40
  { city: "Boulder", state: "Colorado", stateAbbr: "CO", slug: "boulder", lat: 40.0150, lng: -105.2705, icpDensityRank: 31, metro: "Boulder", estimatedSpecialists: 1860 },
  { city: "Ann Arbor", state: "Michigan", stateAbbr: "MI", slug: "ann-arbor", lat: 42.2808, lng: -83.7430, icpDensityRank: 32, metro: "Ann Arbor", estimatedSpecialists: 1840 },
  { city: "Walnut Creek", state: "California", stateAbbr: "CA", slug: "walnut-creek", lat: 37.9101, lng: -122.0652, icpDensityRank: 33, metro: "San Francisco-Oakland-Hayward", estimatedSpecialists: 1820 },
  { city: "Cary", state: "North Carolina", stateAbbr: "NC", slug: "cary", lat: 35.7915, lng: -78.7811, icpDensityRank: 34, metro: "Raleigh-Cary", estimatedSpecialists: 1800 },
  { city: "West Hartford", state: "Connecticut", stateAbbr: "CT", slug: "west-hartford", lat: 41.7620, lng: -72.7420, icpDensityRank: 35, metro: "Hartford-East Hartford-Middletown", estimatedSpecialists: 1780 },
  { city: "Kirkland", state: "Washington", stateAbbr: "WA", slug: "kirkland", lat: 47.6815, lng: -122.2087, icpDensityRank: 36, metro: "Seattle-Tacoma-Bellevue", estimatedSpecialists: 1760 },
  { city: "Tysons", state: "Virginia", stateAbbr: "VA", slug: "tysons", lat: 38.9187, lng: -77.2311, icpDensityRank: 37, metro: "Washington-Arlington-Alexandria", estimatedSpecialists: 1740 },
  { city: "Winter Park", state: "Florida", stateAbbr: "FL", slug: "winter-park", lat: 28.5999, lng: -81.3392, icpDensityRank: 38, metro: "Orlando-Kissimmee-Sanford", estimatedSpecialists: 1720 },
  { city: "Hinsdale", state: "Illinois", stateAbbr: "IL", slug: "hinsdale", lat: 41.8006, lng: -87.9370, icpDensityRank: 39, metro: "Chicago-Naperville-Elgin", estimatedSpecialists: 1700 },
  { city: "Sugar Land", state: "Texas", stateAbbr: "TX", slug: "sugar-land", lat: 29.6197, lng: -95.6349, icpDensityRank: 40, metro: "Houston-The Woodlands-Sugar Land", estimatedSpecialists: 1680 },

  // Rank 41-50
  { city: "Roswell", state: "Georgia", stateAbbr: "GA", slug: "roswell-ga", lat: 34.0232, lng: -84.3616, icpDensityRank: 41, metro: "Atlanta-Sandy Springs-Roswell", estimatedSpecialists: 1660 },
  { city: "San Mateo", state: "California", stateAbbr: "CA", slug: "san-mateo", lat: 37.5585, lng: -122.2711, icpDensityRank: 42, metro: "San Francisco-Oakland-Hayward", estimatedSpecialists: 1640 },
  { city: "Chapel Hill", state: "North Carolina", stateAbbr: "NC", slug: "chapel-hill", lat: 35.9132, lng: -79.0558, icpDensityRank: 43, metro: "Durham-Chapel Hill", estimatedSpecialists: 1620 },
  { city: "Leawood", state: "Kansas", stateAbbr: "KS", slug: "leawood", lat: 38.9067, lng: -94.6169, icpDensityRank: 44, metro: "Kansas City", estimatedSpecialists: 1600 },
  { city: "Glastonbury", state: "Connecticut", stateAbbr: "CT", slug: "glastonbury", lat: 41.7123, lng: -72.6081, icpDensityRank: 45, metro: "Hartford-East Hartford-Middletown", estimatedSpecialists: 1580 },
  { city: "Chandler", state: "Arizona", stateAbbr: "AZ", slug: "chandler", lat: 33.3062, lng: -111.8413, icpDensityRank: 46, metro: "Phoenix-Mesa-Scottsdale", estimatedSpecialists: 1560 },
  { city: "Dublin", state: "Ohio", stateAbbr: "OH", slug: "dublin-oh", lat: 40.0992, lng: -83.1141, icpDensityRank: 47, metro: "Columbus", estimatedSpecialists: 1540 },
  { city: "Hoboken", state: "New Jersey", stateAbbr: "NJ", slug: "hoboken", lat: 40.7440, lng: -74.0324, icpDensityRank: 48, metro: "New York-Newark-Jersey City", estimatedSpecialists: 1520 },
  { city: "Wayzata", state: "Minnesota", stateAbbr: "MN", slug: "wayzata", lat: 44.9744, lng: -93.5066, icpDensityRank: 49, metro: "Minneapolis-St. Paul-Bloomington", estimatedSpecialists: 1500 },
  { city: "Manhattan Beach", state: "California", stateAbbr: "CA", slug: "manhattan-beach", lat: 33.8847, lng: -118.4109, icpDensityRank: 50, metro: "Los Angeles-Long Beach-Anaheim", estimatedSpecialists: 1480 },

  // Rank 51-60
  { city: "Fishers", state: "Indiana", stateAbbr: "IN", slug: "fishers", lat: 39.9568, lng: -86.0131, icpDensityRank: 51, metro: "Indianapolis-Carmel-Anderson", estimatedSpecialists: 1460 },
  { city: "Westfield", state: "New Jersey", stateAbbr: "NJ", slug: "westfield-nj", lat: 40.6590, lng: -74.3474, icpDensityRank: 52, metro: "New York-Newark-Jersey City", estimatedSpecialists: 1440 },
  { city: "Brentwood", state: "Tennessee", stateAbbr: "TN", slug: "brentwood-tn", lat: 36.0331, lng: -86.7828, icpDensityRank: 53, metro: "Nashville-Davidson-Murfreesboro-Franklin", estimatedSpecialists: 1420 },
  { city: "Laguna Beach", state: "California", stateAbbr: "CA", slug: "laguna-beach", lat: 33.5427, lng: -117.7854, icpDensityRank: 54, metro: "Los Angeles-Long Beach-Anaheim", estimatedSpecialists: 1400 },
  { city: "Fort Collins", state: "Colorado", stateAbbr: "CO", slug: "fort-collins", lat: 40.5853, lng: -105.0844, icpDensityRank: 55, metro: "Fort Collins", estimatedSpecialists: 1380 },
  { city: "Weston", state: "Florida", stateAbbr: "FL", slug: "weston-fl", lat: 26.1004, lng: -80.3998, icpDensityRank: 56, metro: "Miami-Fort Lauderdale-West Palm Beach", estimatedSpecialists: 1360 },
  { city: "Sandy Springs", state: "Georgia", stateAbbr: "GA", slug: "sandy-springs", lat: 33.9304, lng: -84.3733, icpDensityRank: 57, metro: "Atlanta-Sandy Springs-Roswell", estimatedSpecialists: 1340 },
  { city: "Palo Alto", state: "California", stateAbbr: "CA", slug: "palo-alto", lat: 37.4419, lng: -122.1430, icpDensityRank: 58, metro: "San Jose-Sunnyvale-Santa Clara", estimatedSpecialists: 1320 },
  { city: "Shaker Heights", state: "Ohio", stateAbbr: "OH", slug: "shaker-heights", lat: 41.4739, lng: -81.5373, icpDensityRank: 59, metro: "Cleveland-Elyria", estimatedSpecialists: 1300 },
  { city: "Great Neck", state: "New York", stateAbbr: "NY", slug: "great-neck", lat: 40.8007, lng: -73.7285, icpDensityRank: 60, metro: "New York-Newark-Jersey City", estimatedSpecialists: 1280 },

  // Rank 61-70
  { city: "Lexington", state: "Kentucky", stateAbbr: "KY", slug: "lexington-ky", lat: 38.0406, lng: -84.5037, icpDensityRank: 61, metro: "Lexington-Fayette", estimatedSpecialists: 1260 },
  { city: "Madison", state: "Wisconsin", stateAbbr: "WI", slug: "madison-wi", lat: 43.0731, lng: -89.4012, icpDensityRank: 62, metro: "Madison", estimatedSpecialists: 1240 },
  { city: "Ponte Vedra Beach", state: "Florida", stateAbbr: "FL", slug: "ponte-vedra-beach", lat: 30.2397, lng: -81.3856, icpDensityRank: 63, metro: "Jacksonville", estimatedSpecialists: 1220 },
  { city: "Ardmore", state: "Pennsylvania", stateAbbr: "PA", slug: "ardmore", lat: 40.0046, lng: -75.2846, icpDensityRank: 64, metro: "Philadelphia-Camden-Wilmington", estimatedSpecialists: 1200 },
  { city: "Keller", state: "Texas", stateAbbr: "TX", slug: "keller", lat: 32.9346, lng: -97.2520, icpDensityRank: 65, metro: "Dallas-Fort Worth-Arlington", estimatedSpecialists: 1180 },
  { city: "Danville", state: "California", stateAbbr: "CA", slug: "danville-ca", lat: 37.8216, lng: -121.9999, icpDensityRank: 66, metro: "San Francisco-Oakland-Hayward", estimatedSpecialists: 1160 },
  { city: "Zionsville", state: "Indiana", stateAbbr: "IN", slug: "zionsville", lat: 39.9509, lng: -86.2622, icpDensityRank: 67, metro: "Indianapolis-Carmel-Anderson", estimatedSpecialists: 1140 },
  { city: "Wilmette", state: "Illinois", stateAbbr: "IL", slug: "wilmette", lat: 42.0764, lng: -87.7228, icpDensityRank: 68, metro: "Chicago-Naperville-Elgin", estimatedSpecialists: 1120 },
  { city: "Raleigh", state: "North Carolina", stateAbbr: "NC", slug: "raleigh", lat: 35.7796, lng: -78.6382, icpDensityRank: 69, metro: "Raleigh-Cary", estimatedSpecialists: 1100 },
  { city: "West Des Moines", state: "Iowa", stateAbbr: "IA", slug: "west-des-moines", lat: 41.5772, lng: -93.7113, icpDensityRank: 70, metro: "Des Moines-West Des Moines", estimatedSpecialists: 1080 },

  // Rank 71-80
  { city: "Sammamish", state: "Washington", stateAbbr: "WA", slug: "sammamish", lat: 47.6163, lng: -122.0356, icpDensityRank: 71, metro: "Seattle-Tacoma-Bellevue", estimatedSpecialists: 1060 },
  { city: "Gilbert", state: "Arizona", stateAbbr: "AZ", slug: "gilbert", lat: 33.3528, lng: -111.7890, icpDensityRank: 72, metro: "Phoenix-Mesa-Scottsdale", estimatedSpecialists: 1040 },
  { city: "Burlingame", state: "California", stateAbbr: "CA", slug: "burlingame", lat: 37.5841, lng: -122.3660, icpDensityRank: 73, metro: "San Francisco-Oakland-Hayward", estimatedSpecialists: 1020 },
  { city: "Mt. Pleasant", state: "South Carolina", stateAbbr: "SC", slug: "mt-pleasant-sc", lat: 32.8323, lng: -79.8284, icpDensityRank: 74, metro: "Charleston-North Charleston", estimatedSpecialists: 1000 },
  { city: "Omaha", state: "Nebraska", stateAbbr: "NE", slug: "omaha", lat: 41.2565, lng: -95.9345, icpDensityRank: 75, metro: "Omaha-Council Bluffs", estimatedSpecialists: 980 },
  { city: "Boise", state: "Idaho", stateAbbr: "ID", slug: "boise", lat: 43.6150, lng: -116.2023, icpDensityRank: 76, metro: "Boise City", estimatedSpecialists: 960 },
  { city: "Johns Creek", state: "Georgia", stateAbbr: "GA", slug: "johns-creek", lat: 34.0289, lng: -84.1988, icpDensityRank: 77, metro: "Atlanta-Sandy Springs-Roswell", estimatedSpecialists: 940 },
  { city: "Livingston", state: "New Jersey", stateAbbr: "NJ", slug: "livingston-nj", lat: 40.7879, lng: -74.3151, icpDensityRank: 78, metro: "New York-Newark-Jersey City", estimatedSpecialists: 920 },
  { city: "Portland", state: "Oregon", stateAbbr: "OR", slug: "portland-or", lat: 45.5152, lng: -122.6784, icpDensityRank: 79, metro: "Portland-Vancouver-Hillsboro", estimatedSpecialists: 900 },
  { city: "Bryn Mawr", state: "Pennsylvania", stateAbbr: "PA", slug: "bryn-mawr", lat: 40.0210, lng: -75.3096, icpDensityRank: 80, metro: "Philadelphia-Camden-Wilmington", estimatedSpecialists: 880 },

  // Rank 81-90
  { city: "Nashville", state: "Tennessee", stateAbbr: "TN", slug: "nashville", lat: 36.1627, lng: -86.7816, icpDensityRank: 81, metro: "Nashville-Davidson-Murfreesboro-Franklin", estimatedSpecialists: 870 },
  { city: "Denver", state: "Colorado", stateAbbr: "CO", slug: "denver", lat: 39.7392, lng: -104.9903, icpDensityRank: 82, metro: "Denver-Aurora-Lakewood", estimatedSpecialists: 860 },
  { city: "Salt Lake City", state: "Utah", stateAbbr: "UT", slug: "salt-lake-city", lat: 40.7608, lng: -111.8910, icpDensityRank: 83, metro: "Salt Lake City", estimatedSpecialists: 850 },
  { city: "Charlotte", state: "North Carolina", stateAbbr: "NC", slug: "charlotte", lat: 35.2271, lng: -80.8431, icpDensityRank: 84, metro: "Charlotte-Concord-Gastonia", estimatedSpecialists: 840 },
  { city: "San Diego", state: "California", stateAbbr: "CA", slug: "san-diego", lat: 32.7157, lng: -117.1611, icpDensityRank: 85, metro: "San Diego-Carlsbad", estimatedSpecialists: 830 },
  { city: "Austin", state: "Texas", stateAbbr: "TX", slug: "austin", lat: 30.2672, lng: -97.7431, icpDensityRank: 86, metro: "Austin-Round Rock-San Marcos", estimatedSpecialists: 820 },
  { city: "Wilmington", state: "Delaware", stateAbbr: "DE", slug: "wilmington-de", lat: 39.7391, lng: -75.5398, icpDensityRank: 87, metro: "Philadelphia-Camden-Wilmington", estimatedSpecialists: 810 },
  { city: "Chesterfield", state: "Missouri", stateAbbr: "MO", slug: "chesterfield-mo", lat: 38.6631, lng: -90.5771, icpDensityRank: 88, metro: "St. Louis", estimatedSpecialists: 800 },
  { city: "Stamford", state: "Connecticut", stateAbbr: "CT", slug: "stamford", lat: 41.0534, lng: -73.5387, icpDensityRank: 89, metro: "Bridgeport-Stamford-Norwalk", estimatedSpecialists: 790 },
  { city: "Germantown", state: "Tennessee", stateAbbr: "TN", slug: "germantown-tn", lat: 35.0868, lng: -89.8100, icpDensityRank: 90, metro: "Memphis", estimatedSpecialists: 780 },

  // Rank 91-100
  { city: "Glenview", state: "Illinois", stateAbbr: "IL", slug: "glenview", lat: 42.0698, lng: -87.7878, icpDensityRank: 91, metro: "Chicago-Naperville-Elgin", estimatedSpecialists: 770 },
  { city: "Huntersville", state: "North Carolina", stateAbbr: "NC", slug: "huntersville", lat: 35.4107, lng: -80.8429, icpDensityRank: 92, metro: "Charlotte-Concord-Gastonia", estimatedSpecialists: 760 },
  { city: "Draper", state: "Utah", stateAbbr: "UT", slug: "draper", lat: 40.5247, lng: -111.8638, icpDensityRank: 93, metro: "Salt Lake City", estimatedSpecialists: 750 },
  { city: "Mendham", state: "New Jersey", stateAbbr: "NJ", slug: "mendham", lat: 40.7757, lng: -74.6007, icpDensityRank: 94, metro: "New York-Newark-Jersey City", estimatedSpecialists: 740 },
  { city: "La Jolla", state: "California", stateAbbr: "CA", slug: "la-jolla", lat: 32.8328, lng: -117.2713, icpDensityRank: 95, metro: "San Diego-Carlsbad", estimatedSpecialists: 730 },
  { city: "Wichita", state: "Kansas", stateAbbr: "KS", slug: "wichita", lat: 37.6872, lng: -97.3301, icpDensityRank: 96, metro: "Wichita", estimatedSpecialists: 720 },
  { city: "Reno", state: "Nevada", stateAbbr: "NV", slug: "reno", lat: 39.5296, lng: -119.8138, icpDensityRank: 97, metro: "Reno-Sparks", estimatedSpecialists: 710 },
  { city: "Tulsa", state: "Oklahoma", stateAbbr: "OK", slug: "tulsa", lat: 36.1540, lng: -95.9928, icpDensityRank: 98, metro: "Tulsa", estimatedSpecialists: 700 },
  { city: "Providence", state: "Rhode Island", stateAbbr: "RI", slug: "providence", lat: 41.8240, lng: -71.4128, icpDensityRank: 99, metro: "Providence-Warwick", estimatedSpecialists: 690 },
  { city: "Savannah", state: "Georgia", stateAbbr: "GA", slug: "savannah", lat: 32.0809, lng: -81.0912, icpDensityRank: 100, metro: "Savannah", estimatedSpecialists: 680 },

  // Rank 101-110
  { city: "Chattanooga", state: "Tennessee", stateAbbr: "TN", slug: "chattanooga", lat: 35.0456, lng: -85.3097, icpDensityRank: 101, metro: "Chattanooga", estimatedSpecialists: 670 },
  { city: "Bend", state: "Oregon", stateAbbr: "OR", slug: "bend", lat: 44.0582, lng: -121.3153, icpDensityRank: 102, metro: "Bend-Redmond", estimatedSpecialists: 660 },
  { city: "Little Rock", state: "Arkansas", stateAbbr: "AR", slug: "little-rock", lat: 34.7465, lng: -92.2896, icpDensityRank: 103, metro: "Little Rock-North Little Rock-Conway", estimatedSpecialists: 650 },
  { city: "Charleston", state: "South Carolina", stateAbbr: "SC", slug: "charleston-sc", lat: 32.7765, lng: -79.9311, icpDensityRank: 104, metro: "Charleston-North Charleston", estimatedSpecialists: 640 },
  { city: "Albuquerque", state: "New Mexico", stateAbbr: "NM", slug: "albuquerque", lat: 35.0844, lng: -106.6504, icpDensityRank: 105, metro: "Albuquerque", estimatedSpecialists: 630 },
  { city: "Santa Fe", state: "New Mexico", stateAbbr: "NM", slug: "santa-fe", lat: 35.6870, lng: -105.9378, icpDensityRank: 106, metro: "Santa Fe", estimatedSpecialists: 620 },
  { city: "Tampa", state: "Florida", stateAbbr: "FL", slug: "tampa", lat: 27.9506, lng: -82.4572, icpDensityRank: 107, metro: "Tampa-St. Petersburg-Clearwater", estimatedSpecialists: 610 },
  { city: "Sioux Falls", state: "South Dakota", stateAbbr: "SD", slug: "sioux-falls", lat: 43.5446, lng: -96.7311, icpDensityRank: 108, metro: "Sioux Falls", estimatedSpecialists: 600 },
  { city: "Richmond", state: "Virginia", stateAbbr: "VA", slug: "richmond-va", lat: 37.5407, lng: -77.4360, icpDensityRank: 109, metro: "Richmond", estimatedSpecialists: 590 },
  { city: "Fargo", state: "North Dakota", stateAbbr: "ND", slug: "fargo", lat: 46.8772, lng: -96.7898, icpDensityRank: 110, metro: "Fargo-Moorhead", estimatedSpecialists: 580 },

  // Rank 111-120
  { city: "Des Moines", state: "Iowa", stateAbbr: "IA", slug: "des-moines", lat: 41.5868, lng: -93.6250, icpDensityRank: 111, metro: "Des Moines-West Des Moines", estimatedSpecialists: 570 },
  { city: "San Antonio", state: "Texas", stateAbbr: "TX", slug: "san-antonio", lat: 29.4241, lng: -98.4936, icpDensityRank: 112, metro: "San Antonio-New Braunfels", estimatedSpecialists: 560 },
  { city: "Birmingham", state: "Alabama", stateAbbr: "AL", slug: "birmingham-al", lat: 33.5207, lng: -86.8025, icpDensityRank: 113, metro: "Birmingham-Hoover", estimatedSpecialists: 550 },
  { city: "Honolulu", state: "Hawaii", stateAbbr: "HI", slug: "honolulu", lat: 21.3069, lng: -157.8583, icpDensityRank: 114, metro: "Urban Honolulu", estimatedSpecialists: 540 },
  { city: "Missoula", state: "Montana", stateAbbr: "MT", slug: "missoula", lat: 46.8721, lng: -114.0177, icpDensityRank: 115, metro: "Missoula", estimatedSpecialists: 530 },
  { city: "Burlington", state: "Vermont", stateAbbr: "VT", slug: "burlington-vt", lat: 44.4759, lng: -73.2121, icpDensityRank: 116, metro: "Burlington-South Burlington", estimatedSpecialists: 520 },
  { city: "Jacksonville", state: "Florida", stateAbbr: "FL", slug: "jacksonville", lat: 30.3322, lng: -81.6557, icpDensityRank: 117, metro: "Jacksonville", estimatedSpecialists: 510 },
  { city: "Asheville", state: "North Carolina", stateAbbr: "NC", slug: "asheville", lat: 35.5951, lng: -82.5515, icpDensityRank: 118, metro: "Asheville", estimatedSpecialists: 500 },
  { city: "Pittsburgh", state: "Pennsylvania", stateAbbr: "PA", slug: "pittsburgh", lat: 40.4406, lng: -79.9959, icpDensityRank: 119, metro: "Pittsburgh", estimatedSpecialists: 490 },
  { city: "Milwaukee", state: "Wisconsin", stateAbbr: "WI", slug: "milwaukee", lat: 43.0389, lng: -87.9065, icpDensityRank: 120, metro: "Milwaukee-Waukesha-West Allis", estimatedSpecialists: 480 },

  // Rank 121-130
  { city: "Portland", state: "Maine", stateAbbr: "ME", slug: "portland-me", lat: 43.6591, lng: -70.2568, icpDensityRank: 121, metro: "Portland-South Portland", estimatedSpecialists: 470 },
  { city: "Louisville", state: "Kentucky", stateAbbr: "KY", slug: "louisville", lat: 38.2527, lng: -85.7585, icpDensityRank: 122, metro: "Louisville/Jefferson County", estimatedSpecialists: 460 },
  { city: "Oklahoma City", state: "Oklahoma", stateAbbr: "OK", slug: "oklahoma-city", lat: 35.4676, lng: -97.5164, icpDensityRank: 123, metro: "Oklahoma City", estimatedSpecialists: 450 },
  { city: "Concord", state: "New Hampshire", stateAbbr: "NH", slug: "concord-nh", lat: 43.2081, lng: -71.5376, icpDensityRank: 124, metro: "Concord", estimatedSpecialists: 440 },
  { city: "Anchorage", state: "Alaska", stateAbbr: "AK", slug: "anchorage", lat: 61.2181, lng: -149.9003, icpDensityRank: 125, metro: "Anchorage", estimatedSpecialists: 430 },
  { city: "Cincinnati", state: "Ohio", stateAbbr: "OH", slug: "cincinnati", lat: 39.1031, lng: -84.5120, icpDensityRank: 126, metro: "Cincinnati", estimatedSpecialists: 420 },
  { city: "Columbia", state: "South Carolina", stateAbbr: "SC", slug: "columbia-sc", lat: 34.0007, lng: -81.0348, icpDensityRank: 127, metro: "Columbia", estimatedSpecialists: 410 },
  { city: "Bozeman", state: "Montana", stateAbbr: "MT", slug: "bozeman", lat: 45.6770, lng: -111.0429, icpDensityRank: 128, metro: "Bozeman", estimatedSpecialists: 400 },
  { city: "Westlake", state: "Ohio", stateAbbr: "OH", slug: "westlake-oh", lat: 41.4553, lng: -81.9179, icpDensityRank: 129, metro: "Cleveland-Elyria", estimatedSpecialists: 390 },
  { city: "Henderson", state: "Nevada", stateAbbr: "NV", slug: "henderson-nv", lat: 36.0395, lng: -114.9817, icpDensityRank: 130, metro: "Las Vegas-Henderson-Paradise", estimatedSpecialists: 380 },

  // Rank 131-140
  { city: "Knoxville", state: "Tennessee", stateAbbr: "TN", slug: "knoxville", lat: 35.9606, lng: -83.9207, icpDensityRank: 131, metro: "Knoxville", estimatedSpecialists: 370 },
  { city: "Collierville", state: "Tennessee", stateAbbr: "TN", slug: "collierville", lat: 35.0428, lng: -89.6645, icpDensityRank: 132, metro: "Memphis", estimatedSpecialists: 365 },
  { city: "Wilmington", state: "North Carolina", stateAbbr: "NC", slug: "wilmington-nc", lat: 34.2257, lng: -77.9447, icpDensityRank: 133, metro: "Wilmington", estimatedSpecialists: 360 },
  { city: "Layton", state: "Utah", stateAbbr: "UT", slug: "layton", lat: 41.0602, lng: -111.9710, icpDensityRank: 134, metro: "Ogden-Clearfield", estimatedSpecialists: 355 },
  { city: "Springfield", state: "Missouri", stateAbbr: "MO", slug: "springfield-mo", lat: 37.2090, lng: -93.2923, icpDensityRank: 135, metro: "Springfield", estimatedSpecialists: 350 },
  { city: "Baton Rouge", state: "Louisiana", stateAbbr: "LA", slug: "baton-rouge", lat: 30.4515, lng: -91.1871, icpDensityRank: 136, metro: "Baton Rouge", estimatedSpecialists: 345 },
  { city: "New Orleans", state: "Louisiana", stateAbbr: "LA", slug: "new-orleans", lat: 29.9511, lng: -90.0715, icpDensityRank: 137, metro: "New Orleans-Metairie", estimatedSpecialists: 340 },
  { city: "Billings", state: "Montana", stateAbbr: "MT", slug: "billings", lat: 45.7833, lng: -108.5007, icpDensityRank: 138, metro: "Billings", estimatedSpecialists: 335 },
  { city: "Cheyenne", state: "Wyoming", stateAbbr: "WY", slug: "cheyenne", lat: 41.1400, lng: -104.8202, icpDensityRank: 139, metro: "Cheyenne", estimatedSpecialists: 330 },
  { city: "Darien", state: "Connecticut", stateAbbr: "CT", slug: "darien", lat: 41.0787, lng: -73.4693, icpDensityRank: 140, metro: "Bridgeport-Stamford-Norwalk", estimatedSpecialists: 325 },

  // Rank 141-150
  { city: "Norfolk", state: "Virginia", stateAbbr: "VA", slug: "norfolk", lat: 36.8508, lng: -76.2859, icpDensityRank: 141, metro: "Virginia Beach-Norfolk-Newport News", estimatedSpecialists: 320 },
  { city: "Jackson", state: "Mississippi", stateAbbr: "MS", slug: "jackson-ms", lat: 32.2988, lng: -90.1848, icpDensityRank: 142, metro: "Jackson", estimatedSpecialists: 315 },
  { city: "Hartford", state: "Connecticut", stateAbbr: "CT", slug: "hartford", lat: 41.7658, lng: -72.6734, icpDensityRank: 143, metro: "Hartford-East Hartford-Middletown", estimatedSpecialists: 310 },
  { city: "Rapid City", state: "South Dakota", stateAbbr: "SD", slug: "rapid-city", lat: 44.0805, lng: -103.2310, icpDensityRank: 144, metro: "Rapid City", estimatedSpecialists: 305 },
  { city: "Bismarck", state: "North Dakota", stateAbbr: "ND", slug: "bismarck", lat: 46.8083, lng: -100.7837, icpDensityRank: 145, metro: "Bismarck", estimatedSpecialists: 300 },
  { city: "Green Bay", state: "Wisconsin", stateAbbr: "WI", slug: "green-bay", lat: 44.5133, lng: -88.0133, icpDensityRank: 146, metro: "Green Bay", estimatedSpecialists: 295 },
  { city: "Pensacola", state: "Florida", stateAbbr: "FL", slug: "pensacola", lat: 30.4213, lng: -87.2169, icpDensityRank: 147, metro: "Pensacola-Ferry Pass-Brent", estimatedSpecialists: 290 },
  { city: "Manchester", state: "New Hampshire", stateAbbr: "NH", slug: "manchester-nh", lat: 42.9956, lng: -71.4548, icpDensityRank: 148, metro: "Manchester-Nashua", estimatedSpecialists: 285 },
  { city: "Beaverton", state: "Oregon", stateAbbr: "OR", slug: "beaverton", lat: 45.4871, lng: -122.8037, icpDensityRank: 149, metro: "Portland-Vancouver-Hillsboro", estimatedSpecialists: 280 },
  { city: "Santa Barbara", state: "California", stateAbbr: "CA", slug: "santa-barbara", lat: 34.4208, lng: -119.6982, icpDensityRank: 150, metro: "Santa Maria-Santa Barbara", estimatedSpecialists: 275 },

  // Rank 151-160
  { city: "Columbia", state: "Maryland", stateAbbr: "MD", slug: "columbia-md", lat: 39.2037, lng: -76.8610, icpDensityRank: 151, metro: "Baltimore-Columbia-Towson", estimatedSpecialists: 270 },
  { city: "Coeur d'Alene", state: "Idaho", stateAbbr: "ID", slug: "coeur-d-alene", lat: 47.6777, lng: -116.7805, icpDensityRank: 152, metro: "Coeur d'Alene", estimatedSpecialists: 265 },
  { city: "McKinney", state: "Texas", stateAbbr: "TX", slug: "mckinney", lat: 33.1972, lng: -96.6397, icpDensityRank: 153, metro: "Dallas-Fort Worth-Arlington", estimatedSpecialists: 260 },
  { city: "Las Vegas", state: "Nevada", stateAbbr: "NV", slug: "las-vegas", lat: 36.1699, lng: -115.1398, icpDensityRank: 154, metro: "Las Vegas-Henderson-Paradise", estimatedSpecialists: 255 },
  { city: "Cranberry Township", state: "Pennsylvania", stateAbbr: "PA", slug: "cranberry-township", lat: 40.6862, lng: -80.1073, icpDensityRank: 155, metro: "Pittsburgh", estimatedSpecialists: 250 },
  { city: "Folsom", state: "California", stateAbbr: "CA", slug: "folsom", lat: 38.6780, lng: -121.1761, icpDensityRank: 156, metro: "Sacramento-Roseville-Arden-Arcade", estimatedSpecialists: 245 },
  { city: "Annapolis", state: "Maryland", stateAbbr: "MD", slug: "annapolis", lat: 38.9784, lng: -76.4922, icpDensityRank: 157, metro: "Baltimore-Columbia-Towson", estimatedSpecialists: 240 },
  { city: "Bangor", state: "Maine", stateAbbr: "ME", slug: "bangor", lat: 44.8016, lng: -68.7712, icpDensityRank: 158, metro: "Bangor", estimatedSpecialists: 235 },
  { city: "Jackson Hole", state: "Wyoming", stateAbbr: "WY", slug: "jackson-hole", lat: 43.4799, lng: -110.7624, icpDensityRank: 159, metro: "Jackson", estimatedSpecialists: 230 },
  { city: "Kailua", state: "Hawaii", stateAbbr: "HI", slug: "kailua", lat: 21.4022, lng: -157.7394, icpDensityRank: 160, metro: "Urban Honolulu", estimatedSpecialists: 225 },

  // Rank 161-170
  { city: "Vestavia Hills", state: "Alabama", stateAbbr: "AL", slug: "vestavia-hills", lat: 33.4487, lng: -86.7878, icpDensityRank: 161, metro: "Birmingham-Hoover", estimatedSpecialists: 220 },
  { city: "Metairie", state: "Louisiana", stateAbbr: "LA", slug: "metairie", lat: 29.9841, lng: -90.1526, icpDensityRank: 162, metro: "New Orleans-Metairie", estimatedSpecialists: 215 },
  { city: "Fayetteville", state: "Arkansas", stateAbbr: "AR", slug: "fayetteville-ar", lat: 36.0626, lng: -94.1574, icpDensityRank: 163, metro: "Fayetteville-Springdale-Rogers", estimatedSpecialists: 210 },
  { city: "Ridgeland", state: "Mississippi", stateAbbr: "MS", slug: "ridgeland", lat: 32.4285, lng: -90.1323, icpDensityRank: 164, metro: "Jackson", estimatedSpecialists: 205 },
  { city: "Lincoln", state: "Nebraska", stateAbbr: "NE", slug: "lincoln-ne", lat: 40.8136, lng: -96.7026, icpDensityRank: 165, metro: "Lincoln", estimatedSpecialists: 200 },
  { city: "Meridian", state: "Idaho", stateAbbr: "ID", slug: "meridian-id", lat: 43.6121, lng: -116.3915, icpDensityRank: 166, metro: "Boise City", estimatedSpecialists: 195 },
  { city: "Brookfield", state: "Wisconsin", stateAbbr: "WI", slug: "brookfield-wi", lat: 43.0606, lng: -88.1065, icpDensityRank: 167, metro: "Milwaukee-Waukesha-West Allis", estimatedSpecialists: 190 },
  { city: "Springfield", state: "Illinois", stateAbbr: "IL", slug: "springfield-il", lat: 39.7817, lng: -89.6501, icpDensityRank: 168, metro: "Springfield", estimatedSpecialists: 185 },
  { city: "Hilton Head Island", state: "South Carolina", stateAbbr: "SC", slug: "hilton-head-island", lat: 32.2163, lng: -80.7526, icpDensityRank: 169, metro: "Hilton Head Island-Bluffton-Beaufort", estimatedSpecialists: 180 },
  { city: "Columbus", state: "Ohio", stateAbbr: "OH", slug: "columbus-oh", lat: 39.9612, lng: -82.9988, icpDensityRank: 170, metro: "Columbus", estimatedSpecialists: 175 },

  // Rank 171-180
  { city: "Naples", state: "Florida", stateAbbr: "FL", slug: "naples-fl", lat: 26.1420, lng: -81.7948, icpDensityRank: 171, metro: "Naples-Immokalee-Marco Island", estimatedSpecialists: 170 },
  { city: "Roseville", state: "California", stateAbbr: "CA", slug: "roseville-ca", lat: 38.7521, lng: -121.2880, icpDensityRank: 172, metro: "Sacramento-Roseville-Arden-Arcade", estimatedSpecialists: 168 },
  { city: "Cedar Rapids", state: "Iowa", stateAbbr: "IA", slug: "cedar-rapids", lat: 41.9779, lng: -91.6656, icpDensityRank: 173, metro: "Cedar Rapids", estimatedSpecialists: 165 },
  { city: "Montpelier", state: "Vermont", stateAbbr: "VT", slug: "montpelier", lat: 44.2601, lng: -72.5754, icpDensityRank: 174, metro: "Montpelier", estimatedSpecialists: 160 },
  { city: "Huntsville", state: "Alabama", stateAbbr: "AL", slug: "huntsville", lat: 34.7304, lng: -86.5861, icpDensityRank: 175, metro: "Huntsville", estimatedSpecialists: 155 },
  { city: "Rochester", state: "Minnesota", stateAbbr: "MN", slug: "rochester-mn", lat: 44.0121, lng: -92.4802, icpDensityRank: 176, metro: "Rochester", estimatedSpecialists: 150 },
  { city: "Charleston", state: "West Virginia", stateAbbr: "WV", slug: "charleston-wv", lat: 38.3498, lng: -81.6326, icpDensityRank: 177, metro: "Charleston", estimatedSpecialists: 148 },
  { city: "Peoria", state: "Arizona", stateAbbr: "AZ", slug: "peoria-az", lat: 33.5806, lng: -112.2374, icpDensityRank: 178, metro: "Phoenix-Mesa-Scottsdale", estimatedSpecialists: 145 },
  { city: "Bentonville", state: "Arkansas", stateAbbr: "AR", slug: "bentonville", lat: 36.3729, lng: -94.2088, icpDensityRank: 179, metro: "Fayetteville-Springdale-Rogers", estimatedSpecialists: 142 },
  { city: "Edmond", state: "Oklahoma", stateAbbr: "OK", slug: "edmond", lat: 35.6528, lng: -97.4781, icpDensityRank: 180, metro: "Oklahoma City", estimatedSpecialists: 140 },

  // Rank 181-190
  { city: "Provo", state: "Utah", stateAbbr: "UT", slug: "provo", lat: 40.2338, lng: -111.6585, icpDensityRank: 181, metro: "Provo-Orem", estimatedSpecialists: 138 },
  { city: "Nashua", state: "New Hampshire", stateAbbr: "NH", slug: "nashua", lat: 42.7654, lng: -71.4676, icpDensityRank: 182, metro: "Manchester-Nashua", estimatedSpecialists: 135 },
  { city: "Duluth", state: "Minnesota", stateAbbr: "MN", slug: "duluth", lat: 46.7867, lng: -92.1005, icpDensityRank: 183, metro: "Duluth", estimatedSpecialists: 132 },
  { city: "Whitefish", state: "Montana", stateAbbr: "MT", slug: "whitefish", lat: 48.4106, lng: -114.3528, icpDensityRank: 184, metro: "Kalispell", estimatedSpecialists: 130 },
  { city: "Greenville", state: "Delaware", stateAbbr: "DE", slug: "greenville-de", lat: 39.7749, lng: -75.5959, icpDensityRank: 185, metro: "Philadelphia-Camden-Wilmington", estimatedSpecialists: 128 },
  { city: "Casper", state: "Wyoming", stateAbbr: "WY", slug: "casper", lat: 42.8666, lng: -106.3131, icpDensityRank: 186, metro: "Casper", estimatedSpecialists: 125 },
  { city: "Juneau", state: "Alaska", stateAbbr: "AK", slug: "juneau", lat: 58.3005, lng: -134.4197, icpDensityRank: 187, metro: "Juneau", estimatedSpecialists: 122 },
  { city: "Grand Rapids", state: "Michigan", stateAbbr: "MI", slug: "grand-rapids", lat: 42.9634, lng: -85.6681, icpDensityRank: 188, metro: "Grand Rapids-Wyoming", estimatedSpecialists: 120 },
  { city: "Shreveport", state: "Louisiana", stateAbbr: "LA", slug: "shreveport", lat: 32.5252, lng: -93.7502, icpDensityRank: 189, metro: "Shreveport-Bossier City", estimatedSpecialists: 118 },
  { city: "Morgantown", state: "West Virginia", stateAbbr: "WV", slug: "morgantown", lat: 39.6295, lng: -79.9559, icpDensityRank: 190, metro: "Morgantown", estimatedSpecialists: 115 },

  // Rank 191-200
  { city: "Traverse City", state: "Michigan", stateAbbr: "MI", slug: "traverse-city", lat: 44.7631, lng: -85.6206, icpDensityRank: 191, metro: "Traverse City", estimatedSpecialists: 112 },
  { city: "Tupelo", state: "Mississippi", stateAbbr: "MS", slug: "tupelo", lat: 34.2576, lng: -88.7034, icpDensityRank: 192, metro: "Tupelo", estimatedSpecialists: 110 },
  { city: "Hagerstown", state: "Maryland", stateAbbr: "MD", slug: "hagerstown", lat: 39.6418, lng: -77.7200, icpDensityRank: 193, metro: "Hagerstown-Martinsburg", estimatedSpecialists: 108 },
  { city: "South Burlington", state: "Vermont", stateAbbr: "VT", slug: "south-burlington", lat: 44.4669, lng: -73.1710, icpDensityRank: 194, metro: "Burlington-South Burlington", estimatedSpecialists: 105 },
  { city: "Jonesboro", state: "Arkansas", stateAbbr: "AR", slug: "jonesboro", lat: 35.8423, lng: -90.7043, icpDensityRank: 195, metro: "Jonesboro", estimatedSpecialists: 102 },
  { city: "Eau Claire", state: "Wisconsin", stateAbbr: "WI", slug: "eau-claire", lat: 44.8113, lng: -91.4985, icpDensityRank: 196, metro: "Eau Claire", estimatedSpecialists: 100 },
  { city: "Eagle River", state: "Alaska", stateAbbr: "AK", slug: "eagle-river", lat: 61.3214, lng: -149.5686, icpDensityRank: 197, metro: "Anchorage", estimatedSpecialists: 98 },
  { city: "Minot", state: "North Dakota", stateAbbr: "ND", slug: "minot", lat: 48.2325, lng: -101.2963, icpDensityRank: 198, metro: "Minot", estimatedSpecialists: 95 },
  { city: "Maui", state: "Hawaii", stateAbbr: "HI", slug: "maui", lat: 20.7984, lng: -156.3319, icpDensityRank: 199, metro: "Kahului-Wailuku-Lahaina", estimatedSpecialists: 92 },
  { city: "Gulfport", state: "Mississippi", stateAbbr: "MS", slug: "gulfport", lat: 30.3674, lng: -89.0928, icpDensityRank: 200, metro: "Gulfport-Biloxi-Pascagoula", estimatedSpecialists: 90 },
];

// Lookup map: slug -> CityData
export const CITY_BY_SLUG: Map<string, CityData> = new Map(
  CITY_DATA.map((city) => [city.slug, city])
);
