"use strict";

/**
 * Module dependencies.
 */

// Public node modules.
const _ = require("lodash");
const request = require("request");

// Purest strategies.
const purest = require("purest")({ request });
const purestConfig = require("@purest/providers");
const { getAbsoluteServerUrl } = require("strapi-utils");

/**
 * Connect thanks to a third-party provider.
 *
 *
 * @param {String}    provider
 * @param {String}    access_token
 *
 * @return  {*}
 */

const connect = (provider, query) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  return new Promise((resolve, reject) => {
    if (!access_token) {
      return reject([null, { message: "No access_token." }]);
    }

    // Get the profile.
    getProfile(provider, query, async (err, profile) => {
      if (err) {
        return reject([null, err]);
      }

      // We need at least the mail.
      if (!profile.email) {
        return reject([null, { message: "Email was not available." }]);
      }

      try {
        const users = await strapi.query("user", "users-permissions").find({
          email: profile.email,
        });

        const advanced = await strapi
          .store({
            environment: "",
            type: "plugin",
            name: "users-permissions",
            key: "advanced",
          })
          .get();

        const user = _.find(users, { provider });

        if (_.isEmpty(user) && !advanced.allow_register) {
          return resolve([
            null,
            [{ messages: [{ id: "Auth.advanced.allow_register" }] }],
            "Register action is actualy not available.",
          ]);
        }

        if (!_.isEmpty(user)) {
          return resolve([user, null]);
        }
        
        if (
          !_.isEmpty(_.find(users, (user) => user.provider !== provider)) &&
          advanced.unique_email
        ) {
          return resolve([
            null,
            [{ messages: [{ id: "Auth.form.error.email.taken" }] }],
            "Email is already taken.",
          ]);
        }

        // Retrieve default role.
        const defaultRole = await strapi
          .query("role", "users-permissions")
          .findOne({ type: advanced.default_role }, []);

        // Create the new user.
        const params = _.assign(profile, {
          provider: provider,
          role: defaultRole.id,
          confirmed: true,
        });

        const createdUser = await strapi
          .query("user", "users-permissions")
          .create(params);

        return resolve([createdUser, null]);
      } catch (err) {
        reject([null, err]);
      }
    });
  });
};

/**
 * Helper to get profiles
 *
 * @param {String}   provider
 * @param {Function} callback
 */

const getProfile = async (provider, query, callback) => {
  const access_token = query.access_token || query.code || query.oauth_token;

  switch (provider) {
    case "google": {
      const google = purest({ provider: "google", config: purestConfig });

      google
        .query("oauth")
        .get("tokeninfo")
        .qs({ id_token: access_token })
        .request((err, res, body) => {
          if (err) {
            callback(err);
          } else {
            callback(null, {
              username: body.email.split("@")[0],
              email: body.email,
            });
          }
        });
      break;
    }
    case 'facebook': {
      const facebook = purest({
        provider: 'facebook',
        config: purestConfig,
      });

      facebook
        .query()
        .get('me?fields=name,email')
        .auth(access_token)
        .request((err, res, body) => {
          if (err) {
            callback(err);
          } else {
            callback(null, {
              username: body.name,
              email: body.email,
            });
          }
        });
      break;
    }
    default:
      callback(new Error("Unknown provider."));
      break;
  }
};

const buildRedirectUri = (provider = "") =>
  `${getAbsoluteServerUrl(strapi.config)}/connect/${provider}/callback`;

module.exports = {
  connect,
  buildRedirectUri,
};
