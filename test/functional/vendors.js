'use strict';

import Services from '../Services';

require('longjohn');
const _ = require('lodash');
const axios = require('axios');
const expect = require('unexpected');
const mysql = require('mysql');
const Promise = require('bluebird');
const env = require('../../lib/env').load();

Promise.promisifyAll(mysql);
Promise.promisifyAll(require('mysql/lib/Connection').prototype);

const services = new Services(env);

const rds = mysql.createConnection({
  host: process.env.FUNC_RDS_HOST,
  port: process.env.FUNC_RDS_PORT,
  user: process.env.FUNC_RDS_USER,
  password: process.env.FUNC_RDS_PASSWORD,
  database: process.env.FUNC_RDS_DATABASE,
  ssl: process.env.FUNC_RDS_SSL,
  multipleStatements: true,
});
const userPool = services.getUserPool();

const userEmail = `u${Date.now()}@keboola.com`;
const vendor = process.env.FUNC_VENDOR;
const vendor1 = `T.vendor.${Date.now()}`;
let token;

describe('Vendors', () => {
  before(() =>
    userPool.updateUserAttribute(process.env.FUNC_USER_EMAIL, 'profile', vendor)
      .then(() => axios({
        method: 'post',
        url: `${env.API_ENDPOINT}/auth/login`,
        responseType: 'json',
        data: {
          email: process.env.FUNC_USER_EMAIL,
          password: process.env.FUNC_USER_PASSWORD,
        },
      }))
      .then((res) => {
        expect(res.status, 'to be', 200);
        expect(res.data, 'to have key', 'token');
        token = res.data.token;
      })
      .then(() => rds.queryAsync(
        'INSERT IGNORE INTO `vendors` SET id=?, name=?, address=?, email=?, isPublic=?',
        [vendor1, 'test', 'test', process.env.FUNC_USER_EMAIL, 0],
      ))
      .then(() => userPool.listUsersForVendor(vendor))
      .then((data) => {
        _.each(data, (user) => {
          if (user.email !== process.env.FUNC_USER_EMAIL) {
            userPool.deleteUser(user.email);
          }
        });
      }));

  const vendorName = `vendor.${Date.now()}`;
  it('Create vendor', () =>
    expect(axios({
      method: 'post',
      url: `${env.API_ENDPOINT}/vendors`,
      headers: { Authorization: token },
      responseType: 'json',
      data: {
        name: vendorName,
        address: 'test',
        email: 'test@test.com',
      },
    }), 'to be fulfilled')
    // Check database
      .then(() => rds.queryAsync('SELECT * FROM `vendors` WHERE name=?', [vendorName]))
      .then((res) => {
        expect(res, 'to have length', 1);
        expect(res[0].id, 'to begin with', '_v');
        expect(res[0].isApproved, 'to be', 0);
        return res[0].id;
      })
      .then(vendorId => userPool.getUser(process.env.FUNC_USER_EMAIL)
        .then((user) => {
          expect(user, 'to have key', 'vendors');
          expect(user.vendors, 'to contain', vendorId);
        })
      ));

  it('Join and remove from vendor', () =>
    expect(axios({
      method: 'post',
      url: `${env.API_ENDPOINT}/vendors/${vendor1}/users`,
      headers: { Authorization: token },
      responseType: 'json',
    }), 'to be fulfilled')
      .then(() => userPool.getUser(process.env.FUNC_USER_EMAIL))
      .then((user) => {
        expect(user, 'to have key', 'vendors');
        expect(user.vendors, 'to contain', vendor1);
      })
      .then(() => axios({
        method: 'post',
        url: `${env.API_ENDPOINT}/auth/login`,
        responseType: 'json',
        data: {
          email: process.env.FUNC_USER_EMAIL,
          password: process.env.FUNC_USER_PASSWORD,
        },
      }))
      .then((res) => {
        expect(res.status, 'to be', 200);
        expect(res.data, 'to have key', 'token');
        token = res.data.token;
      })
      // Remove from vendor
      .then(() => expect(axios({
        method: 'delete',
        url: `${env.API_ENDPOINT}/vendors/${vendor1}/users/${process.env.FUNC_USER_EMAIL}`,
        headers: { Authorization: token },
        responseType: 'json',
      }), 'to be fulfilled'))
      .then(() => userPool.getUser(process.env.FUNC_USER_EMAIL))
      .then((user) => {
        expect(user, 'to have key', 'vendors');
        expect(user.vendors, 'not to contain', vendor1);
      }));

  it('Invite user', () =>
    // 1) Signup
    expect(axios({
      method: 'post',
      url: `${env.API_ENDPOINT}/auth/signup`,
      responseType: 'json',
      data: {
        email: userEmail,
        password: 'uiOU.-jfdksfj88',
        name: 'Test',
      },
    }), 'to be fulfilled')
    // 2) Invite
      .then(() => expect(axios({
        method: 'post',
        url: `${env.API_ENDPOINT}/vendors/${vendor}/invitations/${userEmail}`,
        headers: { Authorization: token },
        responseType: 'json',
      }), 'to be fulfilled'))
      // 3) Check existence in db and get code
      .then(() => rds.queryAsync('SELECT * FROM `invitations` WHERE vendor=? AND email=?', [vendor, userEmail]))
      .then((res) => {
        expect(res, 'to have length', 1);
        return res[0].code;
      })
      // 4) Accept invitation
      .then(code => expect(axios({
        method: 'get',
        url: `${env.API_ENDPOINT}/vendors/${vendor}/invitations/${userEmail}/${code}`,
      }), 'to be fulfilled'))
      // 5) Check vendor in cognito
      .then(() => userPool.getUser(userEmail))
      .then((user) => {
        expect(user, 'to have key', 'vendors');
        expect(user.vendors, 'to contain', vendor);
      }));

  it('Create service user, list and delete', () =>
    expect(axios({
      method: 'post',
      url: `${env.API_ENDPOINT}/vendors/${vendor}/credentials`,
      headers: { Authorization: token },
      responseType: 'json',
      data: {
        name: 'test',
        description: 'Test desc',
      },
    }), 'to be fulfilled')
      .then(() => axios({
        method: 'get',
        url: `${env.API_ENDPOINT}/vendors/${vendor}/users`,
        headers: { Authorization: token },
        responseType: 'json',
      }))
      .then((res) => {
        expect(res.data, 'to have an item satisfying',
          { name: 'Service test', email: `${vendor}+test`, description: 'Test desc' });
      })
  );

  after(() =>
    rds.queryAsync('DELETE FROM `invitations` WHERE vendor=? AND email=?', [vendor, userEmail])
  );
});
