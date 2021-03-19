const _ = require("lodash");
const { sanitizeEntity } = require("strapi-utils");
const crypto = require("crypto");

const twilio = {
  id: process.env.TWILIO_ID,
  token: process.env.TWILIO_TOKEN,
  phone: process.env.TWILIO_PHONE,
};

const smsClient = require("twilio")(twilio.id, twilio.token);

const phoneRegexExp = /^\+(?:[0-9] ?){6,14}[0-9]$/;
const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const formatError = (error) => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || "local";
    const params = ctx.request.body;

    const store = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    if (provider === "local") {
      if (!_.get(await store.get({ key: "grant" }), "email.enabled")) {
        return ctx.badRequest(null, "This provider is disabled.");
      }

      // The identifier is required.
      if (!params.identifier) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.email.provide",
            message: "Please provide your mobile number or your e-mail.",
          })
        );
      }

      // The password is required.
      if (!params.password) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.password.provide",
            message: "Please provide your password.",
          })
        );
      }

      const query = { provider };

      // Check if the provided identifier is an email or not.
      const isEmail = emailRegExp.test(params.identifier);
      const isPhone = phoneRegexExp.test(params.identifier);

      // Set the identifier to the appropriate query field.
      if (isEmail) {
        query.email = params.identifier.toLowerCase();
      } else if (isPhone) {
        query.phone = params.identifier;
      } else {
        query.username = params.identifier;
      }

      // Check if the user exists.
      const user = await strapi
        .query("user", "users-permissions")
        .findOne(query);

      if (!user) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.invalid",
            message: "Identifier or password invalid.",
          })
        );
      }

      if (
        _.get(await store.get({ key: "advanced" }), "email_confirmation") &&
        user.confirmed !== true
      ) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.confirmed",
            message: "Your account email is not confirmed",
          })
        );
      }

      if (user.blocked === true) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.blocked",
            message: "Your account has been blocked by an administrator",
          })
        );
      }

      // The user never authenticated with the `local` provider.
      if (!user.password) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.password.local",
            message:
              "This user never set a local password, please login with the provider used during account creation.",
          })
        );
      }

      const validPassword = await strapi.plugins[
        "users-permissions"
      ].services.user.validatePassword(params.password, user.password);

      if (!validPassword) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.invalid",
            message: "Identifier or password invalid.",
          })
        );
      } else {
        ctx.send({
          jwt: strapi.plugins["users-permissions"].services.jwt.issue({
            id: user.id,
          }),
          user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
            model: strapi.query("user", "users-permissions").model,
          }),
        });
      }
    } else {
      if (!_.get(await store.get({ key: "grant" }), [provider, "enabled"])) {
        return ctx.badRequest(
          null,
          formatError({
            id: "provider.disabled",
            message: "This provider is disabled.",
          })
        );
      }

      // Connect the user with the third-party provider.
      let user, error;
      try {
        [user, error] = await strapi.plugins[
          "users-permissions"
        ].services.providers.connect(provider, ctx.query);
      } catch ([user, error]) {
        return ctx.badRequest(null, error === "array" ? error[0] : error);
      }

      if (!user) {
        return ctx.badRequest(null, error === "array" ? error[0] : error);
      }

      ctx.send({
        jwt: strapi.plugins["users-permissions"].services.jwt.issue({
          id: user.id,
        }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query("user", "users-permissions").model,
        }),
      });
    }
  },

  async forgotPassword(ctx) {
    let { email, phone, hash } = ctx.request.body;

    if (email) {
      // Check if the provided email is valid or not.
      const isEmail = emailRegExp.test(email);

      if (isEmail) {
        email = email.toLowerCase();
      } else {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.email.format",
            message: "Please provide valid email address.",
          })
        );
      }
    }
    if (phone) {
      const isPhone = phoneRegexExp.test(phone);

      if (!isPhone) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.email.format",
            message: "Please provide valid phone number.",
          })
        );
      }
    }

    const pluginStore = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    let user;
    // Find the user by email.
    if (email) {
      user = await strapi
        .query("user", "users-permissions")
        .findOne({ email: email.toLowerCase() });
    }

    if (phone) {
      user = await strapi.query("user", "users-permissions").findOne({ phone });
    }

    // User not found.
    if (!user) {
      if (email) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.user.not-exist",
            message: "This email does not exist.",
          })
        );
      }
      if (phone) {
        return ctx.badRequest(
          null,
          formatError({
            id: "Auth.form.error.user.not-exist",
            message: "This phone number does not exist.",
          })
        );
      }
    }

    // Generate random token.
    let resetPasswordToken = "";
    if (email) {
      resetPasswordToken = crypto.randomBytes(64).toString("hex");
    }
    if (phone) {
      resetPasswordToken = Math.floor(Math.random() * 9000) + 1000;
    }

    const settings = await pluginStore
      .get({ key: "email" })
      .then((storeEmail) => {
        try {
          return storeEmail["reset_password"].options;
        } catch (error) {
          return {};
        }
      });

    const advanced = await pluginStore.get({
      key: "advanced",
    });

    const userInfo = sanitizeEntity(user, {
      model: strapi.query("user", "users-permissions").model,
    });

    settings.message = await strapi.plugins[
      "users-permissions"
    ].services.userspermissions.template(settings.message, {
      URL: advanced.email_reset_password,
      USER: userInfo,
      TOKEN: resetPasswordToken,
    });

    settings.object = await strapi.plugins[
      "users-permissions"
    ].services.userspermissions.template(settings.object, {
      USER: userInfo,
    });

    try {
      // Send an email to the user.
      if (email) {
        await strapi.plugins["email"].services.email.send({
          to: user.email,
          from:
            settings.from.email || settings.from.name
              ? `${settings.from.name} <${settings.from.email}>`
              : undefined,
          replyTo: settings.response_email,
          subject: settings.object,
          text: settings.message,
          html: settings.message,
        });
      }
      if (phone) {
        const confirmationSMSToken = Math.floor(Math.random() * 9000) + 1000;
        await smsClient.messages.create({
          to: user.phone,
          from: twilio.phone,
          body: `Your reset password verification code is ${resetPasswordToken} ${hash}`,
        });
      }
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    // Update the user.
    await strapi
      .query("user", "users-permissions")
      .update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async registerPhone(ctx) {
    const pluginStore = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    const settings = await pluginStore.get({
      key: "advanced",
    });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.advanced.allow_register",
          message: "Register action is currently disabled.",
        })
      );
    }

    const hash = ctx.request.body.hash;

    const params = {
      ..._.omit(ctx.request.body, [
        "confirmed",
        "confirmationSMSToken",
        "resetPasswordToken",
        "hash",
      ]),
      provider: "local",
    };

    // Password is required.
    if (!params.password) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.password.provide",
          message: "Please provide your password.",
        })
      );
    }

    // Phone is required.
    if (!params.phone) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.phone.provide",
          message: "Please provide your phone.",
        })
      );
    }

    // Throw an error if the password selected by the user
    // contains more than three times the symbol '$'.
    if (
      strapi.plugins["users-permissions"].services.user.isHashed(
        params.password
      )
    ) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.password.format",
          message:
            "Your password cannot contain more than three times the symbol `$`.",
        })
      );
    }

    const role = await strapi
      .query("role", "users-permissions")
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.role.notFound",
          message: "Impossible to find the default role.",
        })
      );
    }

    // Check if the provided phone is valid or not.
    const isPhone = phoneRegexExp.test(params.phone);

    if (!isPhone) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.phone.format",
          message: "Please provide valid phone address.",
        })
      );
    }

    params.role = role.id;
    params.password = await strapi.plugins[
      "users-permissions"
    ].services.user.hashPassword(params);

    const user = await strapi.query("user", "users-permissions").findOne({
      phone: params.phone,
    });


    if (user && user.provider === params.provider) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.phone.taken",
          message: "Phone is already taken.",
        })
      );
    }

    if (user && user.provider !== params.provider && settings.unique_email) {
      return ctx.badRequest(
        null,
        formatError({
          id: "Auth.form.error.phone.taken",
          message: "Phone is already taken.",
        })
      );
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi
        .query("user", "users-permissions")
        .create(params);

      const sanitizedUser = sanitizeEntity(user, {
        model: strapi.query("user", "users-permissions").model,
      });

      if (settings.email_confirmation) {
        try {
          await strapi.plugins[
            "users-permissions"
          ].services.user.sendConfirmationSMS(user, hash);
        } catch (err) {
        console.log(err);
          return ctx.badRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = strapi.plugins["users-permissions"].services.jwt.issue(
        _.pick(user, ["id"])
      );

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } catch (err) {
      console.log(err);
      const adminError = _.includes(err.message, "username")
        ? {
            id: "Auth.form.error.username.taken",
            message: "Username already taken",
          }
        : { id: "Auth.form.error.phone.taken", message: "Phone already taken" };

      ctx.badRequest(null, formatError(adminError));
    }
  },

  async smsConfirmation(ctx) {
    const { confirmation: confirmationSMSToken } = ctx.query;

    const { user: userService, jwt: jwtService } = strapi.plugins[
      "users-permissions"
    ].services;

    if (_.isEmpty(confirmationSMSToken)) {
      return ctx.badRequest("token.invalid");
    }

    const user = await userService.fetch({ confirmationSMSToken }, []);

    if (!user) {
      return ctx.badRequest("token.invalid");
    }

    await userService.edit(
      { id: user.id },
      { confirmed: true, confirmationSMSToken: null }
    );

    ctx.send({
      jwt: jwtService.issue({ id: user.id }),
      user: sanitizeEntity(user, {
        model: strapi.query("user", "users-permissions").model,
      }),
    });
  },
};
