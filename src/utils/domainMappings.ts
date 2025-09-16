import type { DomainMapping } from "../types/global";

export const domainMappings: DomainMapping[] = [
  // Artful
  {
    displayName: "Artful Orthodontics", //
    domain: "artfulorthodontics.com", //  domain identifier -- will be used by front-end for filtered fetching
    gsc_domainkey: "sc-domain:artfulorthodontics.com", // google search console -- ids retrievable via its api diag routes
    ga4_propertyId: "381278947", // google analytics -- ids retrievable via its api diag routes
    gbp_accountId: "114810842911950437772", // google business profile -- constant; relates to parent info@hamiltonwise account
    gbp_locationId: "10282052848626216313", // google business profile -- retrievable via its api diag routes
    clarity_projectId: "r9qqoq5h01", // microsoft clarity identifier --
    completed: true,
  },

  // Garrison
  {
    displayName: "Garrison Orthodontics",
    domain: "garrisonorthodontics.com",
    gsc_domainkey: "sc-domain:garrisonorthodontics.com",
    ga4_propertyId: "485402008",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "2137647135020773893",
    clarity_projectId: "r9diusipt9",
    completed: true,
  },

  // Popup Smiles
  {
    displayName: "PopUp Smiles",
    domain: "popupsmiles.com",
    gsc_domainkey: "sc-domain:popupsmiles.com",
    ga4_propertyId: "493224130",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: [
      "109980361235418474", // Orange
      "5986586622648158122", // Newport
      "10463143860279697678", // San Juan Capistrano
      "6880513187032015995", // Onsite Dentistry
    ],
    clarity_projectId: "rn2q3umml3",
    completed: true,
  },

  // SDC
  {
    displayName: "San Diego Center for Endodontics",
    domain: "sdcendo.com",
    gsc_domainkey: "sc-domain:sdcendo.com",
    ga4_propertyId: "479214529",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "5912015385303248759",
    clarity_projectId: "r9dek9uzos",
    completed: true,
  },

  // Surf City
  {
    displayName: "Surf City Endodontics",
    domain: "surfcityendo.com",
    gsc_domainkey: "sc-domain:surfcityendo.com",
    ga4_propertyId: "376941141",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "17129961858390020882",
    clarity_projectId: "r9quk55sy8",
    completed: true,
  },

  // HamiltonWise
  {
    displayName: "HamiltonWise",
    domain: "hamiltonwise.com",
    gsc_domainkey: "sc-domain:hamiltonwise.com",
    ga4_propertyId: "348149125",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "10763524725470331855",
    clarity_projectId: "r9qvm1skrr",
    completed: true,
  },

  // DEMR
  {
    displayName: "DentalEMR",
    domain: "dentalemr.com",
    gsc_domainkey: "sc-domain:dentalemr.com",
    ga4_propertyId: "394259846",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "9121627934732959111",
    clarity_projectId: "rbqa7tqrl5",
    completed: true,
  },

  // Caswell Orthdontics -- missing GBP
  {
    displayName: "Caswell Orthodontics",
    domain: "caswellorthodontics.com",
    gsc_domainkey: "sc-domain:caswellorthodontics.com",
    ga4_propertyId: "341429616",
    gbp_accountId: "",
    gbp_locationId: "",
    clarity_projectId: "r9qtvdfcgo",
    completed: false,
  },

  // Kent Morris -- missing GSC, GA4, Clarity
  {
    displayName: "Kent Morris Orthodontics",
    domain: "kentmorrisorthodontics.com",
    gsc_domainkey: "",
    ga4_propertyId: "",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "18158491820874104161",
    clarity_projectId: "",
    completed: false,
  },
];
