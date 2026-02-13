const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const { notifyChange } = require('../stateBus');

let currentPrice = 40;

const router = express.Router();

router.setPriceRef = (getPriceFn) => {
  router.getCurrentPrice = getPriceFn;
};

// GET admin dashboard
router.get('/admin', ensureAdmin, async (req, res) => {
  const pendingOrders = await Order.find({ status: 'pending' })
    .populate('user')
    .sort({ createdAt: -1 });
  const users = await User.find().sort({ createdAt: 1 });

  const totalUnits = users.reduce((sum, u) => sum + (u.balanceUnits || 0), 0);
  const marketCap = Number((totalUnits * (router.getCurrentPrice ? router.getCurrentPrice() : currentPrice)).toFixed(2));

  res.render('adminDashboard', {
    currentPrice: router.getCurrentPrice ? router.getCurrentPrice() : currentPrice,
    pendingOrders,
    users,
    totalUnits,
    marketCap
  });
});

// POST approve order
router.post('/admin/orders/:id/approve', ensureAdmin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user');
  if (!order || order.status !== 'pending') return res.redirect('/admin');

  const user = order.user;

  if (order.type === 'buy') {
    user.balanceUnits += order.amountUnits;
  } else if (order.type === 'sell') {
    if (user.balanceUnits < order.amountUnits) {
      return res.redirect('/admin');
    }
    user.balanceUnits -= order.amountUnits;
  }

  order.status = 'approved';
  await user.save();
  await order.save();

  notifyChange();
  res.redirect('/admin');
});

// POST reject order
router.post('/admin/orders/:id/reject', ensureAdmin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || order.status !== 'pending') return res.redirect('/admin');

  order.status = 'rejected';
  await order.save();

  notifyChange();
  res.redirect('/admin');
});

// POST admin add crypto directly to user
router.post('/admin/users/:id/add', ensureAdmin, async (req, res) => {
  const amountUnits = Number(req.body.amountUnits || 0);
  if (amountUnits <= 0) return res.redirect('/admin');

  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin');

  user.balanceUnits += amountUnits;
  await user.save();

  notifyChange();
  res.redirect('/admin');
});

// POST admin subtract crypto from user
router.post('/admin/users/:id/subtract', ensureAdmin, async (req, res) => {
  const amountUnits = Number(req.body.amountUnits || 0);
  if (amountUnits <= 0) return res.redirect('/admin');

  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin');

  if (user.balanceUnits < amountUnits) {
    return res.redirect('/admin');
  }

  user.balanceUnits -= amountUnits;
  await user.save();

  notifyChange();
  res.redirect('/admin');
});

module.exports = router;
