// routes/user.js

const express = require('express');
const { ensureAuth } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const { notifyChange, notifyTrade } = require('../stateBus');

let currentPrice = 40;

const router = express.Router();

router.setPriceRef = (getPriceFn) => {
  router.getCurrentPrice = getPriceFn;
};

// GET user dashboard
router.get('/dashboard', ensureAuth, async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/admin');

  const user = await User.findById(req.session.user.id);
  const orders = await Order.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(10);

  res.render('userDashboard', {
    user,
    currentPrice: router.getCurrentPrice ? router.getCurrentPrice() : currentPrice,
    orders
  });
});

// BUY
router.post('/buy', ensureAuth, async (req, res) => {
  const amountUnits = Number(req.body.amountUnits || 0);
  if (amountUnits <= 0) return res.redirect('/dashboard');

  const price = router.getCurrentPrice ? router.getCurrentPrice() : currentPrice;

  await Order.create({
    user: req.session.user.id,
    type: 'buy',
    amountUnits,
    pricePerUnitAtRequest: price,
    status: 'pending'
  });

  // ⭐ PRICE MOVES UP IMMEDIATELY
  notifyTrade('buy', amountUnits);

  notifyChange();
  res.redirect('/dashboard');
});

// SELL
router.post('/sell', ensureAuth, async (req, res) => {
  const amountUnits = Number(req.body.amountUnits || 0);
  if (amountUnits <= 0) return res.redirect('/dashboard');

  const user = await User.findById(req.session.user.id);
  if (!user || user.balanceUnits < amountUnits) {
    return res.redirect('/dashboard');
  }

  const price = router.getCurrentPrice ? router.getCurrentPrice() : currentPrice;

  await Order.create({
    user: user._id,
    type: 'sell',
    amountUnits,
    pricePerUnitAtRequest: price,
    status: 'pending'
  });

  // ⭐ PRICE MOVES DOWN IMMEDIATELY
  notifyTrade('sell', amountUnits);

  notifyChange();
  res.redirect('/dashboard');
});

module.exports = router;
