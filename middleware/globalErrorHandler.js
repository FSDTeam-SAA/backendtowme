import handleValidationError from "../errors/handleValidationError.js";
import HandleCastError from "../errors/HandleCastError.js";
import handleDuplicateError from "../errors/handleDuplicateError.js";
import AppError from "./../errors/AppError.js";
import { toHebrew } from "../utils/heLocale.js";

const globalErrorHandler = (err, req, res, next) => {
  console.log({ GlobalError: err });
  let statusCode = 500;
  let message = err.message;
  let errorSources = [
    {
      path: "",
      message: err.message,
    },
  ];

  if (err?.name === "ValidationError") {
    const simplifiedError = handleValidationError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err?.name === "CastError") {
    const simplifiedError = HandleCastError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err?.code === 11000) {
    const simplifiedError = handleDuplicateError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err instanceof AppError) {
    statusCode = err?.statusCode;
    message = err.message;
    errorSources = [
      {
        path: "",
        message: err?.message,
      },
    ];
  }

  message = toHebrew(message);
  errorSources = (errorSources || []).map((s) => ({
    ...s,
    message: toHebrew(s?.message),
  }));

  // Internals stay server-side in production: stack traces expose file paths
  // and code structure to anyone who can trigger an error.
  const isProduction = process.env.NODE_ENV === "production";

  return res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    ...(isProduction ? {} : { err, stack: err?.stack || null }),
  });
};

export default globalErrorHandler;
