'use strict';

// Wrap the CommonJS-only noVNC build so bundlers treat it correctly.
module.exports = require('@novnc/novnc/lib/rfb.js');
