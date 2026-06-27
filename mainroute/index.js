import express from "express";

import authRoute from "../route/auth.route.js";
import driverRoute from "../route/driver.route.js";
import tripRoute from "../route/trip.route.js";
import customerRoute from "../route/customer.route.js";
import supportRoute from "../route/support.route.js";
import analyticsRoute from "../route/analytics.route.js";
import notificationRoute from "../route/notification.route.js";

const router = express.Router();

router.use("/auth", authRoute);
router.use("/drivers", driverRoute);
router.use("/trips", tripRoute);
router.use("/customers", customerRoute);
router.use("/support", supportRoute);
router.use("/analytics", analyticsRoute);
router.use("/notifications", notificationRoute);

export default router;
