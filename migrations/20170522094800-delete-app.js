'use strict';

const migrate = require('../scripts/migrate-sql');

exports.up = db => migrate.migrate(db, '20170522094800-delete-app.sql');
