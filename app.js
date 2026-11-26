'use strict';

// Passenger can load this CommonJS entry after both workspaces have been built.
process.env.NODE_ENV = 'production';
require('./server/dist/index.js');
