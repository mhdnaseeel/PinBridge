const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://5077a37e69c5a42a4ace47d13cd759ee@o4511118204141568.ingest.us.sentry.io/4511118218297344",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
