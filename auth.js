const jwt = require("jsonwebtoken");

const SECRET = "super-secret-jwt-key-for-dashboard-backend-change-me-2026";

// 🔐 AUTHENTICATION (401)
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, SECRET, {
      algorithms: ["HS384"]
    }); //hs256ot mondtak ez, nem tom, decodeolásnál 384 van jelentsen is bármit

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = {
  authenticateToken,
};
