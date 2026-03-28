import express from "express";
import rateLimit from "express-rate-limit";
import {
  autocomplete,
  getPlaceDetails,
  quickSearch,
} from "../controllers/places/PlacesController";

const placesRoutes = express.Router();

const placesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please wait before trying again.",
  },
});

placesRoutes.post("/autocomplete", placesLimiter, autocomplete);
placesRoutes.get("/:placeId", placesLimiter, getPlaceDetails);
placesRoutes.post("/search", placesLimiter, quickSearch);

export default placesRoutes;
