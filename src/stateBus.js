// stateBus.js

let broadcaster = null;
let tradeImpactHandler = null;

function setBroadcaster(fn) {
  broadcaster = fn;
}

function notifyChange() {
  if (broadcaster) {
    broadcaster();
  }
}

function setTradeImpactHandler(fn) {
  tradeImpactHandler = fn;
}

function notifyTrade(direction, units) {
  if (tradeImpactHandler) {
    tradeImpactHandler(direction, units);
  }
}

module.exports = {
  setBroadcaster,
  notifyChange,
  setTradeImpactHandler,
  notifyTrade
};
