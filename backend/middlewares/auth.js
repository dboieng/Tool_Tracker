// middlewares/auth.js — STANDALONE STAND-IN ONLY
//
// Tradies Diary has a real login (JWT) in middlewares/auth.js that puts the
// logged-in user on req.user (with organisationId and userRole).
// This stand-in does the same job for the standalone demo using one shared
// password (DASHBOARD_TOKEN in .env), so the controllers work identically.
//
// When merging: DELETE this file and use Tradies Diary's own auth.js.

import { ApiError } from "./ApiResponse.js";

export const authenticate = (req, res, next) => {
  const expected = process.env.DASHBOARD_TOKEN;
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!expected) return next(new ApiError("DASHBOARD_TOKEN is not set in .env", 500));
  if (token !== expected) return next(new ApiError("Authentication failed: wrong dashboard password", 401));

  req.user = {
    id: 0,
    organisationId: Number(process.env.ORG_ID || 1),
    userRole: 1, // SUPER_ADMIN in Tradies Diary's config/roles.js
  };
  next();
};

export default authenticate;
