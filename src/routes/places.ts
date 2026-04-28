import express from "express";
import {
  autocomplete,
  getPlaceDetails,
  quickSearch,
} from "../controllers/places/PlacesController";
import {
  placesAutocompleteLimiter,
  placesDetailsLimiter,
  placesSearchLimiter,
} from "../middleware/publicRateLimiter";

const placesRoutes = express.Router();

placesRoutes.post("/autocomplete", placesAutocompleteLimiter, autocomplete);
placesRoutes.get("/:placeId", placesDetailsLimiter, getPlaceDetails);
placesRoutes.post("/search", placesSearchLimiter, quickSearch);

export default placesRoutes;
