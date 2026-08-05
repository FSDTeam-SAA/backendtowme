import { toHebrew } from "../utils/heLocale.js";

const notFound = (req, res, next) => {
  return res.status(400).json({
    success: false,
    message: toHebrew("API Not Found !!"),
    error: "",
  });
};

export default notFound;
