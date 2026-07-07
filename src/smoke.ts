#!/usr/bin/env node

import { quickbooksClient } from "./clients/quickbooks-client.js";

async function main() {
  const quickbooks = await quickbooksClient.authenticate();
  const companyId = process.env.QUICKBOOKS_REALM_ID;

  await new Promise<void>((resolve, reject) => {
    quickbooks.getCompanyInfo(companyId || "", (err: any, companyInfo: any) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(JSON.stringify({
        ok: true,
        environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox",
        companyName: companyInfo?.CompanyName || companyInfo?.CompanyInfo?.CompanyName || null,
        realmId: companyId ? "set" : "empty",
      }));
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
