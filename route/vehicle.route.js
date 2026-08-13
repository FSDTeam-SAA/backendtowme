import express from "express";
import {
  getManufacturers,
  getModels,
} from "../controller/vehicle.controller.js";

const router = express.Router();

router.get("/manufacturers", getManufacturers);
router.get("/models", getModels);

export default router;
