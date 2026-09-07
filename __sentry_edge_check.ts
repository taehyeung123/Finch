import * as Sentry from "@sentry/nextjs";
const x = Sentry.winterCGFetchIntegration({ breadcrumbs: false });
console.log(x);
