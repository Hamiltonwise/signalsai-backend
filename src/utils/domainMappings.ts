import type { DomainMapping } from "../types/global";

export const domainMappings: DomainMapping[] = [
  {
    domain: "artfulorthodontics.com", //  domain identifier -- will be used by front-end for filtered fetching
    displayName: "Artful Orthodontics", //
    gsc_domainkey: "sc-domain:artfulorthodontics.com", // google search console -- ids retrievable via its api diag routes
    ga4_propertyId: "381278947", // google analytics -- ids retrievable via its api diag routes
    gbp_accountId: "114810842911950437772", // google business profile -- constant; relates to parent info@hamiltonwise account
    gbp_locationId: "10282052848626216313", // google business profile -- retrievable via its api diag routes
    clarity_projectId: "r9qqoq5h01", // microsoft clarity identifier --
  },
];
