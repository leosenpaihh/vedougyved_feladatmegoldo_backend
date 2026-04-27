const jwt = require("jsonwebtoken");
require('dotenv').config({ path: './.env' });

const secret = process.env.SECRET;

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
    const decoded = jwt.verify(token, Buffer.from(secret,"base64"));
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = {
  authenticateToken,
};
