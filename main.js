const miscRequests = require('./src/miscRequests');
const Client = require('./src/client');
const BuiltInIndicator = require('./src/classes/BuiltInIndicator');
const PineIndicator = require('./src/classes/PineIndicator');
const PinePermManager = require('./src/classes/PinePermManager');
const klineService = require('./src/klineService');
const klineStrategySignals = require('./src/klineStrategySignals');
const notificationService = require('./src/notificationService');
const { startKlineWebPanel } = require('./src/klineWebPanelServer');

module.exports = {
  ...miscRequests,
  ...klineService,
  ...klineStrategySignals,
  ...notificationService,
};
module.exports.Client = Client;
module.exports.BuiltInIndicator = BuiltInIndicator;
module.exports.PineIndicator = PineIndicator;
module.exports.PinePermManager = PinePermManager;
module.exports.startKlineWebPanel = startKlineWebPanel;
