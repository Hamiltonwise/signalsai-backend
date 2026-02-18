import express from "express";
import {
  autocomplete,
  getPlaceDetails,
  quickSearch,
} from "../controllers/places/PlacesController";

const placesRoutes = express.Router();

placesRoutes.post("/autocomplete", autocomplete);
placesRoutes.get("/:placeId", getPlaceDetails);
placesRoutes.post("/search", quickSearch);

export default placesRoutes;
