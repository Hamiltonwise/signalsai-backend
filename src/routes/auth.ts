import express from "express";
import { domainMappings } from "../utils/domainMappings";
const authRoutes = express.Router();

authRoutes.get("/returnEligibleDomains", function (req, res) {
  const eligibleDomains = domainMappings.filter(
    (domain) => domain.completed === true
  );
  res.json(eligibleDomains);
});

export default authRoutes;
