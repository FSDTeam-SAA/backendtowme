import express from "express";
import { reverseGeocode, searchLocations } from "../controller/location.controller.js";

const router = express.Router();

router.get("/search", searchLocations);
router.get("/reverse", reverseGeocode);

export default router;
