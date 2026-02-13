require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const User = require('./models/User');
const { setBroadcaster, setTradeImpactHandler } = require('./stateBus');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// connect DB
connectDB();

// view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'changeme',
    resave: false,
    saveUninitialized: false
  })
);

// make session available in all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// price simulation + history
let currentPrice = 40;
let priceHistory = [
  { t: Date.now(), p: currentPrice }
];

// NEW: lock upward trend for 15 seconds after any rise
let uptrendLockUntil = 0;

function getCurrentPrice() {
  return currentPrice;
}

// build global state packet
async function buildState() {
  const users = await User.find().sort({ createdAt: 1 });
  const totalUnits = users.reduce((sum, u) => sum + (u.balanceUnits || 0), 0);
  const marketCap = Number((totalUnits * currentPrice).toFixed(2));

  const capTable = users.map(u => {
    const value = Number((u.balanceUnits * currentPrice).toFixed(2));
    const percent = totalUnits > 0 ? Number(((u.balanceUnits / totalUnits) * 100).toFixed(2)) : 0;
    return {
      id: String(u._id),
      username: u.username,
      units: u.balanceUnits,
      value,
      percent
    };
  });

  return {
    price: currentPrice,
    totalUnits,
    marketCap,
    users: capTable,
    priceHistory
  };
}

// broadcast state to all sockets
async function broadcastState() {
  const state = await buildState();
  io.emit('stateUpdate', state);
}

// register broadcaster for routes
setBroadcaster(broadcastState);

// ⭐ USER‑DRIVEN PRICE IMPACT — NO 40 CAP
async function applyTradeImpact(direction, units) {
  const userCount = await User.countDocuments();

  // Base impact: 1% per 10 units at 1 user
  const baseImpact = 0.01;
  const normalizedUnits = units / 10;

  // Stabilizer #1: More users = smaller impact
  const userStabilizer = 1 / Math.max(1, Math.sqrt(userCount || 1));

  // Stabilizer #2: Higher price = smaller % movement
  const priceStabilizer = 1 / Math.max(1, Math.log10(currentPrice));

  const stabilizer = userStabilizer * priceStabilizer;

  let delta = baseImpact * normalizedUnits * stabilizer;

  if (direction === 'sell') {
    delta = -delta;
  }

  let newPrice = currentPrice * (1 + delta);

  // ⭐ NO MORE 40 CAP — but keep a safety floor
  if (newPrice < 1) newPrice = 1;

  currentPrice = Number(newPrice.toFixed(2));

  priceHistory.push({ t: Date.now(), p: currentPrice });
  if (priceHistory.length > 10000) {
    priceHistory = priceHistory.slice(priceHistory.length - 10000);
  }

  await broadcastState();
}

// register trade impact handler
setTradeImpactHandler(applyTradeImpact);

// price tick with 60% downtrend, 35% uptrend, 5% spikes
// AND a 15-second uptrend lock after any rise
// (unchanged except cap removed)
setInterval(async () => {
  const now = Date.now();
  const r = Math.random();

  let newPrice = currentPrice;

  if (currentPrice >= 40) {
    uptrendLockUntil = 0;
  }

  const isUptrendLocked = now < uptrendLockUntil;

  if (isUptrendLocked) {
    const factor = 1 + (0.001 + Math.random() * 0.01);
    newPrice = currentPrice * factor;

  } else {
    if (r < 0.60) {
      const factor = 1 - (0.005 + Math.random() * 0.025);
      newPrice = currentPrice * factor;

    } else if (r < 0.95) {
      const factor = 1 + (0.005 + Math.random() * 0.015);
      newPrice = currentPrice * factor;
      uptrendLockUntil = now + 15000;

    } else {
      const factor = 1 + (0.10 + Math.random() * 0.30);
      newPrice = currentPrice * factor;
      uptrendLockUntil = now + 15000;
    }
  }

  // ⭐ NO MORE 40 CAP — but keep a floor
  if (newPrice < 1) newPrice = 1;

  currentPrice = Number(newPrice.toFixed(2));

  priceHistory.push({ t: Date.now(), p: currentPrice });

  if (priceHistory.length > 10000) {
    priceHistory = priceHistory.slice(priceHistory.length - 10000);
  }

  await broadcastState();
}, 5000);

// inject price getter into routers
userRoutes.setPriceRef(getCurrentPrice);
adminRoutes.setPriceRef(getCurrentPrice);

// routes
app.use(authRoutes);
app.use(userRoutes);
app.use(adminRoutes);

// home redirect
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/dashboard');
});

// socket.io connections
io.on('connection', async (socket) => {
  const state = await buildState();
  socket.emit('stateUpdate', state);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NR Silver running on http://localhost:${PORT}`);
});
