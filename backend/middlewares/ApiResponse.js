// middlewares/ApiResponse.js
// Same response helpers as Tradies Diary (trimmed copy) so the controllers
// can be moved into the main backend unchanged.

export const errorHandler = (err, req, res, next) => {
  const status = err?.status || 500;
  const message = err?.message || "Something went wrong";
  return res.status(status).json({ status, success: false, message });
};

export class ApiError extends Error {
  constructor(message = "Something went wrong", status = 500) {
    super(message);
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const SuccessResponse = (res, data = null, message = "Success", status = 200) => {
  return res.status(status).json({ status, success: true, message, data });
};
