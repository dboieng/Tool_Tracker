// middlewares/roleAuth.js — STANDALONE STAND-IN ONLY
// Same export name as Tradies Diary's roleAuth.js, so the route file is identical.
// When merging: DELETE this file; Tradies Diary already has the real one.

const SUPER_ADMIN = 1, ADMIN = 2, SUPERVISOR = 5;

const checkRole = (allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.userRole)) {
    return res.status(403).json({ status: 403, success: false, message: "Access denied: Insufficient permissions" });
  }
  next();
};

export const isAdminOrSuperAdminOrSupervisor = checkRole([SUPER_ADMIN, ADMIN, SUPERVISOR]);
